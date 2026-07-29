import type { AdminClient } from "@/lib/supabase/admin";
import type { Document } from "@/server/types";

export class DocumentRepository {
  constructor(private db: AdminClient) {}

  async list(userId: string, cursor?: string, limit = 50): Promise<Document[]> {
    let query = this.db
      .from("documents")
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
    return (data ?? []) as Document[];
  }

  async getOwned(userId: string, documentId: string): Promise<Document | null> {
    const { data, error } = await this.db
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return data as Document | null;
  }

  async create(
    userId: string,
    input: {
      title: string;
      folderId?: string | null;
      content?: unknown;
      contentText?: string;
    },
  ): Promise<Document> {
    const { data, error } = await this.db
      .from("documents")
      .insert({
        user_id: userId,
        title: input.title,
        folder_id: input.folderId ?? null,
        content: input.content ?? [],
        content_text: input.contentText ?? "",
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as Document;
  }

  async update(
    userId: string,
    documentId: string,
    input: {
      title?: string;
      folderId?: string | null;
      content?: unknown;
      contentText?: string;
    },
  ): Promise<Document> {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.folderId !== undefined) patch.folder_id = input.folderId;
    if (input.content !== undefined) patch.content = input.content;
    if (input.contentText !== undefined) patch.content_text = input.contentText;

    const { data, error } = await this.db
      .from("documents")
      .update(patch)
      .eq("id", documentId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error) throw error;
    return data as Document;
  }

  async softDelete(userId: string, documentId: string): Promise<void> {
    const { error } = await this.db
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", documentId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw error;
  }
}
