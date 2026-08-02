"use client";

import { cn } from "@/lib/utils";

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

type Props = {
  folders: Folder[];
  documents: Document[];
  onSelect: (id: string, type: "folder" | "document") => void;
  selectedId?: string | null;
  onRenameFolder?: (folder: Folder) => void;
  onDeleteFolder?: (folder: Folder) => void;
};

export function FolderTree({
  folders,
  documents,
  onSelect,
  selectedId,
  onRenameFolder,
  onDeleteFolder,
}: Props) {
  const roots = folders.filter((f) => !f.parent_folder_id);

  const renderFolder = (folder: Folder, depth = 0) => {
    const children = folders.filter((f) => f.parent_folder_id === folder.id);
    const docs = documents.filter((d) => d.folder_id === folder.id);

    return (
      <div key={folder.id} style={{ paddingLeft: depth * 12 }}>
        <div className="mb-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onSelect(folder.id, "folder")}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-base border-2 border-border px-2 py-1.5 text-left text-sm font-heading transition-all",
              selectedId === folder.id
                ? "bg-main text-main-foreground shadow-shadow"
                : "bg-secondary-background hover:shadow-shadow",
            )}
          >
            <span className="text-xs">/</span>
            <span className="truncate">{folder.name}</span>
          </button>
          {onRenameFolder || onDeleteFolder ? (
            <div className="flex shrink-0 gap-0.5">
              {onRenameFolder ? (
                <button
                  type="button"
                  title="Renomear"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameFolder(folder);
                  }}
                  className="rounded-base border-2 border-border bg-butter px-1.5 py-0.5 text-xs font-heading uppercase hover:shadow-shadow"
                >
                  ✎
                </button>
              ) : null}
              {onDeleteFolder ? (
                <button
                  type="button"
                  title="Excluir"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolder(folder);
                  }}
                  className="rounded-base border-2 border-border bg-[var(--chart-2)] px-1.5 py-0.5 text-xs font-heading uppercase hover:shadow-shadow"
                >
                  ×
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onSelect(doc.id, "document")}
            className={cn(
              "mb-1 ml-3 flex w-full items-center gap-2 rounded-base border-2 border-border px-2 py-1.5 text-left text-sm transition-all",
              selectedId === doc.id
                ? "bg-[var(--chart-3)] font-heading shadow-shadow"
                : "bg-secondary-background hover:shadow-shadow",
            )}
          >
            <span className="text-xs">·</span>
            <span className="truncate">{doc.title}</span>
          </button>
        ))}
        {children.map((child) => renderFolder(child, depth + 1))}
      </div>
    );
  };

  const orphanDocs = documents.filter((d) => !d.folder_id);

  return (
    <div className="space-y-1">
      {roots.map((folder) => renderFolder(folder))}
      {orphanDocs.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => onSelect(doc.id, "document")}
          className={cn(
            "mb-1 flex w-full items-center gap-2 rounded-base border-2 border-border px-2 py-1.5 text-left text-sm transition-all",
            selectedId === doc.id
              ? "bg-[var(--chart-3)] font-heading shadow-shadow"
              : "bg-secondary-background hover:shadow-shadow",
          )}
        >
          <span className="text-xs">·</span>
          <span className="truncate">{doc.title}</span>
        </button>
      ))}
    </div>
  );
}
