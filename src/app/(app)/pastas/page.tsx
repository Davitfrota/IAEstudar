"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

  const createFolder = async () => {
    const name = window.prompt("Nome da nova pasta");
    if (!name?.trim()) return;
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro");
      toast.success("Pasta criada");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha");
    }
  };

  const renameFolder = async (folder: Folder) => {
    const name = window.prompt("Renomear pasta", folder.name);
    if (!name?.trim() || name.trim() === folder.name) return;
    try {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro");
      toast.success("Pasta renomeada");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha");
    }
  };

  const deleteFolder = async (folder: Folder) => {
    if (!window.confirm(`Excluir pasta "${folder.name}"?`)) return;
    try {
      const res = await fetch(`/api/folders/${folder.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro");
      if (selectedId === folder.id) setSelectedId(null);
      toast.success("Pasta excluída");
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-3xl uppercase">Pastas</h1>
        <Link href="/agente">
          <Button size="sm">Abrir Nara</Button>
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="uppercase">Árvore</CardTitle>
            <div className="flex gap-2">
              <Button variant="neutral" size="sm" onClick={() => void createFolder()}>
                Nova pasta
              </Button>
              <Button variant="neutral" size="sm" onClick={() => void load()}>
                Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <div className="h-8 animate-pulse rounded-base border-2 border-border bg-background" />
                <div className="h-8 animate-pulse rounded-base border-2 border-border bg-background" />
              </div>
            ) : folders.length === 0 && documents.length === 0 ? (
              <EmptyState
                title="Nenhuma pasta ainda"
                description="Peça à Nara um plano de estudo — ela cria pastas e documentos para você."
                href="/agente"
                actionLabel="Falar com a Nara"
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
                onRenameFolder={(folder) => void renameFolder(folder)}
                onDeleteFolder={(folder) => void deleteFolder(folder)}
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[40vh]">
          <CardHeader>
            <CardTitle className="uppercase">Documento</CardTitle>
          </CardHeader>
          <CardContent>
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
                Selecione um documento na árvore ou peça à Nara criar um.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
