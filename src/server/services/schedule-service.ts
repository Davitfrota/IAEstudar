import { addDays, differenceInCalendarDays, formatISO, parseISO } from "date-fns";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { assertGenerateRateLimit } from "@/server/rate-limit";
import { ScheduleRepository } from "@/server/repositories/schedule-repository";
import type { GenerateScheduleInput } from "@/server/schemas";

function todayIsoDate() {
  return formatISO(new Date(), { representation: "date" });
}

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
   * Distribui 1 tópico por dia. Se não couber no intervalo, inclui o que cabe
   * e retorna topicsSkipped — não comprime sessões inviáveis.
   */
  async generate(userId: string, input: GenerateScheduleInput) {
    assertGenerateRateLimit(userId, "generate_schedule");

    const start = parseISO(todayIsoDate());
    const end = input.targetDate
      ? parseISO(input.targetDate)
      : addDays(start, 13);

    const dayCount = Math.max(1, differenceInCalendarDays(end, start) + 1);
    const topicsFitting = input.topics.slice(0, dayCount);
    const topicsSkipped = input.topics.slice(dayCount);

    if (topicsFitting.length === 0) {
      throw new AppError(
        "Sem tópicos suficientes para o intervalo pedido — envie mais contexto",
        400,
        "INSUFFICIENT_TOPICS",
      );
    }

    const repo = await this.repo();
    const schedule = await repo.createSchedule(userId, {
      title: input.title,
      targetDate: input.targetDate ?? formatISO(end, { representation: "date" }),
      createdBy: "agent",
    });

    const duration = input.dailyMinutes ?? 30;
    const items = await repo.createItems(
      topicsFitting.map((topic, index) => ({
        schedule_id: schedule.id,
        user_id: userId,
        scheduled_date: formatISO(addDays(start, index), {
          representation: "date",
        }),
        duration_minutes: duration,
        topic,
        position: index,
      })),
    );

    return {
      scheduleId: schedule.id,
      itemsCreated: items.length,
      topicsSkipped,
      items,
    };
  }
}
