import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { generateFormSchema } from "@/server/schemas";
import { FormService } from "@/server/services/form-service";

export async function GET() {
  try {
    const user = await requireAppUser();
    const service = new FormService();
    const [forms, dueCount] = await Promise.all([
      service.list(user.id),
      service.countDue(user.id),
    ]);
    return ok({ forms, dueCount });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = await parseJson(request, generateFormSchema);
    const service = new FormService();

    if (!body.confirmed) {
      const preview = await service.previewGenerate(user.id, body);
      return ok(preview);
    }

    const result = await service.generate(user.id, body);
    return ok(result, 201);
  } catch (error) {
    return fail(error);
  }
}
