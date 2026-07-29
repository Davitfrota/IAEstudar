"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { DocumentEditor } from "@/components/DocumentEditor";

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
      onChange={async ({ content, contentText, title }) => {
        const res = await fetch(`/api/documents/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, contentText, title }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast.error(json.error?.message ?? "Falha ao salvar");
          return;
        }
        setDocument(json.data.document);
        toast.success("Documento salvo");
      }}
    />
  );
}
