"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentChat, type AgentChatHandle } from "@/components/AgentChat";
import { AgentSidePanel } from "@/components/AgentSidePanel";
import type { ConversationListItem } from "@/server/types/conversation";
import type { ToolPlanPreview } from "@/components/ToolPlanCard";

export default function AgentePage() {
  const chatRef = useRef<AgentChatHandle>(null);
  const [tab, setTab] = useState<"history" | "plan">("history");
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    [],
  );
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >();
  const [scheduleLabel, setScheduleLabel] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<ToolPlanPreview | null>(null);
  const [lastPreview, setLastPreview] = useState<{
    tool: string;
    input: unknown;
  } | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/agent/conversations");
      const json = await res.json();
      if (res.ok) {
        setConversations(json.data.conversations ?? []);
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <AgentChat
        ref={chatRef}
        onToolCallPreview={(tool, input) => {
          setLastPreview({ tool, input });
          setTab("plan");
        }}
        onActivePlanChange={(plan) => {
          setActivePlan(plan);
          if (plan) setTab("plan");
        }}
        onConversationChange={({ conversationId, scheduleLabel: label }) => {
          setActiveConversationId(conversationId);
          setScheduleLabel(label ?? null);
        }}
        onConversationsInvalidate={() => {
          void loadConversations();
        }}
        onToolExecuted={(tool, meta) => {
          if (meta?.ok === false) {
            if (tool === "tool_plan") {
              toast.error("Plano com falha — use Retomar se ainda estiver ativo");
            } else {
              toast.error(`Falha em ${tool}`);
            }
            void loadConversations();
            return;
          }
          if (tool === "create_document") toast.success("Documento criado");
          if (tool === "update_document") toast.success("Documento atualizado");
          if (tool === "generate_schedule") toast.success("Cronograma gerado");
          if (tool === "generate_form") toast.success("Formulário pronto");
          if (tool === "create_folder") toast.success("Pasta criada");
          if (tool === "tool_plan") toast.success("Plano executado");
          void loadConversations();
        }}
      />
      <AgentSidePanel
        tab={tab}
        onTabChange={setTab}
        conversations={conversations}
        activeConversationId={activeConversationId}
        loading={loadingList}
        activePlan={activePlan}
        lastPreview={lastPreview}
        scheduleLabel={scheduleLabel}
        onNewChat={() => {
          chatRef.current?.newChat();
          setTab("history");
        }}
        onSelectConversation={(id) => {
          void chatRef.current?.openConversation(id);
          setTab("history");
        }}
      />
    </div>
  );
}
