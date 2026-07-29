import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { documentContentSchema } from "@/server/schemas";
import { DocumentService, extractContentText } from "@/server/services/document-service";

type Params = { params: Promise<{ id: string }> };

/** Autosave do BlockNote — debounce no client (2s). */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const body = await parseJson(request, documentContentSchema);
    const contentText =
      body.contentText ?? extractContentText(body.content);

    const document = await new DocumentService().update(user.id, id, {
      content: body.content,
      contentText,
    });

    return ok({ document, saveStatus: "saved" as const });
  } catch (error) {
    return fail(error);
  }
}
