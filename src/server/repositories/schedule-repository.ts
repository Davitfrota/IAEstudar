import type { AdminClient } from "@/lib/supabase/admin";
import type { ScheduleItem, StudySchedule } from "@/server/types";

export class ScheduleRepository {
  constructor(private db: AdminClient) {}

  async listSchedules(userId: string): Promise<StudySchedule[]> {
    const { data, error } = await this.db
      .from("study_schedules")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as StudySchedule[];
  }

  async listItems(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<ScheduleItem[]> {
    let query = this.db
      .from("schedule_items")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: true })
      .order("position", { ascending: true });

    if (from) query = query.gte("scheduled_date", from);
    if (to) query = query.lte("scheduled_date", to);

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ScheduleItem[];
  }

  async createSchedule(
    userId: string,
    input: {
      title: string;
      targetDate?: string | null;
      createdBy?: "user" | "agent";
    },
  ): Promise<StudySchedule> {
    const { data, error } = await this.db
      .from("study_schedules")
      .insert({
        user_id: userId,
        title: input.title,
        target_date: input.targetDate ?? null,
        created_by: input.createdBy ?? "agent",
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as StudySchedule;
  }

  async createItems(
    items: Array<{
      schedule_id: string;
      user_id: string;
      scheduled_date: string;
      duration_minutes: number;
      topic?: string | null;
      position: number;
      folder_id?: string | null;
      document_id?: string | null;
    }>,
  ): Promise<ScheduleItem[]> {
    const { data, error } = await this.db
      .from("schedule_items")
      .insert(items)
      .select("*");

    if (error) throw error;
    return (data ?? []) as ScheduleItem[];
  }

  async softDelete(userId: string, scheduleId: string): Promise<void> {
    const { error } = await this.db
      .from("study_schedules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", scheduleId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw error;
  }
}
