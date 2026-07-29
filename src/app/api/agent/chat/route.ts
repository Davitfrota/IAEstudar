import { requireAppUser } from "@/server/auth";
import { fail, AppError } from "@/server/http";
import { agentChatSchema } from "@/server/schemas";
import { runAgentChat } from "@/server/mcp/agent";

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = agentChatSchema.parse(await request.json());

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(
            encoder.encode(`${JSON.stringify(payload)}\n`),
          );
        };

        try {
          for await (const event of runAgentChat({
            userId: user.id,
            message: body.message,
            conversationId: body.conversationId,
          })) {
            if (event.type === "textDelta") {
              send({ textDelta: event.textDelta });
            } else if (event.type === "toolCall") {
              send({ toolCall: event.toolCall });
            } else if (event.type === "conversation") {
              send({ conversationId: event.conversationId });
            } else if (event.type === "error") {
              send({ error: event.message });
            } else if (event.type === "done") {
              send({ done: true });
            }
          }
        } catch (error) {
          const message =
            error instanceof AppError
              ? error.message
              : error instanceof Error
                ? error.message
                : "Erro no agente";
          send({ error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
