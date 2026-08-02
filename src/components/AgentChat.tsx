"use client";

import Link from "next/link";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChatMarkdown } from "@/components/ChatMarkdown";
import { NaraMascot } from "@/components/NaraMascot";
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
  links?: { href: string; label: string }[];
};

type Props = {
  onToolCallPreview?: (tool: string, input: unknown) => void;
  onToolExecuted?: (tool: string, meta?: { ok?: boolean }) => void;
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

function stripTitleLine(text: string): string {
  return text.replace(/^\s*T[ií]tulo\s*:\s*.+\n?/im, "").trimStart();
}

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
  const [streamMode, setStreamMode] = useState<"chat" | "confirm" | null>(null);
  const abortRef = useRef<AbortController | null>(null);
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
    abortRef.current?.abort();
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
              content: stripTitleLine(m.content),
            })),
        );
        const pending = json.data.pendingPlan as ToolPlanPreview | null;
        if (pending) setPlan(pending);
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
      setStreamMode("chat");
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            conversationId: conversationIdRef.current,
          }),
          signal: abort.signal,
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
                    ? {
                        ...m,
                        content: stripTitleLine(m.content + event.textDelta),
                      }
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
              onToolExecuted?.(event.toolCall.name, { ok: true });
            }
            if (event.toolCall?.status === "error") {
              onToolExecuted?.(event.toolCall.name, { ok: false });
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
        if (error instanceof DOMException && error.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content || "Geração cancelada." }
                : m,
            ),
          );
        } else {
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
        }
      } finally {
        setStreaming(false);
        setStreamMode(null);
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
    if (
      !activePlan ||
      streaming ||
      (activePlan.status !== "awaiting_confirmation" &&
        activePlan.status !== "error")
    ) {
      return;
    }
    setStreaming(true);
    setStreamMode("confirm");
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    let scheduleBound:
      | { conversationId: string; scheduleId: string; title: string }
      | undefined;
    let folderId: string | undefined;
    let formId: string | undefined;

    try {
      const res = await fetch(
        `/api/agent/plan/${activePlan.planId}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftQuestions ? { draftQuestions } : {}),
          signal: abort.signal,
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
              result?: { folderId?: string; formId?: string; id?: string };
            };
          };
          if (event.toolPlan) {
            plan = event.toolPlan;
            setPlan(event.toolPlan);
          }
          if (event.scheduleBound) {
            scheduleBound = event.scheduleBound;
            setScheduleLabel(event.scheduleBound.title);
            notifyConversation(
              event.scheduleBound.conversationId,
              event.scheduleBound.title,
            );
            onConversationsInvalidate?.();
          }
          if (event.stepProgress) {
            const result = event.stepProgress.result;
            if (result?.folderId) folderId = String(result.folderId);
            if (result?.formId) formId = String(result.formId);
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

      const links: { href: string; label: string }[] = [];
      if (folderId) links.push({ href: "/pastas", label: "Abrir pastas" });
      links.push({ href: "/agenda", label: "Ver agenda" });
      if (formId) {
        links.push({
          href: `/formularios/${formId}/practice`,
          label: "Praticar",
        });
      } else {
        links.push({ href: "/formularios", label: "Ver formulários" });
      }

      const ok = plan.status === "done";
      const content = ok
        ? scheduleBound
          ? `Plano executado e este chat ficou vinculado a “${scheduleBound.title}”. Próximos passos:`
          : "Plano executado, mas o vínculo com o cronograma não foi confirmado. Abra a Agenda para conferir as sessões."
        : "Alguns passos falharam. Use Retomar no card do plano para continuar só o que faltou.";

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content,
          toolPlan: plan,
          links: ok ? links : undefined,
        },
      ]);
      onToolExecuted?.("tool_plan", { ok });
      if (ok) setPlan(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Execução interrompida. Se o plano ainda existir, use Retomar no card.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              error instanceof Error ? error.message : "Falha na confirmação",
          },
        ]);
      }
    } finally {
      setStreaming(false);
      setStreamMode(null);
      onConversationsInvalidate?.();
    }
  };

  const cancelPlan = async () => {
    if (!activePlan) return;
    await fetch(`/api/agent/plan/${activePlan.planId}/cancel`, {
      method: "POST",
    });
    setPlan(activePlan ? { ...activePlan, status: "expired" } : null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !activePlan ||
        (activePlan.status !== "awaiting_confirmation" &&
          activePlan.status !== "error")
      ) {
        return;
      }
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
        <div className="flex items-start gap-3">
          <NaraMascot size={48} avatar pose="idle" />
          <div className="min-w-0 flex-1">
            <CardTitle className="uppercase">Nara</CardTitle>
            <p className="text-sm opacity-80">
              {scheduleLabel
                ? `Tutora do cronograma: ${scheduleLabel}`
                : "Sua professora particular — conte o objetivo, o prazo e o nível para montarmos o plano."}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-0 overflow-hidden p-0">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {loadingThread ? (
            <p className="text-sm opacity-80">Carregando conversa…</p>
          ) : null}

          {!loadingThread && messages.length === 0 ? (
            <div className="flex items-start gap-3">
              <NaraMascot size={52} avatar pose="idle" />
              <div className="max-w-[min(100%,36rem)] rounded-2xl border-2 border-border bg-secondary-background px-4 py-3 text-sm shadow-shadow">
                <p className="font-heading text-xs uppercase tracking-tight opacity-70">
                  Nara
                </p>
                <p className="mt-1 leading-relaxed">
                  Olá! Sou a <strong>Nara</strong>, sua professora particular.
                  Conte o <strong>objetivo</strong>, o <strong>prazo</strong> e
                  o <strong>nível</strong> — eu monto o plano e acompanho o
                  cronograma neste chat.
                </p>
                <p className="mt-2 text-xs opacity-70">
                  Ex.: “Quero estudar cálculo para a prova daqui a 3 semanas,
                  nível intermediário.”
                </p>
              </div>
            </div>
          ) : null}

          {messages.map((m) => {
            const isUser = m.role === "user";
            const isThinking =
              !isUser && streaming && !m.content.trim() && !m.toolPlan;

            if (isUser) {
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[min(95%,36rem)] rounded-2xl border-2 border-border bg-main px-4 py-2.5 text-sm text-main-foreground shadow-shadow">
                    <ChatMarkdown content={m.content} variant="user" />
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className="flex items-start gap-3">
                <NaraMascot
                  size={52}
                  avatar
                  pose={isThinking ? "thinking" : "idle"}
                />
                <div className="min-w-0 max-w-[min(100%,36rem)] flex-1">
                  {isThinking ? (
                    <div className="inline-flex items-center gap-2 rounded-2xl border-2 border-border bg-secondary-background px-4 py-3 shadow-shadow">
                      <span className="flex gap-1" aria-label="Nara pensando">
                        <span className="size-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:0ms]" />
                        <span className="size-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:150ms]" />
                        <span className="size-2 animate-bounce rounded-full bg-foreground/50 [animation-delay:300ms]" />
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-2xl border-2 border-border bg-secondary-background px-4 py-2.5 text-sm shadow-shadow">
                      {m.content.trim() ? (
                        <ChatMarkdown
                          content={m.content}
                          variant="assistant"
                        />
                      ) : null}
                      {m.links?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {m.links.map((link) => (
                            <Link key={link.href + link.label} href={link.href}>
                              <Button type="button" size="sm" variant="neutral">
                                {link.label}
                              </Button>
                            </Link>
                          ))}
                        </div>
                      ) : null}
                      {m.toolPlan &&
                      m.toolPlan.planId !== activePlan?.planId ? (
                        <ToolPlanCard
                          plan={m.toolPlan}
                          disabled
                          onConfirm={() => undefined}
                          onCancel={() => undefined}
                          onRequestEdit={() => undefined}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {activePlan ? (
            <div className="flex items-start gap-3">
              <NaraMascot size={52} avatar pose="idle" />
              <div className="min-w-0 flex-1">
                <ToolPlanCard
                  plan={activePlan}
                  disabled={
                    streaming &&
                    (activePlan.status === "awaiting_confirmation" ||
                      activePlan.status === "executing")
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
              </div>
            </div>
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
          {streaming ? (
            <Button
              type="button"
              variant="neutral"
              onClick={() => abortRef.current?.abort()}
            >
              {streamMode === "confirm" ? "Parar plano" : "Parar"}
            </Button>
          ) : (
            <Button type="submit" disabled={loadingThread || !input.trim()}>
              Enviar
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
});
