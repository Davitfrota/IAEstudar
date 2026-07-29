import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { updateDocumentSchema } from "@/server/schemas";
import { DocumentService } from "@/server/services/document-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const document = await new DocumentService().get(user.id, id);
    return ok({ document });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const body = await parseJson(request, updateDocumentSchema);
    const document = await new DocumentService().update(user.id, id, body);
    return ok({ document });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    await new DocumentService().softDelete(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
