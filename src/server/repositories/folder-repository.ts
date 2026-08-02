import type { AdminClient } from "@/lib/supabase/admin";
import type { Folder } from "@/server/types";

export class FolderRepository {
  constructor(private db: AdminClient) {}

  async list(userId: string, cursor?: string, limit = 50): Promise<Folder[]> {
    let query = this.db
      .from("folders")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (cursor) {
      query = query.gt("id", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Folder[];
  }

  async create(
    userId: string,
    input: { name: string; parentFolderId?: string | null },
  ): Promise<Folder> {
    const { data, error } = await this.db
      .from("folders")
      .insert({
        user_id: userId,
        name: input.name,
        parent_folder_id: input.parentFolderId ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as Folder;
  }

  /**
   * Antes do soft-delete: documentos vão para a raiz e subpastas
   * viram raízes. Soft-delete só da pasta alvo não dispara ON DELETE
   * SET NULL — sem isso, filhos ficam órfãos e somem da árvore.
   */
  async detachContents(userId: string, folderId: string): Promise<void> {
    const { error: docsError } = await this.db
      .from("documents")
      .update({ folder_id: null })
      .eq("user_id", userId)
      .eq("folder_id", folderId)
      .is("deleted_at", null);

    if (docsError) throw docsError;

    const { error: foldersError } = await this.db
      .from("folders")
      .update({ parent_folder_id: null })
      .eq("user_id", userId)
      .eq("parent_folder_id", folderId)
      .is("deleted_at", null);

    if (foldersError) throw foldersError;
  }

  async softDelete(userId: string, folderId: string): Promise<void> {
    const { error } = await this.db
      .from("folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", folderId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw error;
  }

  async getOwned(userId: string, folderId: string): Promise<Folder | null> {
    const { data, error } = await this.db
      .from("folders")
      .select("*")
      .eq("id", folderId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return data as Folder | null;
  }
}
