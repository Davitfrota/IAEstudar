import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeDocumentDraft } from "@/lib/document-draft";
import { createSerialSaver } from "@/lib/serial-save";

async function waitFor(
  predicate: () => boolean,
  label: string,
  attempts = 20,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timeout waiting for ${label}`);
}

describe("mergeDocumentDraft", () => {
  it("preserva conteúdo quando só o título muda (cenário do autosave)", () => {
    const base = {
      content: [{ type: "paragraph", content: [{ type: "text", text: "novo" }] }],
      contentText: "novo",
      title: "Antigo",
    };

    const merged = mergeDocumentDraft(base, { title: "Renomeado" });

    assert.equal(merged.title, "Renomeado");
    assert.equal(merged.contentText, "novo");
    assert.deepEqual(merged.content, base.content);
  });

  it("preserva título quando só o conteúdo muda", () => {
    const base = {
      content: [],
      contentText: "",
      title: "Meu doc",
    };

    const merged = mergeDocumentDraft(base, {
      content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }],
      contentText: "x",
    });

    assert.equal(merged.title, "Meu doc");
    assert.equal(merged.contentText, "x");
  });
});

describe("createSerialSaver", () => {
  it("não deixa um save antigo sobrescrever o mais recente", async () => {
    const order: string[] = [];
    const releases: Array<() => void> = [];

    const saver = createSerialSaver<string>(async (draft) => {
      order.push(`start:${draft}`);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      order.push(`end:${draft}`);
    });

    const first = saver("A");
    await waitFor(() => releases.length === 1, "save A start");

    const second = saver("B");
    const third = saver("C");

    releases[0]!();
    await waitFor(() => releases.length === 2, "save C start");
    releases[1]!();
    await Promise.all([first, second, third]);

    assert.deepEqual(order, ["start:A", "end:A", "start:C", "end:C"]);
  });
});
