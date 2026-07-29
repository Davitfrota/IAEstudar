import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { updateFolderSchema } from "@/server/schemas";
import { FolderService } from "@/server/services/folder-service";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const body = await parseJson(request, updateFolderSchema);
    const folder = await new FolderService().update(user.id, id, body);
    return ok({ folder });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    await new FolderService().softDelete(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
