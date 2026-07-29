import { requireAppUser } from "@/server/auth";
import { fail, AppError } from "@/server/http";
import { executeMcpTool } from "@/server/mcp/tools";
import {
  deletePendingPlan,
  getPendingPlan,
  toToolPlanPreview,
  updatePendingPlan,
} from "@/server/pending-plans";
import { updatePlanDraftSchema } from "@/server/schemas";

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { planId } = await params;
    const plan = getPendingPlan(planId);

    if (!plan || plan.expiresAt <= Date.now()) {
      if (plan) deletePendingPlan(planId);
      throw new AppError("Plano expirado ou inexistente", 410, "PLAN_EXPIRED");
    }
    if (plan.userId !== user.id) {
      throw new AppError("Plano de outro usuário", 403, "PLAN_FORBIDDEN");
    }

    // Atualiza rascunho de perguntas se enviado
    try {
      const body = await request.json();
      const parsed = updatePlanDraftSchema.safeParse(body);
      if (parsed.success && parsed.data.draftQuestions) {
        updatePendingPlan(planId, {
          draftQuestions: parsed.data.draftQuestions,
        });
        for (const step of plan.steps) {
          if (step.tool === "generate_form") {
            step.input = {
              ...step.input,
              questions: parsed.data.draftQuestions,
              confirmed: true,
            };
          }
        }
      }
    } catch {
      // body vazio ok
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        };

        send({
          toolPlan: toToolPlanPreview(plan, "executing"),
        });

        let failed = false;

        for (const step of plan.steps) {
          step.status = "running";
          send({
            stepProgress: {
              stepId: step.id,
              tool: step.tool,
              status: "running",
            },
          });

          const input =
            step.tool === "generate_schedule" ||
            step.tool === "generate_form" ||
            step.tool === "update_document"
              ? { ...step.input, confirmed: true }
              : step.input;

          if (
            step.tool === "generate_form" &&
            plan.draftQuestions?.length &&
            !input.questions
          ) {
            input.questions = plan.draftQuestions;
          }

          const result = await executeMcpTool(
            { userId: user.id },
            step.tool,
            input,
          );

          if (result.status === "error") {
            failed = true;
            step.status = "error";
            step.error = result.error;
            send({
              stepProgress: {
                stepId: step.id,
                tool: step.tool,
                status: "error",
                error: result.error,
              },
            });
            break;
          }

          step.status = "done";
          step.result = result.data;
          send({
            stepProgress: {
              stepId: step.id,
              tool: step.tool,
              status: "done",
              result: result.data,
            },
          });
        }

        send({
          toolPlan: toToolPlanPreview(plan, failed ? "error" : "done"),
          done: true,
        });

        deletePendingPlan(planId);
        controller.close();
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
