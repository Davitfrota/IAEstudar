import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { FolderRepository } from "@/server/repositories/folder-repository";
import type { CreateFolderInput, UpdateFolderInput } from "@/server/schemas";

export class FolderService {
  private async repo() {
    return new FolderRepository(await createDbClient());
  }

  async list(userId: string, cursor?: string, limit = 50) {
    return (await this.repo()).list(userId, cursor, limit);
  }

  async create(userId: string, input: CreateFolderInput) {
    const repo = await this.repo();
    if (input.parentFolderId) {
      const parent = await repo.getOwned(userId, input.parentFolderId);
      if (!parent) {
        throw new AppError("Pasta pai não encontrada", 404, "FOLDER_NOT_FOUND");
      }
    }

    return repo.create(userId, {
      name: input.name,
      parentFolderId: input.parentFolderId,
    });
  }

  async update(userId: string, folderId: string, input: UpdateFolderInput) {
    const repo = await this.repo();
    const folder = await repo.getOwned(userId, folderId);
    if (!folder) {
      throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
    }

    if (input.parentFolderId) {
      if (input.parentFolderId === folderId) {
        throw new AppError(
          "Pasta não pode ser pai de si mesma",
          400,
          "INVALID_PARENT",
        );
      }
      const parent = await repo.getOwned(userId, input.parentFolderId);
      if (!parent) {
        throw new AppError("Pasta pai não encontrada", 404, "FOLDER_NOT_FOUND");
      }
    }

    return repo.update(userId, folderId, {
      name: input.name,
      parentFolderId: input.parentFolderId,
      position: input.position,
    });
  }

  async softDelete(userId: string, folderId: string) {
    const repo = await this.repo();
    const folder = await repo.getOwned(userId, folderId);
    if (!folder) {
      throw new AppError("Pasta não encontrada", 404, "FOLDER_NOT_FOUND");
    }
    await repo.softDelete(userId, folderId);
  }
}
