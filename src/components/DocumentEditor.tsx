"use client";

import { useEffect, useRef, useState } from "react";
import { MantineProvider } from "@mantine/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@mantine/core/styles.css";
import "@blocknote/mantine/style.css";
import type { Block } from "@blocknote/core";
import {
  mergeDocumentDraft,
  type DocumentDraft,
} from "@/lib/document-draft";

type Document = {
  id: string;
  title: string;
  content: unknown;
  content_text: string;
};

type Props = {
  document: Document;
  onChange: (payload: {
    content: unknown;
    contentText: string;
    title?: string;
  }) => void;
  isStale?: boolean;
};

function blocksFromDocument(content: unknown): Block[] | undefined {
  return Array.isArray(content) && content.length > 0
    ? (content as Block[])
    : undefined;
}

function draftFromDocument(document: Document): DocumentDraft {
  return {
    content: document.content,
    contentText: document.content_text,
    title: document.title,
  };
}

function EditorBody({ document, onChange, isStale }: Props) {
  const [title, setTitle] = useState(document.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draft = useRef<DocumentDraft>(draftFromDocument(document));

  const editor = useCreateBlockNote({
    initialContent: blocksFromDocument(document.content),
  });

  useEffect(() => {
    draft.current = draftFromDocument(document);
    setTitle(document.title);
  }, [document.id]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const scheduleSave = (payload: Partial<DocumentDraft>) => {
    draft.current = mergeDocumentDraft(draft.current, payload);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = draft.current;
      onChange({
        content: next.content,
        contentText: next.contentText,
        title: next.title,
      });
    }, 700);
  };

  return (
    <div className="flex h-full min-h-[60vh] flex-col gap-3">
      {isStale ? (
        <div className="rounded-md border border-[var(--warn)]/40 bg-[#fff6d9] px-3 py-2 text-sm text-[var(--warn)]">
          Formulários gerados a partir deste documento estão desatualizados
          (is_stale). Regeneração só sob pedido.
        </div>
      ) : null}
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave({ title: e.target.value });
        }}
        className="font-display w-full border-0 bg-transparent text-3xl outline-none"
        placeholder="Título do documento"
      />
      <div className="min-h-[480px] flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow)]">
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
