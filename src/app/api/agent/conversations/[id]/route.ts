import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { ConversationService } from "@/server/services/conversation-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const result = await new ConversationService().getWithMessages(
      user.id,
      id,
    );
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
