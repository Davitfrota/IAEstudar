import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { createFolderSchema, paginationSchema } from "@/server/schemas";
import { FolderService } from "@/server/services/folder-service";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    const url = new URL(request.url);
    const { cursor, limit, all } = paginationSchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      all: url.searchParams.get("all") ?? undefined,
    });
    const service = new FolderService();
    if (all) {
      const folders = await service.listAll(user.id, limit);
      return ok({ folders, nextCursor: null });
    }
    const { folders, nextCursor } = await service.list(user.id, cursor, limit);
    return ok({ folders, nextCursor });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = await parseJson(request, createFolderSchema);
    const folder = await new FolderService().create(user.id, body);
    return ok({ folder }, 201);
  } catch (error) {
    return fail(error);
  }
}
