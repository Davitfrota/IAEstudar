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

  async softDelete(userId: string, folderId: string): Promise<void> {
    const { error } = await this.db
      .from("folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", folderId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw error;
  }

  async update(
    userId: string,
    folderId: string,
    input: {
      name?: string;
      parentFolderId?: string | null;
      position?: number;
    },
  ): Promise<Folder> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) patch.name = input.name;
    if (input.parentFolderId !== undefined) {
      patch.parent_folder_id = input.parentFolderId;
    }
    if (input.position !== undefined) patch.position = input.position;

    const { data, error } = await this.db
      .from("folders")
      .update(patch)
      .eq("id", folderId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw error;
    return data as Folder;
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
