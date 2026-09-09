import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { createDocumentSchema, paginationSchema } from "@/server/schemas";
import { DocumentService } from "@/server/services/document-service";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    const url = new URL(request.url);
    const { cursor, limit, all } = paginationSchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      all: url.searchParams.get("all") ?? undefined,
    });
    const service = new DocumentService();
    if (all) {
      const documents = await service.listAll(user.id, limit);
      return ok({ documents, nextCursor: null });
    }
    const { documents, nextCursor } = await service.list(
      user.id,
      cursor,
      limit,
    );
    return ok({ documents, nextCursor });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = await parseJson(request, createDocumentSchema);
    const document = await new DocumentService().create(user.id, body);
    return ok({ document }, 201);
  } catch (error) {
    return fail(error);
  }
}
