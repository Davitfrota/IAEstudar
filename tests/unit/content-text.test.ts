import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractContentText } from "../../src/lib/content-text";

describe("extractContentText", () => {
  it("inclui texto de células de tabela BlockNote (tableContent objeto)", () => {
    const blocks = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Intro" }],
        children: [],
      },
      {
        type: "table",
        props: { textColor: "default" },
        content: {
          type: "tableContent",
          columnWidths: [120, 120],
          headerRows: 1,
          rows: [
            {
              cells: [
                {
                  type: "tableCell",
                  props: {},
                  content: [{ type: "text", text: "Conceito", styles: {} }],
                },
                {
                  type: "tableCell",
                  props: {},
                  content: [{ type: "text", text: "Definição", styles: {} }],
                },
              ],
            },
            {
              cells: [
                {
                  type: "tableCell",
                  props: {},
                  content: [{ type: "text", text: "CBS", styles: {} }],
                },
                {
                  type: "tableCell",
                  props: {},
                  content: [
                    {
                      type: "text",
                      text: "Contribuição sobre Bens e Serviços na EC 132",
                      styles: {},
                    },
                  ],
                },
              ],
            },
          ],
        },
        children: [],
      },
    ];

    const text = extractContentText(blocks);
    assert.match(text, /Intro/);
    assert.match(text, /Conceito/);
    assert.match(text, /Definição/);
    assert.match(text, /CBS/);
    assert.match(text, /Contribuição sobre Bens e Serviços na EC 132/);
  });

  it("aceita células no formato InlineContent[][] legado", () => {
    const blocks = [
      {
        type: "table",
        content: {
          type: "tableContent",
          columnWidths: [100, 100],
          rows: [
            {
              cells: [
                [{ type: "text", text: "Termo" }],
                [{ type: "text", text: "Significado longo o bastante" }],
              ],
            },
          ],
        },
        children: [],
      },
    ];

    const text = extractContentText(blocks);
    assert.match(text, /Termo/);
    assert.match(text, /Significado longo o bastante/);
  });

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
        ],
      },
    ];

    const text = extractContentText(blocks);
    assert.match(text, /Tributos/);
    assert.match(text, /CBS na EC 132/);
  });

  it("documento só com tabela não fica com content_text vazio", () => {
    const blocks = [
      {
        type: "table",
        content: {
          type: "tableContent",
          columnWidths: [100],
          rows: [
            {
              cells: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "text",
                      text: "x".repeat(60),
                    },
                  ],
                },
              ],
            },
          ],
        },
        children: [],
      },
    ];

    const text = extractContentText(blocks);
    assert.equal(text.length, 60);
  });
});
