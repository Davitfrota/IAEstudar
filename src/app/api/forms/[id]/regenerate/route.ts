import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { FormService } from "@/server/services/form-service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const result = await new FormService().regenerate(user.id, id);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
