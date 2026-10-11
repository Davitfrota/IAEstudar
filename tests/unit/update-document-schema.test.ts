import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updateDocumentSchema } from "../../src/server/schemas/index";

describe("updateDocumentSchema title", () => {
  it("não rejeita PATCH de conteúdo quando title vem vazio (autosave)", () => {
    const parsed = updateDocumentSchema.parse({
      title: "",
      content: [{ type: "paragraph", content: [{ type: "text", text: "nota" }] }],
      contentText: "nota longa o suficiente para não perder",
    });

    assert.equal(parsed.title, undefined);
    assert.equal(parsed.contentText, "nota longa o suficiente para não perder");
    assert.ok(Array.isArray(parsed.content));
  });

  it("trata title só com espaços como omitido", () => {
    const parsed = updateDocumentSchema.parse({
      title: "   ",
      contentText: "corpo",
    });
    assert.equal(parsed.title, undefined);
    assert.equal(parsed.contentText, "corpo");
  });

  it("ainda aceita e faz trim de título válido", () => {
    const parsed = updateDocumentSchema.parse({ title: "  Direito  " });
    assert.equal(parsed.title, "Direito");
  });

  it("rejeita título acima do limite", () => {
    assert.throws(() => updateDocumentSchema.parse({ title: "x".repeat(201) }));
  });
});
