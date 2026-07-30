import type OpenAI from "openai";
import { AppError } from "@/server/http";
import { nanoid } from "nanoid";

type Client = OpenAI;
type Tools = OpenAI.Chat.ChatCompletionTool[];
type Messages = OpenAI.Chat.ChatCompletionMessageParam[];

export type ParsedToolCall = {
  id: string;
  name: string;
  arguments: string;
  input: Record<string, unknown>;
};

function extractGroqError(err: unknown): {
  message: string;
  code?: string;
  failedGeneration?: string;
} {
  if (!err || typeof err !== "object") {
    return { message: err instanceof Error ? err.message : "Erro Groq" };
  }
  const anyErr = err as {
    message?: string;
    error?: {
      message?: string;
      code?: string;
      failed_generation?: string | { reason?: string };
    };
  };
  const nested = anyErr.error;
  const failed = nested?.failed_generation;
  return {
    message: nested?.message ?? anyErr.message ?? "Erro Groq",
    code: nested?.code,
    failedGeneration:
      typeof failed === "string"
        ? failed
        : failed && typeof failed === "object"
          ? JSON.stringify(failed)
          : undefined,
  };
}

function parseArgs(raw: string): {
  arguments: string;
  input: Record<string, unknown>;
} {
  const trimmed = raw.trim();
  try {
    const input = JSON.parse(trimmed || "{}") as Record<string, unknown>;
    return { arguments: trimmed || "{}", input };
  } catch {
    // tenta achar o primeiro objeto JSON embutido
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        const input = JSON.parse(slice) as Record<string, unknown>;
        return { arguments: slice, input };
      } catch {
        // fallthrough
      }
    }
    return { arguments: "{}", input: {} };
  }
}

/**
 * Llama/Groq às vezes escreve a tool call no content:
 * `<function=propose_study_plan>{...}</function>`
 * em vez de preencher tool_calls. Extrai e remove do texto.
 */
export function extractInlineToolCalls(content: string): {
  content: string;
  toolCalls: ParsedToolCall[];
} {
  if (!content) return { content: "", toolCalls: [] };

  const toolCalls: ParsedToolCall[] = [];
  let cleaned = content;

  const patterns: RegExp[] = [
    /<function\s*=\s*([a-zA-Z0-9_]+)\s*>\s*([\s\S]*?)\s*<\/function>/gi,
    /<function\s*=\s*([a-zA-Z0-9_]+)\s*>\s*(\{[\s\S]*?\})\s*(?:<\/function>)?/gi,
    /```(?:tool|json)?\s*\n?\s*\{\s*"name"\s*:\s*"([a-zA-Z0-9_]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}\s*```/gi,
  ];

  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, (_full, name: string, argsRaw: string) => {
      const { arguments: args, input } = parseArgs(String(argsRaw ?? "{}"));
      if (name) {
        toolCalls.push({
          id: `inline_${nanoid(8)}`,
          name: String(name),
          arguments: args,
          input,
        });
      }
      return "";
    });
  }

  // residual: tag aberta sem fechamento no fim do texto
  cleaned = cleaned.replace(
    /<function\s*=\s*[a-zA-Z0-9_]+\s*>[\s\S]*$/gi,
    "",
  );
  cleaned = cleaned.replace(/<\/?function[^>]*>/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  return { content: cleaned, toolCalls };
}

/** Remove vazamentos de tool call do texto (para UI / histórico antigo). */
export function stripLeakedToolMarkup(content: string): string {
  return extractInlineToolCalls(content).content;
}

/** True se a Nara ainda está coletando objetivo/prazo/nível (não deve gerar plano). */
export function isGatheringPlanRequirements(content: string): boolean {
  const text = content.toLowerCase();
  const asksObjective = /objetivo/.test(text);
  const asksDeadline = /prazo|data|at[eé]\s+quando|quando\s+(?:quer|precisa)/.test(
    text,
  );
  const asksLevel = /n[ií]vel/.test(text);
  const asks = [asksObjective, asksDeadline, asksLevel].filter(Boolean).length;
  return asks >= 2 && /\?/.test(content);
}

const CREATION_TOOLS = new Set([
  "propose_study_plan",
  "create_folder",
  "create_document",
  "update_document",
  "generate_schedule",
  "generate_form",
]);

/**
 * Limpa content vazado + mescla tool_calls; descarta criação se ainda está perguntando requisitos.
 */
export function sanitizeToolCompletion(
  content: string,
  apiToolCalls: ParsedToolCall[],
): { content: string; toolCalls: ParsedToolCall[] } {
  const inline = extractInlineToolCalls(content);
  const byName = new Map<string, ParsedToolCall>();

  for (const call of [...apiToolCalls, ...inline.toolCalls]) {
    if (!call.name) continue;
    if (!byName.has(call.name)) byName.set(call.name, call);
  }

  let toolCalls = [...byName.values()];
  const cleanContent = inline.content;

  if (isGatheringPlanRequirements(cleanContent)) {
    toolCalls = toolCalls.filter((c) => !CREATION_TOOLS.has(c.name));
  }

  return { content: cleanContent, toolCalls };
}

/**
 * Completions com tools no Groq: sem stream, temp baixa, retry se tool_use_failed.
 * Evita parallel_tool_calls no retry (Llama costuma quebrar com várias tools).
 */
export async function groqToolCompletion(opts: {
  client: Client;
  model: string;
  messages: Messages;
  tools: Tools;
}): Promise<{
  content: string;
  toolCalls: ParsedToolCall[];
}> {
  const attempts: { temperature: number; parallel: boolean }[] = [
    { temperature: 0, parallel: false },
    { temperature: 0, parallel: true },
    { temperature: 0.2, parallel: false },
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    try {
      const completion = await opts.client.chat.completions.create({
        model: opts.model,
        max_tokens: 4096,
        temperature: attempt.temperature,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: "auto",
        parallel_tool_calls: attempt.parallel,
        stream: false,
      });

      const msg = completion.choices[0]?.message;
      const rawContent = msg?.content ?? "";
      const rawCalls = msg?.tool_calls ?? [];

      const apiToolCalls: ParsedToolCall[] = rawCalls
        .filter(
          (
            call,
          ): call is OpenAI.Chat.ChatCompletionMessageToolCall & {
            type?: "function";
            function: { name?: string; arguments?: string };
          } =>
            "function" in call &&
            Boolean((call as { function?: unknown }).function),
        )
        .map((call) => {
          let name = call.function?.name ?? "";
          let args = call.function?.arguments ?? "{}";

          // Llama às vezes cola args no name: `create_folder,{...}`
          if (name.includes(",{")) {
            const [n, rest] = name.split(",{", 2);
            name = n ?? name;
            args = `{${rest ?? ""}`;
          }

          const parsed = parseArgs(args);
          return {
            id: call.id,
            name,
            arguments: parsed.arguments,
            input: parsed.input,
          };
        })
        .filter((c) => c.name);

      return sanitizeToolCompletion(rawContent, apiToolCalls);
    } catch (err) {
      lastError = err;
      const parsed = extractGroqError(err);
      const isToolFail =
        parsed.code === "tool_use_failed" ||
        /Failed to call a function|tool_use_failed/i.test(parsed.message);
      if (!isToolFail) break;
      // tenta próxima estratégia
    }
  }

  const parsed = extractGroqError(lastError);
  throw new AppError(
    parsed.failedGeneration
      ? `A IA falhou ao montar as ferramentas. Tente de novo ou simplifique o pedido. (${parsed.message})`
      : parsed.message,
    502,
    "GROQ_TOOL_FAILED",
  );
}
