import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../src/server/http";
import { fetchAllRows } from "../../src/server/export-fetch";

describe("fetchAllRows", () => {
  it("concatena páginas até a última parcial", async () => {
    const pages = [
      Array.from({ length: 3 }, (_, i) => ({ id: i + 1 })),
      Array.from({ length: 3 }, (_, i) => ({ id: i + 4 })),
      [{ id: 7 }],
    ];
    let calls = 0;

    const rows = await fetchAllRows(async (from, to) => {
      assert.equal(to - from + 1, 3);
      const page = pages[calls] ?? [];
      calls += 1;
      return { data: page, error: null };
    }, 3);

    assert.equal(calls, 3);
    assert.deepEqual(
      rows.map((r) => r.id),
      [1, 2, 3, 4, 5, 6, 7],
    );
  });

  it("retorna vazio quando a primeira página vem vazia", async () => {
    const rows = await fetchAllRows(async () => ({ data: [], error: null }), 10);
    assert.deepEqual(rows, []);
  });

  it("trata data null como página vazia", async () => {
    const rows = await fetchAllRows(async () => ({ data: null, error: null }), 10);
    assert.deepEqual(rows, []);
  });

  it("falha com AppError quando a query retorna error", async () => {
    await assert.rejects(
      () =>
        fetchAllRows(async () => ({
          data: null,
          error: { message: "timeout" },
        })),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "EXPORT_FAILED");
        assert.match(err.message, /timeout/);
        return true;
      },
    );
  });

  it("não engole erro na segunda página (evita backup parcial)", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        fetchAllRows(async () => {
          calls += 1;
          if (calls === 1) {
            return {
              data: Array.from({ length: 2 }, (_, i) => ({ id: i })),
              error: null,
            };
          }
          return { data: null, error: { message: "db down" } };
        }, 2),
      (err: unknown) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, "EXPORT_FAILED");
        return true;
      },
    );
    assert.equal(calls, 2);
  });
});
