import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { updateScheduleItemSchema } from "@/server/schemas";
import { ScheduleService } from "@/server/services/schedule-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const body = await parseJson(request, updateScheduleItemSchema);
    const item = await new ScheduleService().updateItem(user.id, id, body);
    return ok({ item });
  } catch (error) {
    return fail(error);
  }
}
