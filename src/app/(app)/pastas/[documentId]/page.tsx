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

type LinkedForm = {
  formId: string;
  title: string;
  isStale: boolean;
};

export default function DocumentPage() {
  const params = useParams<{ documentId: string }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [linkedForms, setLinkedForms] = useState<LinkedForm[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
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
          const linked = (
            formsJson.data.forms as Array<{
              id: string;
              title: string;
              source_document_id: string;
              is_stale: boolean;
            }>
          )
            .filter((f) => f.source_document_id === params.documentId)
            .map((f) => ({
              formId: f.id,
              title: f.title,
              isStale: f.is_stale,
            }));
          setLinkedForms(linked);
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
      saveStatus={saveStatus}
      linkedForms={linkedForms}
      isStale={linkedForms.some((f) => f.isStale)}
      onChange={async ({ content, contentText, title }) => {
        setSaveStatus("saving");
        try {
          const res = await fetch(`/api/documents/${document.id}/content`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, contentText }),
          });
          const json = await res.json();
          if (!res.ok) {
            setSaveStatus("error");
            toast.error(json.error?.message ?? "Falha ao salvar");
            return;
          }
          if (title && title !== document.title) {
            await fetch(`/api/documents/${document.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            });
          }
          setDocument(json.data.document);
          setSaveStatus("saved");
        } catch {
          setSaveStatus("error");
        }
      }}
    />
  );
}
