"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ToolPlanCard,
  type ToolPlanPreview,
} from "@/components/ToolPlanCard";
import type { PreviewQuestion } from "@/components/FormQuestionPreviewEditor";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolPlan?: ToolPlanPreview;
};

type Props = {
  onToolCallPreview?: (tool: string, input: unknown) => void;
  onToolExecuted?: (tool: string) => void;
};

export function AgentChat({ onToolCallPreview, onToolExecuted }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [activePlan, setActivePlan] = useState<ToolPlanPreview | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      const assistantId = crypto.randomUUID();
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
      };

      setMessages((prev) => [
        ...prev,
        userMsg,
        { id: assistantId, role: "assistant", content: "" },
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
              toolPlan?: ToolPlanPreview;
              conversationId?: string;
              error?: string;
              toolCall?: { name: string; status: string; input?: unknown };
            };

            if (event.conversationId) setConversationId(event.conversationId);

            if (event.textDelta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.textDelta }
                    : m,
                ),
              );
            }

            if (event.toolPlan) {
              setActivePlan(event.toolPlan);
              onToolCallPreview?.("tool_plan", event.toolPlan);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, toolPlan: event.toolPlan }
                    : m,
                ),
              );
            }

            if (event.toolCall?.status === "executed") {
              onToolExecuted?.(event.toolCall.name);
            }

            if (event.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content || `Erro: ${event.error}` }
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
    [conversationId, streaming, onToolCallPreview, onToolExecuted],
  );

  const confirmPlan = async (draftQuestions?: PreviewQuestion[]) => {
    if (!activePlan || streaming) return;
    setStreaming(true);
    try {
      const res = await fetch(
        `/api/agent/plan/${activePlan.planId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            draftQuestions ? { draftQuestions } : {},
          ),
        },
      );
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Falha ao confirmar");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let plan: ToolPlanPreview = { ...activePlan, status: "executing" };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            toolPlan?: ToolPlanPreview;
            stepProgress?: {
              stepId: string;
              status: "running" | "done" | "error";
              error?: string;
            };
          };
          if (event.toolPlan) {
            plan = event.toolPlan;
            setActivePlan(event.toolPlan);
          }
          if (event.stepProgress) {
            plan = {
              ...plan,
              steps: plan.steps.map((s) =>
                s.id === event.stepProgress!.stepId
                  ? {
                      ...s,
                      status: event.stepProgress!.status,
                      error: event.stepProgress!.error,
                    }
                  : s,
              ),
            };
            setActivePlan(plan);
          }
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            plan.status === "done"
              ? "Plano executado com sucesso."
              : "Plano terminou com erro em algum passo.",
          toolPlan: plan,
        },
      ]);
      onToolExecuted?.("tool_plan");
      if (plan.status === "done") setActivePlan(null);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error ? error.message : "Falha na confirmação",
        },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  const cancelPlan = async () => {
    if (!activePlan) return;
    await fetch(`/api/agent/plan/${activePlan.planId}/cancel`, {
      method: "POST",
    });
    setActivePlan((p) =>
      p ? { ...p, status: "expired" } : null,
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activePlan || activePlan.status !== "awaiting_confirmation") return;
      if (e.key === "Escape") {
        e.preventDefault();
        void cancelPlan();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void confirmPlan(activePlan.draftQuestions);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Card className="flex h-full min-h-[70vh] flex-col overflow-hidden">
      <CardHeader>
        <CardTitle className="uppercase">Agente</CardTitle>
        <p className="text-sm opacity-80">
          Digite o que precisa estudar — o plano aparece pra você confirmar.
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <Alert>
              <AlertTitle>Experimente</AlertTitle>
              <AlertDescription>
                “Preciso estudar cálculo até dia 15” — pasta, documento,
                cronograma e formulário num plano só.
              </AlertDescription>
            </Alert>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[95%] rounded-base border-2 border-border px-3 py-2 text-sm shadow-shadow ${
                m.role === "user"
                  ? "ml-auto bg-main text-main-foreground"
                  : "bg-lavender"
              }`}
            >
              <p className="whitespace-pre-wrap font-base">{m.content}</p>
              {m.toolPlan && m.toolPlan.planId !== activePlan?.planId ? (
                <ToolPlanCard
                  plan={m.toolPlan}
                  disabled
                  onConfirm={() => undefined}
                  onCancel={() => undefined}
                  onRequestEdit={() => undefined}
                />
              ) : null}
            </div>
          ))}

          {activePlan ? (
            <ToolPlanCard
              plan={activePlan}
              disabled={streaming && activePlan.status === "awaiting_confirmation"}
              live
              onPlanChange={setActivePlan}
              onConfirm={(qs) => void confirmPlan(qs)}
              onCancel={() => void cancelPlan()}
              onRequestEdit={(instruction) => {
                void cancelPlan().then(() =>
                  send(`Ajuste o plano: ${instruction}`),
                );
              }}
            />
          ) : null}
          <div ref={bottomRef} />
        </div>

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
