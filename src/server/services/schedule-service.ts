import { addDays, formatISO, parseISO } from "date-fns";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import {
  localTodayIso,
  MAX_STUDY_PLAN_DAYS,
  studyPlanDayCount,
} from "@/server/date-utils";
import { assertGenerateRateLimit } from "@/server/rate-limit";
import { ScheduleRepository } from "@/server/repositories/schedule-repository";
import type { GenerateScheduleInput } from "@/server/schemas";

export class ScheduleService {
  private async repo() {
    return new ScheduleRepository(await createDbClient());
  }

  async listSchedules(userId: string) {
    return (await this.repo()).listSchedules(userId);
  }

  async listItems(userId: string, from?: string, to?: string) {
    return (await this.repo()).listItems(userId, from, to);
  }

  /**
   * Preenche TODOS os dias de hoje até targetDate (ou 14 dias).
   * Tópicos ciclam / repetem com rótulo de sessão quando há mais dias que tópicos.
   * Se há mais tópicos que dias, agrupa tópicos extras no mesmo dia.
   */
  async generate(userId: string, input: GenerateScheduleInput) {
    await assertGenerateRateLimit(userId, "generate_schedule");

    const start = parseISO(localTodayIso());
    const dayCount = studyPlanDayCount({
      targetDate: input.targetDate,
      maxDays: MAX_STUDY_PLAN_DAYS,
    });
    const end = addDays(start, dayCount - 1);
    const topics = input.topics.map((t) => t.trim()).filter(Boolean);
    if (topics.length === 0) {
      throw new AppError("Informe ao menos 1 tópico", 400, "INSUFFICIENT_TOPICS");
    }

    const sessions: { date: string; topic: string; position: number }[] = [];

    if (topics.length <= dayCount) {
      for (let i = 0; i < dayCount; i++) {
        const base = topics[i % topics.length]!;
        const round = Math.floor(i / topics.length) + 1;
        const rounds = Math.ceil(dayCount / topics.length);
        const topic =
          rounds > 1
            ? `${base} — sessão ${round}/${rounds}`
            : base;
        sessions.push({
          date: formatISO(addDays(start, i), { representation: "date" }),
          topic,
          position: i,
        });
      }
    } else {
      // Mais tópicos que dias: agrupa no dia
      for (let i = 0; i < dayCount; i++) {
        const chunk: string[] = [];
        for (let t = i; t < topics.length; t += dayCount) {
          chunk.push(topics[t]!);
        }
        sessions.push({
          date: formatISO(addDays(start, i), { representation: "date" }),
          topic: chunk.join(" · "),
          position: i,
        });
      }
    }

    const repo = await this.repo();
    const schedule = await repo.createSchedule(userId, {
      title: input.title,
      targetDate: input.targetDate ?? formatISO(end, { representation: "date" }),
      createdBy: "agent",
    });

    const duration = input.dailyMinutes ?? 30;
    const items = await repo.createItems(
      sessions.map((s) => ({
        schedule_id: schedule.id,
        user_id: userId,
        scheduled_date: s.date,
        duration_minutes: duration,
        topic: s.topic,
        position: s.position,
      })),
    );

    return {
      scheduleId: schedule.id,
      itemsCreated: items.length,
      dayCount,
      topicsUsed: topics.length,
      topicsSkipped: [] as string[],
      items,
    };
  }

  async updateItem(
    userId: string,
    itemId: string,
    patch: { scheduledDate?: string; status?: "pending" | "done" | "skipped" },
  ) {
    const repo = await this.repo();
    const existing = await repo.getItemOwned(userId, itemId);
    if (!existing) {
      throw new AppError("Sessão não encontrada", 404, "SCHEDULE_ITEM_NOT_FOUND");
    }
    // Nunca altera fsrs_due — schedule_item ≠ memória FSRS
    return repo.updateItem(userId, itemId, patch);
  }
}
