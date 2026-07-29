"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AgentChat } from "@/components/AgentChat";

export default function AgentePage() {
  const [lastPreview, setLastPreview] = useState<{
    tool: string;
    input: unknown;
  } | null>(null);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <AgentChat
        onToolCallPreview={(tool, input) => {
          setLastPreview({ tool, input });
          if (tool === "create_document") {
            toast.success("Documento criado");
          }
          if (tool === "generate_schedule") {
            toast.success("Cronograma em preview / gerado");
          }
          if (tool === "generate_form") {
            toast.success("Formulário em preview / pronto");
          }
        }}
      />
      <aside className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4">
        <h2 className="font-display text-xl">Preview</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          generate_schedule e generate_form pedem confirmação antes de
          persistir.
        </p>
        {lastPreview ? (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-black/5 p-3 text-xs">
            {JSON.stringify(lastPreview, null, 2)}
          </pre>
        ) : (
          <p className="mt-6 text-sm text-[var(--muted)]">
            Nenhuma ferramenta pendente.
          </p>
        )}
      </aside>
    </div>
  );
}
