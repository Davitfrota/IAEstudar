"use client";

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
};

export function FolderTree({
  folders,
  documents,
  onSelect,
  selectedId,
}: Props) {
  const roots = folders.filter((f) => !f.parent_folder_id);

  const renderFolder = (folder: Folder, depth = 0) => {
    const children = folders.filter((f) => f.parent_folder_id === folder.id);
    const docs = documents.filter((d) => d.folder_id === folder.id);

    return (
      <div key={folder.id} style={{ paddingLeft: depth * 12 }}>
        <button
          type="button"
          onClick={() => onSelect(folder.id, "folder")}
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
            selectedId === folder.id
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "hover:bg-black/5"
          }`}
        >
          <span className="text-[var(--muted)]">/</span>
          <span className="truncate font-medium">{folder.name}</span>
        </button>
        {docs.map((doc) => (
          <button
            key={doc.id}
            type="button"
            onClick={() => onSelect(doc.id, "document")}
            className={`mb-1 ml-3 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
              selectedId === doc.id
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "hover:bg-black/5"
            }`}
            style={{ paddingLeft: 8 }}
          >
            <span className="text-[var(--muted)]">·</span>
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
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
            selectedId === doc.id
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "hover:bg-black/5"
          }`}
        >
          <span className="text-[var(--muted)]">·</span>
          <span className="truncate">{doc.title}</span>
        </button>
      ))}
    </div>
  );
}
