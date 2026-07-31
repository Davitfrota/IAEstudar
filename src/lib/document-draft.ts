export type DocumentDraft = {
  content: unknown;
  contentText: string;
  title: string;
};

/** Mescla patches parciais sem descartar campos ainda não persistidos. */
export function mergeDocumentDraft(
  base: DocumentDraft,
  patch: Partial<DocumentDraft>,
): DocumentDraft {
  return {
    content: patch.content !== undefined ? patch.content : base.content,
    contentText:
      patch.contentText !== undefined ? patch.contentText : base.contentText,
    title: patch.title !== undefined ? patch.title : base.title,
  };
}
