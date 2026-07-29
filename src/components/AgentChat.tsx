"use client";

import { useCallback, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  FormQuestionPreviewEditor,
  type FormEstimate,
  type PreviewQuestion,
} from "@/components/FormQuestionPreviewEditor";

type ToolCallEvent = {
  name: string;
  input: unknown;
  status: "pending_confirmation" | "executed" | "error";
  result?: unknown;
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallEvent[];
};

type ConfirmableTool = "generate_schedule" | "generate_form" | "update_document";

type Props = {
  onToolCallPreview: (tool: string, input: unknown) => void;
  onToolExecuted?: (tool: string) => void;
};

function isConfirmable(name: string): name is ConfirmableTool {
  return (
    name === "generate_schedule" ||
    name === "generate_form" ||
    name === "update_document"
  );
}

function extractFormPreview(result: unknown): {
  questions: PreviewQuestion[];
  estimate: FormEstimate | null;
} | null {
  if (!result || typeof result !== "object") return null;
  const preview = (result as { preview?: unknown }).preview;
  if (!preview || typeof preview !== "object") return null;
  const p = preview as {
    questions?: PreviewQuestion[];
    estimate?: FormEstimate;
  };
  if (!Array.isArray(p.questions) || p.questions.length === 0) return null;
  return {
    questions: p.questions,
    estimate: p.estimate ?? null,
  };
}

export function AgentChat({ onToolCallPreview, onToolExecuted }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    name: ConfirmableTool;
    input: Record<string, unknown>;
  } | null>(null);
  const [formDraft, setFormDraft] = useState<{
    questions: PreviewQuestion[];
    estimate: FormEstimate | null;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const consumeStream = useCallback(
    async (
      body: Record<string, unknown>,
      assistantId: string,
      userContent: string,
    ) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
      };

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "", toolCalls: [] },
      ]);
      setStreaming(true);

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error?.message ?? "Falha no chat");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as {
              textDelta?: string;
              toolCall?: ToolCallEvent;
              conversationId?: string;
              error?: string;
            };

            if (event.conversationId) {
              setConversationId(event.conversationId);
            }

            if (event.textDelta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.textDelta }
                    : m,
                ),
              );
            }

            if (event.toolCall) {
              if (event.toolCall.status === "pending_confirmation") {
                onToolCallPreview(event.toolCall.name, event.toolCall.input);
                if (isConfirmable(event.toolCall.name)) {
                  setPendingConfirm({
                    name: event.toolCall.name,
                    input: (event.toolCall.input ?? {}) as Record<
                      string,
                      unknown
                    >,
                  });
                }
                if (event.toolCall.name === "generate_form") {
                  const draft = extractFormPreview(event.toolCall.result);
                  setFormDraft(draft);
                } else {
                  setFormDraft(null);
                }
              } else if (event.toolCall.status === "executed") {
                setPendingConfirm(null);
                setFormDraft(null);
                onToolExecuted?.(event.toolCall.name);
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [...(m.toolCalls ?? []), event.toolCall!],
                      }
                    : m,
                ),
              );
            }

            if (event.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        content: m.content || `Erro: ${event.error}`,
                      }
                    : m,
                ),
              );
            }
          }
        }
      } catch (error) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    error instanceof Error
                      ? error.message
                      : "Erro ao falar com o agente",
                }
              : m,
          ),
        );
      } finally {
        setStreaming(false);
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    },
    [onToolCallPreview, onToolExecuted],
  );

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    const assistantId = crypto.randomUUID();
    setInput("");
    await consumeStream(
      { message: text.trim(), conversationId },
      assistantId,
      text.trim(),
    );
  };

  const confirmPending = async () => {
    if (!pendingConfirm || streaming) return;
    const assistantId = crypto.randomUUID();
    const inputPayload =
      pendingConfirm.name === "generate_form" && formDraft
        ? {
            ...pendingConfirm.input,
            questions: formDraft.questions.filter(
              (q) => q.prompt.trim() && q.answer.trim(),
            ),
          }
        : pendingConfirm.input;

    await consumeStream(
      {
        conversationId,
        confirmTool: {
          name: pendingConfirm.name,
          input: inputPayload,
        },
      },
      assistantId,
      `Confirmar ${pendingConfirm.name}`,
    );
  };

  return (
    <Card className="flex h-full min-h-[70vh] flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="uppercase">Agente</CardTitle>
        <p className="text-sm opacity-80">
          Peça para organizar matéria, cronograma ou formulário.
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <Alert>
              <AlertTitle>Dica</AlertTitle>
              <AlertDescription>
                Ex.: “Cria uma pasta de Direito Tributário, um documento com
                introdução à CBS e um cronograma até 15/08 com 5 tópicos.”
              </AlertDescription>
            </Alert>
          ) : null}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[90%] rounded-base border-2 border-border px-3 py-2 text-sm shadow-shadow transition-transform duration-200 ${
                m.role === "user"
                  ? "ml-auto bg-main text-main-foreground"
                  : "bg-lavender"
              }`}
            >
              <p className="whitespace-pre-wrap font-base">{m.content}</p>
              {m.toolCalls?.map((t, idx) => (
                <div
                  key={`${t.name}-${idx}`}
                  className="mt-2 rounded-base border-2 border-border bg-mint p-2 text-xs"
                >
                  <p className="font-heading uppercase">
                    {t.name} · {t.status}
                  </p>
                  {t.name === "generate_form" &&
                  t.status === "pending_confirmation" ? (
                    <p className="mt-1 opacity-80">
                      Edite os cards abaixo antes de confirmar.
                    </p>
                  ) : t.status === "pending_confirmation" && t.result ? (
                    <pre className="mt-1 overflow-x-auto">
                      {JSON.stringify(t.result, null, 2)}
                    </pre>
                  ) : (
                    <pre className="mt-1 overflow-x-auto">
                      {JSON.stringify(t.input, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {pendingConfirm?.name === "generate_form" && formDraft ? (
          <FormQuestionPreviewEditor
            questions={formDraft.questions}
            estimate={formDraft.estimate}
            disabled={streaming}
            onChange={(questions) =>
              setFormDraft((prev) =>
                prev ? { ...prev, questions } : { questions, estimate: null },
              )
            }
            onConfirm={() => void confirmPending()}
            onCancel={() => {
              setPendingConfirm(null);
              setFormDraft(null);
            }}
          />
        ) : pendingConfirm ? (
          <div className="flex flex-wrap items-center gap-2 border-t-2 border-border bg-pink/40 px-3 py-2">
            <p className="flex-1 text-sm font-heading uppercase">
              Confirmar {pendingConfirm.name}?
            </p>
            <Button
              type="button"
              size="sm"
              disabled={streaming}
              onClick={() => void confirmPending()}
            >
              Confirmar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="neutral"
              disabled={streaming}
              onClick={() => setPendingConfirm(null)}
            >
              Cancelar
            </Button>
          </div>
        ) : null}

        <form
          className="flex gap-2 border-t-2 border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="O que você quer estudar?"
            disabled={streaming}
          />
          <Button type="submit" disabled={streaming || !input.trim()}>
            Enviar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
