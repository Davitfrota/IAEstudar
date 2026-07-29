"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AgentChat } from "@/components/AgentChat";
import { EmptyState } from "@/components/EmptyState";
import { FolderTree } from "@/components/FolderTree";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

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

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh({
    tables: ["folders", "documents"],
    onChange: () => {
      void load();
    },
  });

  const selectedDoc = documents.find((d) => d.id === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr_360px]">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="uppercase">Pastas</CardTitle>
          <Button variant="neutral" size="sm" onClick={() => void load()}>
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <div className="h-8 animate-pulse rounded-base border-2 border-border bg-background" />
              <div className="h-8 animate-pulse rounded-base border-2 border-border bg-background" />
            </div>
          ) : folders.length === 0 && documents.length === 0 ? (
            <EmptyState
              title="Comece pedindo pro agente"
              description="Use o chat à direita — a árvore atualiza em tempo real."
            />
          ) : (
            <FolderTree
              folders={folders}
              documents={documents}
              selectedId={selectedId}
              onSelect={(id, type) => {
                setSelectedId(id);
                if (type === "document") router.push(`/pastas/${id}`);
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card className="hidden min-h-[60vh] lg:block">
        <CardHeader>
          <CardTitle className="uppercase">Centro</CardTitle>
          <p className="text-sm opacity-80">
            Preview de ferramentas e atalho para o editor.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedDoc ? (
            <div className="rounded-base border-2 border-border bg-butter p-4 shadow-shadow">
              <p className="font-heading uppercase">{selectedDoc.title}</p>
              <Button
                className="mt-3"
                size="sm"
                onClick={() => router.push(`/pastas/${selectedDoc.id}`)}
              >
                Abrir editor
              </Button>
            </div>
          ) : (
            <p className="text-sm opacity-80">
              Selecione um documento na árvore (ou peça ao agente criar um).
            </p>
          )}
          {preview ? (
            <pre className="overflow-x-auto rounded-base border-2 border-border bg-lavender p-4 text-xs font-heading">
              {JSON.stringify(preview, null, 2)}
            </pre>
          ) : (
            <p className="text-sm opacity-80">Nenhum preview pendente.</p>
          )}
        </CardContent>
      </Card>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <AgentChat
          onToolCallPreview={(tool, input) => {
            setPreview({ tool, input });
          }}
          onToolExecuted={() => {
            void load();
            toast.success("Árvore atualizada");
          }}
        />
      </aside>
    </div>
  );
}
