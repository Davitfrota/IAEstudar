"use client";

import { useRef, useState } from "react";

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

type Props = {
  onToolCallPreview: (tool: string, input: unknown) => void;
};

export function AgentChat({ onToolCallPreview }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text.trim(),
    };
    const assistantId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", toolCalls: [] },
    ]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          conversationId,
        }),
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
  };

  return (
    <div className="flex h-full min-h-[70vh] flex-col rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
      <div className="border-b border-[var(--line)] px-4 py-3">
        <h2 className="font-display text-xl">Agente</h2>
        <p className="text-sm text-[var(--muted)]">
          Peça para organizar matéria, cronograma ou formulário.
        </p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Ex.: “Cria uma pasta de Direito Tributário, um documento com
            introdução à CBS e um cronograma até 15/08 com 5 tópicos.”
          </p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto bg-[var(--accent)] text-white"
                : "bg-black/5 text-[var(--fg)]"
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.toolCalls?.map((t, idx) => (
              <div
                key={`${t.name}-${idx}`}
                className="mt-2 rounded-md border border-[var(--line)] bg-white/70 p-2 text-xs text-[var(--muted)]"
              >
                <p className="font-semibold text-[var(--fg)]">
                  {t.name} · {t.status}
                </p>
                <pre className="mt-1 overflow-x-auto">
                  {JSON.stringify(t.input, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex gap-2 border-t border-[var(--line)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="O que você quer estudar?"
          className="flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-3 text-sm outline-none focus:border-[var(--accent)]"
          disabled={streaming}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
