import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { ConversationService } from "@/server/services/conversation-service";

export async function GET() {
  try {
    const user = await requireAppUser();
    const conversations = await new ConversationService().list(user.id);
    return ok({ conversations });
  } catch (error) {
    return fail(error);
  }
}
