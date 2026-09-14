import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/server/http";
import { fetchAllRows } from "../../src/server/fetch-all-rows";

describe("fetchAllRows", () => {
  it("agrega múltiplas páginas até esgotar", async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => ({ id: i })),
      Array.from({ length: 1000 }, (_, i) => ({ id: 1000 + i })),
      Array.from({ length: 42 }, (_, i) => ({ id: 2000 + i })),
    ];
    let calls = 0;

    const rows = await fetchAllRows<{ id: number }>(async (from, to) => {
      const page = pages[calls++] ?? [];
      assert.equal(to - from + 1, 1000);
      return { data: page, error: null };
    });

    assert.equal(calls, 3);
    assert.equal(rows.length, 2042);
    assert.equal(rows[0].id, 0);
    assert.equal(rows[2041].id, 2041);
  });

  it("para na primeira página curta", async () => {
    const rows = await fetchAllRows<{ id: number }>(async () => ({
      data: [{ id: 1 }, { id: 2 }],
      error: null,
    }));
    assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
  });

  it("propaga erro do PostgREST", async () => {
    await assert.rejects(
      () =>
        fetchAllRows(async () => ({
          data: null,
          error: { message: "boom" },
        })),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "FETCH_FAILED");
        return true;
      },
    );
  });
});
