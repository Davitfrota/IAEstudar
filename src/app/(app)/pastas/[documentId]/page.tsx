"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { DocumentEditor } from "@/components/DocumentEditor";
import { createSerialSaver } from "@/lib/serial-save";

type Document = {
  id: string;
  title: string;
  content: unknown;
  content_text: string;
};

export default function DocumentPage() {
  const params = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const documentIdRef = useRef<string | null>(null);
  documentIdRef.current = document?.id ?? null;

  const saveDocument = useRef(
    createSerialSaver<{
      content: unknown;
      contentText: string;
      title?: string;
    }>(async ({ content, contentText, title }) => {
      const id = documentIdRef.current;
      if (!id) return;
      const res = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, contentText, title }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error?.message ?? "Falha ao salvar");
        return;
      }
      if (documentIdRef.current !== id) return;
      setDocument(json.data.document);
      toast.success("Documento salvo");
    }),
  ).current;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/documents/${params.documentId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "Erro");
        setDocument(json.data.document);

        const formsRes = await fetch("/api/forms");
        const formsJson = await formsRes.json();
        if (formsRes.ok) {
          const stale = (formsJson.data.forms as Array<{
            source_document_id: string;
            is_stale: boolean;
          }>).some(
            (f) =>
              f.source_document_id === params.documentId && f.is_stale,
          );
          setIsStale(stale);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [params.documentId]);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-black/5" />;
  }

  if (!document) {
    return <p>Documento não encontrado.</p>;
  }

  return (
    <DocumentEditor
      document={document}
      isStale={isStale}
      onChange={(payload) => {
        void saveDocument(payload);
      }}
    />
  );
}
