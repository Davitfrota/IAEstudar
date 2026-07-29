import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { generateScheduleApiSchema } from "@/server/schemas";
import { ScheduleService } from "@/server/services/schedule-service";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? undefined;
    const to = url.searchParams.get("to") ?? undefined;
    const service = new ScheduleService();
    const [schedules, items] = await Promise.all([
      service.listSchedules(user.id),
      service.listItems(user.id, from, to),
    ]);
    return ok({ schedules, items });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = await parseJson(request, generateScheduleApiSchema);

    if (!body.confirmed) {
      return ok({
        status: "pending_confirmation",
        preview: {
          title: body.title,
          topics: body.topics,
          targetDate: body.targetDate ?? null,
          dailyMinutes: body.dailyMinutes ?? 30,
          estimatedSessions: body.topics.length,
        },
      });
    }

    const result = await new ScheduleService().generate(user.id, body);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
