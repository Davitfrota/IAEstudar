"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConversationListItem } from "@/server/types/conversation";
import type { ToolPlanPreview } from "@/components/ToolPlanCard";

type Tab = "history" | "plan";

type Props = {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  conversations: ConversationListItem[];
  activeConversationId?: string;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  loading?: boolean;
  activePlan: ToolPlanPreview | null;
  lastPreview: { tool: string; input: unknown } | null;
  scheduleLabel?: string | null;
};

export function AgentSidePanel({
  tab,
  onTabChange,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  loading,
  activePlan,
  lastPreview,
  scheduleLabel,
}: Props) {
  return (
    <Card className="flex h-fit max-h-[70vh] flex-col overflow-hidden bg-mint">
      <CardHeader className="gap-3 space-y-0">
        <CardTitle className="uppercase">Painel</CardTitle>
        <div className="flex gap-1 rounded-base border-2 border-border bg-background p-1">
          <Button
            type="button"
            size="sm"
            variant={tab === "history" ? "default" : "neutral"}
            className="flex-1"
            onClick={() => onTabChange("history")}
          >
            Histórico
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "plan" ? "default" : "neutral"}
            className="flex-1"
            onClick={() => onTabChange("plan")}
          >
            Plano
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        {tab === "history" ? (
          <>
            <Button type="button" onClick={onNewChat} disabled={loading}>
              Nova conversa
            </Button>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="text-sm opacity-80">
                  Nenhuma conversa ainda. Peça um plano de estudo no chat.
                </p>
              ) : (
                conversations.map((c) => {
                  const label =
                    c.title ||
                    c.scheduleTitle ||
                    `Conversa ${c.id.slice(0, 6)}`;
                  const active = c.id === activeConversationId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onSelectConversation(c.id)}
                      className={`w-full rounded-base border-2 border-border px-3 py-2 text-left text-sm shadow-shadow transition-transform ${
                        active
                          ? "bg-main text-main-foreground"
                          : "bg-background hover:translate-x-0.5"
                      }`}
                    >
                      <span className="line-clamp-2 font-heading">{label}</span>
                      {c.scheduleId ? (
                        <span className="mt-1 block text-xs opacity-80">
                          Cronograma vinculado
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3 overflow-y-auto text-sm">
            {scheduleLabel ? (
              <div className="rounded-base border-2 border-border bg-background p-3">
                <p className="font-heading uppercase">Tutor deste chat</p>
                <p className="mt-1 opacity-90">{scheduleLabel}</p>
              </div>
            ) : (
              <p className="opacity-80">
                Confirme um plano com cronograma para amarrar este chat a ele.
              </p>
            )}

            {activePlan ? (
              <div className="rounded-base border-2 border-border bg-background p-3">
                <p className="font-heading uppercase">Plano ativo</p>
                <p className="mt-1">{activePlan.summary}</p>
                <p className="mt-2 text-xs opacity-70">
                  Status: {activePlan.status} · {activePlan.steps.length} passos
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                  {activePlan.steps.map((s) => (
                    <li key={s.id}>
                      {s.description}{" "}
                      <span className="opacity-60">({s.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : lastPreview ? (
              <pre className="overflow-x-auto rounded-base border-2 border-border bg-lavender p-3 text-xs">
                {JSON.stringify(lastPreview.input, null, 2)}
              </pre>
            ) : (
              <p className="opacity-80">Nenhum plano pendente no momento.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
