import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeListCursor,
  encodeListCursor,
  listCursorOrFilter,
  nextListCursor,
} from "../../src/lib/list-cursor";
import { AppError } from "../../src/server/http";

describe("list-cursor", () => {
  it("round-trips created_at + id", () => {
    const raw = { created_at: "2026-09-09T12:00:00.000Z", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
    const encoded = encodeListCursor(raw);
    assert.equal(decodeListCursor(encoded).created_at, raw.created_at);
    assert.equal(decodeListCursor(encoded).id, raw.id);
  });

  it("builds PostgREST or-filter for keyset", () => {
    const filter = listCursorOrFilter({
      created_at: "2026-09-09T12:00:00.000Z",
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    assert.match(filter, /created_at\.gt\."2026-09-09T12:00:00\.000Z"/);
    assert.match(filter, /id\.gt\.aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/);
  });

  it("nextListCursor only when page is full", () => {
    const rows = [
      { created_at: "2026-01-01T00:00:00.000Z", id: "1" },
      { created_at: "2026-01-02T00:00:00.000Z", id: "2" },
    ];
    assert.equal(nextListCursor(rows, 3), null);
    const next = nextListCursor(rows, 2);
    assert.ok(next);
    assert.equal(decodeListCursor(next!).id, "2");
  });

  it("rejects garbage cursor", () => {
    assert.throws(() => decodeListCursor("not-a-cursor"), (err: unknown) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.code, "INVALID_CURSOR");
      return true;
    });
  });
});

/**
 * Simula o avanço de páginas: cursor antigo baseado só em id + ORDER BY position
 * pulava linhas. Com (created_at, id) o conjunto completo é recuperável.
 */
describe("list pagination completeness", () => {
  it("walks all rows across pages with composite cursor", () => {
    const all = Array.from({ length: 55 }, (_, i) => ({
      created_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `doc-${i}`,
    }));

    // Ordenação estável como no repositório
    all.sort((a, b) =>
      a.created_at === b.created_at
        ? a.id.localeCompare(b.id)
        : a.created_at.localeCompare(b.created_at),
    );

    const pageSize = 50;
    const collected: typeof all = [];
    let cursor: string | undefined;

    for (;;) {
      let page;
      if (!cursor) {
        page = all.slice(0, pageSize);
      } else {
        const c = decodeListCursor(cursor);
        page = all
          .filter(
            (row) =>
              row.created_at > c.created_at ||
              (row.created_at === c.created_at && row.id > c.id),
          )
          .slice(0, pageSize);
      }
      collected.push(...page);
      const next = nextListCursor(page, pageSize);
      if (!next) break;
      cursor = next;
    }

    assert.equal(collected.length, 55);
    assert.deepEqual(
      collected.map((r) => r.id),
      all.map((r) => r.id),
    );
  });

  it("old id-only cursor with position order drops rows (regression fixture)", () => {
    // position=0 para todos; ordem de listagem era position, created_at
    // mas o cursor usava id > lastId — UUIDs fora de ordem de created_at
    // fazem a 2ª página pular itens.
    const rows = [
      { position: 0, created_at: "2026-01-01", id: "c" },
      { position: 0, created_at: "2026-01-02", id: "a" },
      { position: 0, created_at: "2026-01-03", id: "b" },
    ];
    const ordered = [...rows].sort((x, y) =>
      x.created_at.localeCompare(y.created_at),
    );
    const page1 = ordered.slice(0, 2); // c, a by created_at → actually Jan1 c, Jan2 a
    const lastId = page1[page1.length - 1].id; // "a"
    const page2Broken = ordered.filter((r) => r.id > lastId); // only "b","c" with id>"a" → "b","c" but "c" already in p1; misses nothing by chance...

    // Better fixture: last page1 id is high UUID so remaining earlier ids are skipped
    const fixture = [
      { created_at: "2026-01-01", id: "m" }, // page1
      { created_at: "2026-01-02", id: "z" }, // page1 last — cursor id=z
      { created_at: "2026-01-03", id: "a" }, // id < z → DROPPED by .gt(id)
    ];
    const byCreated = [...fixture].sort((x, y) =>
      x.created_at.localeCompare(y.created_at),
    );
    const p1 = byCreated.slice(0, 2);
    const broken = byCreated.filter((r) => r.id > p1[1].id);
    assert.equal(broken.length, 0, "id-only cursor loses the third row");

    // Composite cursor recovers it
    const c = { created_at: p1[1].created_at, id: p1[1].id };
    const recovered = byCreated.filter(
      (r) =>
        r.created_at > c.created_at ||
        (r.created_at === c.created_at && r.id > c.id),
    );
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0].id, "a");
  });
});
