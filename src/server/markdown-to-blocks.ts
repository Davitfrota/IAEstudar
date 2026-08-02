/**
 * Converte Markdown simples → blocos BlockNote (sem depender do editor no server).
 * Cobre: headings, parágrafos, listas, imagens ![alt](url), negrito **x**.
 */

export type BnInline =
  | { type: "text"; text: string; styles?: Record<string, boolean> }
  | { type: "link"; href: string; content: { type: "text"; text: string; styles?: Record<string, boolean> }[] };

export type BnBlock = {
  type: string;
  props?: Record<string, unknown>;
  content?: BnInline[] | undefined;
  children?: BnBlock[];
};

function parseInline(text: string): BnInline[] {
  const out: BnInline[] = [];
  // [label](url) e **bold**
  const re = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) {
      out.push({ type: "text", text: text.slice(last, m.index) });
    }
    if (m[1]?.startsWith("**")) {
      out.push({ type: "text", text: m[2]!, styles: { bold: true } });
    } else {
      out.push({
        type: "link",
        href: m[4]!,
        content: [{ type: "text", text: m[3]! }],
      });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ type: "text", text: text.slice(last) });
  }
  return out.length ? out : [{ type: "text", text: "" }];
}

function headingLevel(line: string): number | null {
  const m = /^(#{1,3})\s+(.+)$/.exec(line);
  if (!m) return null;
  return m[1]!.length;
}

function headingText(line: string): string {
  return line.replace(/^#{1,3}\s+/, "").trim();
}

/**
 * Markdown → BlockNote JSON.
 */
export function markdownToBlockNote(markdown: string): BnBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: BnBlock[] = [];
  let i = 0;

  const pushParagraph = (text: string) => {
    const t = text.trim();
    if (!t) return;
    blocks.push({
      type: "paragraph",
      content: parseInline(t),
    });
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const img = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(trimmed);
    if (img) {
      blocks.push({
        type: "image",
        props: {
          url: img[2],
          caption: img[1] || "",
          showPreview: true,
        },
      });
      i += 1;
      continue;
    }

    const level = headingLevel(trimmed);
    if (level) {
      blocks.push({
        type: "heading",
        props: { level },
        content: parseInline(headingText(trimmed)),
      });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      while (i < lines.length && /^[-*]\s+/.test((lines[i] ?? "").trim())) {
        const item = (lines[i] ?? "").trim().replace(/^[-*]\s+/, "");
        blocks.push({
          type: "bulletListItem",
          content: parseInline(item),
        });
        i += 1;
      }
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? "").trim())) {
        const item = (lines[i] ?? "").trim().replace(/^\d+\.\s+/, "");
        blocks.push({
          type: "numberedListItem",
          content: parseInline(item),
        });
        i += 1;
      }
      continue;
    }

    // parágrafo: junta linhas até linha vazia ou bloco especial
    const parts: string[] = [trimmed];
    i += 1;
    while (i < lines.length) {
      const next = (lines[i] ?? "").trim();
      if (
        !next ||
        headingLevel(next) ||
        /^[-*]\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        /^!\[/.test(next)
      ) {
        break;
      }
      parts.push(next);
      i += 1;
    }
    pushParagraph(parts.join(" "));
  }

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: [{ type: "text", text: "" }] });
  }

  return blocks;
}
