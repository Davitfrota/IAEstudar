import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { FormService } from "@/server/services/form-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const service = new FormService();
    const form = await service.get(user.id, id);
    const questions = await service.listPracticeQueue(user.id, id);
    return ok({ form, questions });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    await new FormService().softDelete(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
