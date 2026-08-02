import { createDbClient } from "@/lib/supabase/admin";
import { localOffsetIso, localTodayIso } from "@/server/date-utils";
import { AppError } from "@/server/http";
import type {
  ConversationListItem,
  ConversationMessageRow,
} from "@/server/types/conversation";

export type { ConversationListItem, ConversationMessageRow };

export class ConversationService {
  async list(userId: string, limit = 40): Promise<ConversationListItem[]> {
    const db = await createDbClient();
    const { data, error } = await db
      .from("conversations")
      .select(
        "id, title, schedule_id, created_at, updated_at, study_schedules(title)",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data ?? []).map((row) => {
      const schedule = row.study_schedules as
        | { title: string }
        | { title: string }[]
        | null;
      const scheduleTitle = Array.isArray(schedule)
        ? (schedule[0]?.title ?? null)
        : (schedule?.title ?? null);

      return {
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        scheduleId: (row.schedule_id as string | null) ?? null,
        scheduleTitle,
        updatedAt: row.updated_at as string,
        createdAt: row.created_at as string,
      };
    });
  }

  async getWithMessages(
    userId: string,
    conversationId: string,
  ): Promise<{
    conversation: ConversationListItem;
    messages: ConversationMessageRow[];
  }> {
    const db = await createDbClient();
    const { data: conv, error } = await db
      .from("conversations")
      .select(
        "id, title, schedule_id, created_at, updated_at, study_schedules(title)",
      )
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!conv) throw new AppError("Conversa não encontrada", 404, "NOT_FOUND");

    const schedule = conv.study_schedules as
      | { title: string }
      | { title: string }[]
      | null;
    const scheduleTitle = Array.isArray(schedule)
      ? (schedule[0]?.title ?? null)
      : (schedule?.title ?? null);

    const { data: messages, error: msgError } = await db
      .from("conversation_messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(200);

    if (msgError) throw msgError;

    return {
      conversation: {
        id: conv.id as string,
        title: (conv.title as string | null) ?? null,
        scheduleId: (conv.schedule_id as string | null) ?? null,
        scheduleTitle,
        updatedAt: conv.updated_at as string,
        createdAt: conv.created_at as string,
      },
      messages: (messages ?? []).map((m) => ({
        id: m.id as string,
        role: m.role as "user" | "assistant" | "tool",
        content: (m.content as string) || "",
        createdAt: m.created_at as string,
      })),
    };
  }

  async touchTitle(
    userId: string,
    conversationId: string,
    title: string,
    opts?: { force?: boolean },
  ): Promise<void> {
    const db = await createDbClient();
    const trimmed = title.trim().slice(0, 120);
    if (!trimmed) return;

    const { data } = await db
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!data || (!opts?.force && data.title)) return;

    await db
      .from("conversations")
      .update({ title: trimmed })
      .eq("id", conversationId)
      .eq("user_id", userId);
  }

  async bindSchedule(
    userId: string,
    conversationId: string,
    scheduleId: string,
    title?: string,
  ): Promise<{ title: string; scheduleId: string }> {
    const db = await createDbClient();

    const { data: schedule, error: sErr } = await db
      .from("study_schedules")
      .select("id, title")
      .eq("id", scheduleId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (sErr) throw sErr;
    if (!schedule) {
      throw new AppError("Cronograma não encontrado", 404, "NOT_FOUND");
    }

    const { data: existingConv } = await db
      .from("conversations")
      .select("title")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();

    const nextTitle =
      (existingConv?.title as string | null)?.trim() ||
      title?.trim().slice(0, 120) ||
      (schedule.title as string) ||
      "Plano de estudo";

    const { error } = await db
      .from("conversations")
      .update({
        schedule_id: scheduleId,
        title: nextTitle.slice(0, 120),
      })
      .eq("id", conversationId)
      .eq("user_id", userId);

    if (error) throw error;

    return { title: nextTitle, scheduleId };
  }

  async getScheduleContext(
    userId: string,
    scheduleId: string,
  ): Promise<string | null> {
    const db = await createDbClient();
    const { data: schedule } = await db
      .from("study_schedules")
      .select("id, title, target_date, status")
      .eq("id", scheduleId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!schedule) return null;

    const today = localTodayIso();
    const yesterday = localOffsetIso(-1);

    const { data: items } = await db
      .from("schedule_items")
      .select("scheduled_date, topic, status, duration_minutes")
      .eq("schedule_id", scheduleId)
      .eq("user_id", userId)
      .gte("scheduled_date", yesterday)
      .lte("scheduled_date", today)
      .order("scheduled_date", { ascending: true })
      .order("position", { ascending: true });

    const lines = [
      `Cronograma vinculado: “${schedule.title}” (status: ${schedule.status}${schedule.target_date ? `, meta: ${schedule.target_date}` : ""}).`,
      "Itens de ontem e hoje:",
    ];

    if (!items?.length) {
      lines.push("- Nenhum item nestes dias.");
    } else {
      for (const item of items) {
        lines.push(
          `- ${item.scheduled_date}: ${item.topic ?? "estudo"} — ${item.status} (${item.duration_minutes} min)`,
        );
      }
    }

    lines.push(
      "Você é Nara, tutora DESTE cronograma: verifique ontem/hoje primeiro; se ontem não foi feito, pergunte o motivo; use list_due para avisar revisões vencidas; feche com resumo curto.",
    );

    return lines.join("\n");
  }
}
