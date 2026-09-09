import type { AdminClient } from "@/lib/supabase/admin";
import {
  decodeListCursor,
  listCursorOrFilter,
  nextListCursor,
} from "@/lib/list-cursor";
import type { Folder } from "@/server/types";

export class FolderRepository {
  constructor(private db: AdminClient) {}

  async list(
    userId: string,
    cursor?: string,
    limit = 50,
  ): Promise<{ folders: Folder[]; nextCursor: string | null }> {
    let query = this.db
      .from("folders")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit);

    if (cursor) {
      query = query.or(listCursorOrFilter(decodeListCursor(cursor)));
    }

    const { data, error } = await query;
    if (error) throw error;
    const folders = (data ?? []) as Folder[];
    return { folders, nextCursor: nextListCursor(folders, limit) };
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
