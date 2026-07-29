"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { FolderTree } from "@/components/FolderTree";
import { AgentChat } from "@/components/AgentChat";

type Folder = {
  id: string;
  name: string;
  parent_folder_id: string | null;
};

type Document = {
  id: string;
  title: string;
  folder_id: string | null;
};

export default function PastasPage() {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ tool: string; input: unknown } | null>(
    null,
  );

  const load = async () => {
    setLoading(true);
    try {
      const [fRes, dRes] = await Promise.all([
        fetch("/api/folders"),
        fetch("/api/documents"),
      ]);
      const fJson = await fRes.json();
      const dJson = await dRes.json();
      if (!fRes.ok) throw new Error(fJson.error?.message ?? "Erro pastas");
      if (!dRes.ok) throw new Error(dJson.error?.message ?? "Erro documentos");
      setFolders(fJson.data.folders);
      setDocuments(dJson.data.documents);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_360px]">
      <aside className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow)]">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-display text-xl">Pastas</h1>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Atualizar
          </button>
        </div>
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 animate-pulse rounded bg-black/5" />
            <div className="h-8 animate-pulse rounded bg-black/5" />
            <div className="h-8 animate-pulse rounded bg-black/5" />
          </div>
        ) : folders.length === 0 && documents.length === 0 ? (
          <EmptyState
            title="Comece pedindo pro agente organizar sua primeira matéria"
            description="Use o chat à direita — a árvore atualiza depois."
          />
        ) : (
          <FolderTree
            folders={folders}
            documents={documents}
            selectedId={selectedId}
            onSelect={(id, type) => {
              setSelectedId(id);
              if (type === "document") {
                router.push(`/pastas/${id}`);
              }
            }}
          />
        )}
      </aside>

      <section className="hidden min-h-[60vh] rounded-2xl border border-dashed border-[var(--line)] p-6 lg:block">
        <p className="font-display text-2xl">Editor</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Selecione um documento na árvore para abrir o editor BlockNote.
        </p>
        {preview ? (
          <div className="mt-6 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4 text-sm">
            <p className="font-semibold text-[var(--accent)]">
              Preview da ferramenta: {preview.tool}
            </p>
            <pre className="mt-2 overflow-x-auto text-xs">
              {JSON.stringify(preview.input, null, 2)}
            </pre>
          </div>
        ) : null}
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <AgentChat
          onToolCallPreview={(tool, input) => {
            setPreview({ tool, input });
            void load();
          }}
        />
      </aside>
    </div>
  );
}
