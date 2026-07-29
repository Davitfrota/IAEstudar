"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
  onActivePlanChange?: (plan: ToolPlanPreview | null) => void;
  onConversationChange?: (meta: {
    conversationId?: string;
    title?: string | null;
    scheduleLabel?: string | null;
  }) => void;
  onConversationsInvalidate?: () => void;
};

export type AgentChatHandle = {
  newChat: () => void;
  openConversation: (id: string) => Promise<void>;
};

export const AgentChat = forwardRef<AgentChatHandle, Props>(function AgentChat(
  {
    onToolCallPreview,
    onToolExecuted,
    onActivePlanChange,
    onConversationChange,
    onConversationsInvalidate,
  },
  ref,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [scheduleLabel, setScheduleLabel] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [activePlan, setActivePlan] = useState<ToolPlanPreview | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const setPlan = useCallback(
    (plan: ToolPlanPreview | null) => {
      setActivePlan(plan);
      onActivePlanChange?.(plan);
    },
    [onActivePlanChange],
  );

  const notifyConversation = useCallback(
    (id: string | undefined, label: string | null) => {
      onConversationChange?.({
        conversationId: id,
        title: label,
        scheduleLabel: label,
      });
    },
    [onConversationChange],
  );

  const newChat = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
    setScheduleLabel(null);
    setPlan(null);
    setInput("");
    notifyConversation(undefined, null);
  }, [notifyConversation, setPlan]);

  const openConversation = useCallback(
    async (id: string) => {
      setLoadingThread(true);
      setPlan(null);
      try {
        const res = await fetch(`/api/agent/conversations/${id}`);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "Falha ao abrir conversa");
        }
        const conv = json.data.conversation as {
          id: string;
          title: string | null;
          scheduleTitle: string | null;
          scheduleId: string | null;
        };
        const rows = json.data.messages as Array<{
          id: string;
          role: string;
          content: string;
        }>;
        setConversationId(conv.id);
        const label =
          conv.scheduleTitle ||
          (conv.scheduleId ? conv.title : null) ||
          conv.title;
        setScheduleLabel(label);
        setMessages(
          rows
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
        );
        notifyConversation(conv.id, label);
      } finally {
        setLoadingThread(false);
      }
    },
    [notifyConversation, setPlan],
  );

  useImperativeHandle(ref, () => ({ newChat, openConversation }), [
    newChat,
    openConversation,
  ]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming || loadingThread) return;
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
            conversationId: conversationIdRef.current,
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
              conversationTitle?: string;
              error?: string;
              toolCall?: { name: string; status: string; input?: unknown };
            };

            if (event.conversationId) {
              setConversationId(event.conversationId);
              notifyConversation(event.conversationId, scheduleLabel);
              onConversationsInvalidate?.();
            }

            if (event.conversationTitle) {
              setScheduleLabel(event.conversationTitle);
              notifyConversation(
                conversationIdRef.current ?? event.conversationId,
                event.conversationTitle,
              );
              onConversationsInvalidate?.();
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

            if (event.toolPlan) {
              setPlan(event.toolPlan);
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
        onConversationsInvalidate?.();
      }
    },
    [
      streaming,
      loadingThread,
      scheduleLabel,
      notifyConversation,
      onConversationsInvalidate,
      onToolCallPreview,
      onToolExecuted,
      setPlan,
    ],
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
            scheduleBound?: {
              conversationId: string;
              scheduleId: string;
              title: string;
            };
            stepProgress?: {
              stepId: string;
              status: "running" | "done" | "error";
              error?: string;
            };
          };
          if (event.toolPlan) {
            plan = event.toolPlan;
            setPlan(event.toolPlan);
          }
          if (event.scheduleBound) {
            setScheduleLabel(event.scheduleBound.title);
            notifyConversation(
              event.scheduleBound.conversationId,
              event.scheduleBound.title,
            );
            onConversationsInvalidate?.();
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
            setPlan(plan);
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
              ? "Plano executado. Este chat ficou vinculado ao cronograma — posso acompanhar seu estudo daqui."
              : "Plano terminou com erro em algum passo.",
          toolPlan: plan,
        },
      ]);
      onToolExecuted?.("tool_plan");
      if (plan.status === "done") setPlan(null);
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
      onConversationsInvalidate?.();
    }
  };

  const cancelPlan = async () => {
    if (!activePlan) return;
    await fetch(`/api/agent/plan/${activePlan.planId}/cancel`, {
      method: "POST",
    });
    setPlan(
      activePlan ? { ...activePlan, status: "expired" } : null,
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
          {scheduleLabel
            ? `Tutor do cronograma: ${scheduleLabel}`
            : "Digite o que precisa estudar — o plano aparece pra você confirmar."}
        </p>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loadingThread ? (
            <p className="text-sm opacity-80">Carregando conversa…</p>
          ) : null}

          {!loadingThread && messages.length === 0 ? (
            <Alert>
              <AlertTitle>Experimente</AlertTitle>
              <AlertDescription>
                “Preciso estudar cálculo até dia 15” — pasta, documento,
                cronograma e formulário num plano só. Depois este chat vira o
                tutor desse cronograma.
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
              disabled={
                streaming && activePlan.status === "awaiting_confirmation"
              }
              live
              onPlanChange={setPlan}
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
            disabled={streaming || loadingThread}
          />
          <Button
            type="submit"
            disabled={streaming || loadingThread || !input.trim()}
          >
            Enviar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
});
