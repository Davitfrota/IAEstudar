import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { FolderService } from "@/server/services/folder-service";

type Params = { params: Promise<{ id: string }> };

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
