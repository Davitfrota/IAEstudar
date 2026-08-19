import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { historyToAnthropicMessages } from "../../src/server/mcp/agent-history";

describe("historyToAnthropicMessages", () => {
  it("preserva turnos só de texto", () => {
    const messages = historyToAnthropicMessages([
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
    ]);

    assert.deepEqual(messages, [
      { role: "user", content: "oi" },
      { role: "assistant", content: "olá" },
    ]);
  });

  it("expande tool_calls pendentes para o modelo reter IDs na confirmação", () => {
    const sourceDocumentId = "11111111-1111-1111-1111-111111111111";
    const messages = historyToAnthropicMessages([
      {
        role: "user",
        content: "gera flashcards desse documento",
      },
      {
        role: "assistant",
        content: "Posso gerar 10 flashcards. Confirma?",
        tool_calls: [
          {
            id: "toolu_pending_1",
            name: "generate_form",
            input: {
              sourceDocumentId,
              type: "flashcard_deck",
              instruction: "foco em conceitos",
              confirmed: false,
            },
            status: "pending_confirmation",
            result: {
              preview: {
                sourceDocumentId,
                sourceTitle: "CBS",
                type: "flashcard_deck",
              },
            },
          },
        ],
      },
      { role: "user", content: "sim, confirma" },
    ]);

    assert.equal(messages.length, 5);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[2].role, "user");
    assert.equal(messages[3].role, "assistant");
    assert.equal(messages[4].role, "user");

    const toolUse = messages[1].content;
    assert.ok(Array.isArray(toolUse));
    assert.equal(toolUse[0].type, "tool_use");
    assert.equal(toolUse[0].name, "generate_form");
    assert.deepEqual(toolUse[0].input, {
      sourceDocumentId,
      type: "flashcard_deck",
      instruction: "foco em conceitos",
      confirmed: false,
    });

    const toolResult = messages[2].content;
    assert.ok(Array.isArray(toolResult));
    assert.equal(toolResult[0].type, "tool_result");
    assert.equal(toolResult[0].tool_use_id, "toolu_pending_1");
    const parsed = JSON.parse(String(toolResult[0].content)) as {
      status: string;
      data: { preview: { sourceDocumentId: string } };
    };
    assert.equal(parsed.status, "pending_confirmation");
    assert.equal(parsed.data.preview.sourceDocumentId, sourceDocumentId);

    // Texto do preview + confirmação do usuário, com IDs ainda no contexto
    assert.equal(messages[3].content, "Posso gerar 10 flashcards. Confirma?");
    assert.equal(messages[4].content, "sim, confirma");
  });

  it("inclui texto do assistant após tool_result quando há explicação", () => {
    const messages = historyToAnthropicMessages([
      { role: "user", content: "cria pasta" },
      {
        role: "assistant",
        content: "Criei a pasta Direito.",
        tool_calls: [
          {
            id: "toolu_1",
            name: "create_folder",
            input: { name: "Direito" },
            status: "executed",
            result: { folderId: "22222222-2222-2222-2222-222222222222" },
          },
        ],
      },
    ]);

    assert.equal(messages.length, 4);
    assert.equal(messages[3].role, "assistant");
    assert.equal(messages[3].content, "Criei a pasta Direito.");
    const resultBlock = messages[2].content;
    assert.ok(Array.isArray(resultBlock));
    const first = resultBlock[0];
    assert.equal(first.type, "tool_result");
    assert.ok(first.type === "tool_result");
    const parsed = JSON.parse(String(first.content)) as {
      status: string;
      data: { folderId: string };
    };
    assert.equal(parsed.status, "success");
    assert.equal(
      parsed.data.folderId,
      "22222222-2222-2222-2222-222222222222",
    );
  });
});
