/** Extrai texto plano aproximado de blocos BlockNote / string. */
export function extractContentText(content: unknown, fallback = ""): string {
  if (typeof content === "string") return content;
  if (content == null) return fallback;

  const parts: string[] = [];

  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === "string") {
      if (node.trim()) parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;

    const n = node as {
      text?: unknown;
      content?: unknown;
      children?: unknown;
      rows?: unknown;
      cells?: unknown;
    };

    if (typeof n.text === "string") parts.push(n.text);

    // Inline / nested block arrays, or BlockNote tableContent object.
    if (n.content !== undefined) walk(n.content);
    if (Array.isArray(n.children)) walk(n.children);
    // tableContent: { type: "tableContent", rows: [{ cells: TableCell[] | InlineContent[][] }] }
    if (Array.isArray(n.rows)) walk(n.rows);
    if (Array.isArray(n.cells)) walk(n.cells);
  };

  walk(content);
  return parts.join(" ").trim() || fallback;
}
