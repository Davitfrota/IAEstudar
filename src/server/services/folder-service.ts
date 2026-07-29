import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { FolderRepository } from "@/server/repositories/folder-repository";
import type { CreateFolderInput } from "@/server/schemas";

export class FolderService {
  private repo = new FolderRepository(createAdminClient());

  list(userId: string, cursor?: string, limit = 50) {
    return this.repo.list(userId, cursor, limit);
  }

  async create(userId: string, input: CreateFolderInput) {
    if (input.parentFolderId) {
      const parent = await this.repo.getOwned(userId, input.parentFolderId);
      if (!parent) {
        throw new AppError("Pasta pai não encontrada", 404, "FOLDER_NOT_FOUND");
      }
    }

    return this.repo.create(userId, {
      name: input.name,
      parentFolderId: input.parentFolderId,
    });
  }

  async softDelete(userId: string, folderId: string) {
    const folder = await this.repo.getOwned(userId, folderId);
    if (!folder) {
      throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
    }
    await this.repo.softDelete(userId, folderId);
  }
}
