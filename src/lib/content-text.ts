/** Extrai texto plano aproximado de blocos BlockNote / string. */
export function extractContentText(content: unknown, fallback = ""): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return fallback;

  const parts: string[] = [];

  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as {
        content?: unknown[];
        text?: string;
        children?: unknown[];
      };
      if (typeof n.text === "string") parts.push(n.text);
      if (Array.isArray(n.content)) walk(n.content);
      if (Array.isArray(n.children)) walk(n.children);
    }
  };

  walk(content);
  return parts.join(" ").trim() || fallback;
}
