import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { DocumentRepository } from "@/server/repositories/document-repository";
import { FolderRepository } from "@/server/repositories/folder-repository";
import type {
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@/server/schemas";

function plainTextFromInitial(content?: string): string {
  return (content ?? "").trim();
}

/** Extrai texto plano aproximado de blocos BlockNote / string. */
export function extractContentText(content: unknown, fallback = ""): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return fallback;

  const parts: string[] = [];

  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as {
        content?: unknown[];
        text?: string;
        children?: unknown[];
      };
      if (typeof n.text === "string") parts.push(n.text);
      if (Array.isArray(n.content)) walk(n.content);
      if (Array.isArray(n.children)) walk(n.children);
    }
  };

  walk(content);
  return parts.join(" ").trim() || fallback;
}

export class DocumentService {
  private async repo() {
    return new DocumentRepository(await createDbClient());
  }

  private async folders() {
    return new FolderRepository(await createDbClient());
  }

  async list(userId: string, cursor?: string, limit = 50) {
    return (await this.repo()).list(userId, cursor, limit);
  }

  async get(userId: string, documentId: string) {
    const doc = await (await this.repo()).getOwned(userId, documentId);
    if (!doc) {
      throw new AppError("Documento não encontrado", 404, "DOCUMENT_NOT_FOUND");
    }
    return doc;
  }

  async create(userId: string, input: CreateDocumentInput) {
    if (input.folderId) {
      const folder = await (await this.folders()).getOwned(userId, input.folderId);
      if (!folder) {
        throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
      }
    }

    const contentText = plainTextFromInitial(input.initialContent);
    const content =
      input.content ??
      (input.initialContent
        ? [
            {
              type: "paragraph",
              content: [{ type: "text", text: input.initialContent }],
            },
          ]
        : []);

    return (await this.repo()).create(userId, {
      title: input.title,
      folderId: input.folderId,
      content,
      contentText,
    });
  }

  async update(userId: string, documentId: string, input: UpdateDocumentInput) {
    await this.get(userId, documentId);

    if (input.folderId) {
      const folder = await (await this.folders()).getOwned(userId, input.folderId);
      if (!folder) {
        throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
      }
    }

    const contentText =
      input.contentText ??
      (input.content !== undefined
        ? extractContentText(input.content)
        : undefined);

    return (await this.repo()).update(userId, documentId, {
      title: input.title,
      folderId: input.folderId,
      content: input.content,
      contentText,
    });
  }

  async softDelete(userId: string, documentId: string) {
    await this.get(userId, documentId);
    await (await this.repo()).softDelete(userId, documentId);
  }
}
