import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractContentText } from "../../src/lib/content-text";

describe("extractContentText", () => {
  it("inclui texto de children aninhados (listas BlockNote)", () => {
    const blocks = [
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "Tributos" }],
        children: [
          {
            type: "bulletListItem",
            content: [{ type: "text", text: "CBS na EC 132" }],
            children: [],
          },
          {
            type: "bulletListItem",
            content: [{ type: "text", text: "IBS e estados" }],
            children: [
              {
                type: "bulletListItem",
                content: [{ type: "text", text: "partilha" }],
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const text = extractContentText(blocks);
    assert.match(text, /Tributos/);
    assert.match(text, /CBS na EC 132/);
    assert.match(text, /IBS e estados/);
    assert.match(text, /partilha/);
  });

  it("não confia só no conteúdo de nível superior", () => {
    const blocks = [
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "Raiz" }],
        children: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Detalhe essencial para flashcards" }],
            children: [],
          },
        ],
      },
    ];

    // Simula o bug antigo do editor (só top-level content)
    const shallow = blocks
      .map((block) => {
        const content = block.content;
        if (!Array.isArray(content)) return "";
        return content.map((c) => ("text" in c ? c.text ?? "" : "")).join("");
      })
      .join("\n");

    assert.equal(shallow, "Raiz");
    assert.equal(
      extractContentText(blocks),
      "Raiz Detalhe essencial para flashcards",
    );
  });

  it("usa fallback quando não há texto extraível", () => {
    assert.equal(extractContentText([], "fallback"), "fallback");
    assert.equal(extractContentText(null, "x"), "x");
  });
});
