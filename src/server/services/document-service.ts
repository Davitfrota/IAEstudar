import { extractContentText } from "@/lib/content-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { DocumentRepository } from "@/server/repositories/document-repository";
import { FolderRepository } from "@/server/repositories/folder-repository";
import type {
  CreateDocumentInput,
  UpdateDocumentInput,
} from "@/server/schemas";

export { extractContentText } from "@/lib/content-text";

function plainTextFromInitial(content?: string): string {
  return (content ?? "").trim();
}

export class DocumentService {
  private repo = new DocumentRepository(createAdminClient());
  private folders = new FolderRepository(createAdminClient());

  list(userId: string, cursor?: string, limit = 50) {
    return this.repo.list(userId, cursor, limit);
  }

  async get(userId: string, documentId: string) {
    const doc = await this.repo.getOwned(userId, documentId);
    if (!doc) {
      throw new AppError("Documento não encontrado", 404, "DOCUMENT_NOT_FOUND");
    }
    return doc;
  }

  async create(userId: string, input: CreateDocumentInput) {
    if (input.folderId) {
      const folder = await this.folders.getOwned(userId, input.folderId);
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

    return this.repo.create(userId, {
      title: input.title,
      folderId: input.folderId,
      content,
      contentText,
    });
  }

  async update(userId: string, documentId: string, input: UpdateDocumentInput) {
    await this.get(userId, documentId);

    if (input.folderId) {
      const folder = await this.folders.getOwned(userId, input.folderId);
      if (!folder) {
        throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
      }
    }

    // Sempre derivar do JSON de blocos quando presente — o cliente pode
    // omitir texto em children aninhados (listas, toggles) e truncar content_text.
    const contentText =
      input.content !== undefined
        ? extractContentText(input.content, input.contentText ?? "")
        : input.contentText;

    return this.repo.update(userId, documentId, {
      title: input.title,
      folderId: input.folderId,
      content: input.content,
      contentText,
    });
  }

  async softDelete(userId: string, documentId: string) {
    await this.get(userId, documentId);
    await this.repo.softDelete(userId, documentId);
  }
}
