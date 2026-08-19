import type Anthropic from "@anthropic-ai/sdk";

export type PersistedToolCall = {
  id: string;
  name: string;
  input: unknown;
  status: "pending_confirmation" | "executed" | "error";
  result?: unknown;
  error?: string;
};

export type HistoryRow = {
  role: string;
  content: string | null;
  tool_calls?: unknown;
};

function parseStoredToolCalls(raw: unknown): PersistedToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<PersistedToolCall>;
    if (typeof row.name !== "string" || !row.name) continue;
    const status =
      row.status === "pending_confirmation" ||
      row.status === "executed" ||
      row.status === "error"
        ? row.status
        : "executed";
    out.push({
      id:
        typeof row.id === "string" && row.id.length > 0
          ? row.id
          : `tool_${out.length + 1}`,
      name: row.name,
      input: row.input ?? {},
      status,
      result: row.result,
      error: row.error,
    });
  }
  return out;
}

function toolResultPayload(tool: PersistedToolCall): string {
  const status =
    tool.status === "pending_confirmation"
      ? "pending_confirmation"
      : tool.status === "error"
        ? "error"
        : "success";
  return JSON.stringify({
    status,
    data: tool.result,
    error: tool.error,
  });
}

/**
 * Reconstrói mensagens no formato Anthropic a partir do histórico persistido.
 * Assistants com tool_calls viram a sequência tool_use → tool_result → texto,
 * para o modelo reter IDs/previews na confirmação do turno seguinte.
 */
export function historyToAnthropicMessages(
  rows: HistoryRow[],
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const row of rows) {
    if (row.role === "user") {
      messages.push({
        role: "user",
        content: row.content?.trim() ? row.content : "(vazio)",
      });
      continue;
    }

    if (row.role !== "assistant") {
      continue;
    }

    const tools = parseStoredToolCalls(row.tool_calls);
    if (tools.length === 0) {
      messages.push({
        role: "assistant",
        content: row.content?.trim() ? row.content : "(vazio)",
      });
      continue;
    }

    messages.push({
      role: "assistant",
      content: tools.map((tool) => ({
        type: "tool_use" as const,
        id: tool.id,
        name: tool.name,
        input:
          tool.input && typeof tool.input === "object"
            ? (tool.input as Record<string, unknown>)
            : {},
      })),
    });

    messages.push({
      role: "user",
      content: tools.map((tool) => ({
        type: "tool_result" as const,
        tool_use_id: tool.id,
        content: toolResultPayload(tool),
        is_error: tool.status === "error",
      })),
    });

    if (row.content?.trim()) {
      messages.push({
        role: "assistant",
        content: row.content,
      });
    }
  }

  return messages;
}
