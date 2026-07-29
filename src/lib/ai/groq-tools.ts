import type OpenAI from "openai";
import { AppError } from "@/server/http";

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
      const content = msg?.content ?? "";
      const rawCalls = msg?.tool_calls ?? [];

      const toolCalls: ParsedToolCall[] = rawCalls
        .filter(
          (call): call is OpenAI.Chat.ChatCompletionMessageToolCall & {
            type?: "function";
            function: { name?: string; arguments?: string };
          } =>
            "function" in call && Boolean((call as { function?: unknown }).function),
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

          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(args || "{}") as Record<string, unknown>;
          } catch {
            input = {};
          }

          return {
            id: call.id,
            name,
            arguments: args,
            input,
          };
        })
        .filter((c) => c.name);

      return { content, toolCalls };
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
