import type { AdminClient } from "@/lib/supabase/admin";
import {
  fetchAllRows,
  POSTGREST_MAX_ROWS,
} from "@/server/fetch-all-rows";
import { AppError } from "@/server/http";
import type { ScheduleItem, StudySchedule } from "@/server/types";

const INSERT_CHUNK = 500;

export class ScheduleRepository {
  constructor(private db: AdminClient) {}

  async listSchedules(userId: string): Promise<StudySchedule[]> {
    return fetchAllRows<StudySchedule>((from, to) =>
      this.db
        .from("study_schedules")
        .select("*")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
  }

  async listItems(
    userId: string,
    from?: string,
    to?: string,
  ): Promise<ScheduleItem[]> {
    return fetchAllRows<ScheduleItem>((rangeFrom, rangeTo) => {
      let query = this.db
        .from("schedule_items")
        .select("*")
        .eq("user_id", userId)
        .order("scheduled_date", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true });

      if (from) query = query.gte("scheduled_date", from);
      if (to) query = query.lte("scheduled_date", to);

      return query.range(rangeFrom, rangeTo);
    });
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
    if (items.length === 0) return [];

    // PostgREST max_rows também limita o retorno do INSERT…SELECT.
    // Chunks abaixo do limite evitam subcontar sessões criadas.
    const created: ScheduleItem[] = [];
    for (let i = 0; i < items.length; i += INSERT_CHUNK) {
      const chunk = items.slice(i, i + INSERT_CHUNK);
      if (chunk.length > POSTGREST_MAX_ROWS) {
        throw new AppError(
          "Lote de sessões excede o limite do PostgREST",
          500,
          "SCHEDULE_INSERT_TOO_LARGE",
        );
      }

      const { data, error } = await this.db
        .from("schedule_items")
        .insert(chunk)
        .select("*");

      if (error) throw error;

      const rows = (data ?? []) as ScheduleItem[];
      if (rows.length !== chunk.length) {
        throw new AppError(
          "Falha ao persistir sessões do cronograma (retorno truncado)",
          500,
          "SCHEDULE_INSERT_TRUNCATED",
        );
      }
      created.push(...rows);
    }

    return created;
  }
}
