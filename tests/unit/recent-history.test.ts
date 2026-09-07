import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toChronologicalHistoryWindow } from "../../src/server/mcp/recent-history";

describe("toChronologicalHistoryWindow", () => {
  it("reordena janela newest-first para cronológica (inclui o turno atual)", () => {
    const newestFirst = [
      { id: 41, role: "user", content: "mensagem atual" },
      { id: 40, role: "assistant", content: "resposta 20" },
      { id: 39, role: "user", content: "mensagem 20" },
    ];

    const chronological = toChronologicalHistoryWindow(newestFirst);

    assert.deepEqual(
      chronological.map((row) => row.id),
      [39, 40, 41],
    );
    assert.equal(chronological.at(-1)?.content, "mensagem atual");
  });

  it("não muta o array de entrada", () => {
    const newestFirst = [{ id: 2 }, { id: 1 }];
    const copy = newestFirst.slice();
    toChronologicalHistoryWindow(newestFirst);
    assert.deepEqual(newestFirst, copy);
  });

  it("mantém lista vazia", () => {
    assert.deepEqual(toChronologicalHistoryWindow([]), []);
  });
});
