import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { createDocumentSchema, paginationSchema } from "@/server/schemas";
import { DocumentService } from "@/server/services/document-service";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    const url = new URL(request.url);
    const { cursor, limit } = paginationSchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const documents = await new DocumentService().list(user.id, cursor, limit);
    return ok({ documents });
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
