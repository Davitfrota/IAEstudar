"use client";

import { useEffect, useRef, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import type { Block } from "@blocknote/core";
import { Badge } from "@/components/ui/badge";

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

type Props = {
  document: Document;
  onChange: (payload: {
    content: unknown;
    contentText: string;
    title?: string;
  }) => void | Promise<void>;
  saveStatus?: "saved" | "saving" | "error";
  linkedForms?: LinkedForm[];
  isStale?: boolean;
};

function blocksFromDocument(content: unknown): Block[] | undefined {
  return Array.isArray(content) && content.length > 0
    ? (content as Block[])
    : undefined;
}

function EditorBody({
  document,
  onChange,
  saveStatus = "saved",
  linkedForms = [],
  isStale,
}: Props) {
  const [title, setTitle] = useState(document.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(document);
  latest.current = document;

  const editor = useCreateBlockNote({
    initialContent: blocksFromDocument(document.content),
  });

  useEffect(() => {
    setTitle(document.title);
  }, [document.id, document.title]);

  const scheduleSave = (payload: {
    content?: unknown;
    contentText?: string;
    title?: string;
  }) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void onChange({
        content: payload.content ?? latest.current.content,
        contentText: payload.contentText ?? latest.current.content_text,
        title: payload.title ?? title,
      });
    }, 2000);
  };

  const staleForms = linkedForms.filter((f) => f.isStale);

  return (
    <div className="flex h-full min-h-[60vh] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {isStale || staleForms.length > 0 ? (
          <Badge variant="pink">Formulário desatualizado</Badge>
        ) : null}
        <span className="text-xs font-heading uppercase opacity-70">
          {saveStatus === "saving"
            ? "Salvando…"
            : saveStatus === "error"
              ? "Erro ao salvar"
              : "Salvo"}
        </span>
      </div>
      {staleForms.length > 0 ? (
        <p className="text-sm opacity-80">
          {staleForms.map((f) => f.title).join(", ")} — regeneração só sob
          pedido.
        </p>
      ) : null}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave({ title: e.target.value });
        }}
        className="font-heading w-full border-0 bg-transparent text-3xl uppercase outline-none"
        placeholder="Título do documento"
      />
      <div className="min-h-[480px] flex-1 rounded-base border-2 border-border bg-secondary-background p-2 shadow-shadow">
        <BlockNoteView
          editor={editor}
          onChange={() => {
            const blocks = editor.document;
            const text = editor.document
              .map((block) => {
                const content = (
                  block as { content?: Array<{ text?: string }> }
                ).content;
                if (!Array.isArray(content)) return "";
                return content.map((c) => c.text ?? "").join("");
              })
              .join("\n");
            scheduleSave({ content: blocks, contentText: text });
          }}
        />
      </div>
    </div>
  );
}

export function DocumentEditor(props: Props) {
  return (
    <MantineProvider>
      <EditorBody key={props.document.id} {...props} />
    </MantineProvider>
  );
}
