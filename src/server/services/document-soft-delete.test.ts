import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FormRepository } from "../repositories/form-repository";
import type { AdminClient } from "../../lib/supabase/admin";

type Filter = [string, string, unknown];

function createFakeDb(resultIds: string[]) {
  const filters: Filter[] = [];
  let patch: Record<string, unknown> | null = null;
  let table = "";

  const chain = {
    update(next: Record<string, unknown>) {
      patch = next;
      return chain;
    },
    eq(col: string, val: unknown) {
      filters.push(["eq", col, val]);
      return chain;
    },
    is(col: string, val: unknown) {
      filters.push(["is", col, val]);
      return chain;
    },
    select(_cols: string) {
      return Promise.resolve({
        data: resultIds.map((id) => ({ id })),
        error: null,
      });
    },
  };

  const db = {
    from(name: string) {
      table = name;
      return chain;
    },
  };

  return {
    db: db as unknown as AdminClient,
    getState: () => ({ table, patch, filters }),
  };
}

describe("FormRepository.softDeleteBySourceDocument", () => {
  it("marca deleted_at nos forms do documento de origem do usuário", async () => {
    const { db, getState } = createFakeDb(["form-a", "form-b"]);
    const repo = new FormRepository(db);
    const before = Date.now();

    const count = await repo.softDeleteBySourceDocument(
      "user-1",
      "doc-1",
    );

    const { table, patch, filters } = getState();
    assert.equal(count, 2);
    assert.equal(table, "forms");
    assert.ok(typeof patch?.deleted_at === "string");
    assert.ok(Date.parse(patch.deleted_at as string) >= before);
    assert.deepEqual(filters, [
      ["eq", "user_id", "user-1"],
      ["eq", "source_document_id", "doc-1"],
      ["is", "deleted_at", null],
    ]);
  });
});
