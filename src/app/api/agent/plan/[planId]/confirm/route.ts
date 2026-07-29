import { requireAppUser } from "@/server/auth";
import { fail, AppError } from "@/server/http";
import { executeMcpTool } from "@/server/mcp/tools";
import {
  deletePendingPlan,
  getPendingPlan,
  toToolPlanPreview,
  updatePendingPlan,
} from "@/server/pending-plans";
import { publishPlanProgress } from "@/server/plan-progress";
import { updatePlanDraftSchema } from "@/server/schemas";

type Params = { params: Promise<{ planId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { planId } = await params;
    let plan = await getPendingPlan(planId);

    if (!plan || plan.expiresAt <= Date.now()) {
      if (plan) await deletePendingPlan(planId);
      throw new AppError("Plano expirado ou inexistente", 410, "PLAN_EXPIRED");
    }
    if (plan.userId !== user.id) {
      throw new AppError("Plano de outro usuário", 403, "PLAN_FORBIDDEN");
    }

    try {
      const body = await request.json();
      const parsed = updatePlanDraftSchema.safeParse(body);
      if (parsed.success && parsed.data.draftQuestions) {
        for (const step of plan.steps) {
          if (step.tool === "generate_form") {
            step.input = {
              ...step.input,
              questions: parsed.data.draftQuestions,
              confirmed: true,
            };
          }
        }
        plan =
          (await updatePendingPlan(planId, {
            draftQuestions: parsed.data.draftQuestions,
            steps: plan.steps,
          })) ?? plan;
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

        const executing = toToolPlanPreview(plan!, "executing");
        send({ toolPlan: executing });
        await publishPlanProgress({
          planId,
          userId: user.id,
          event: "plan",
          toolPlan: executing,
        });

        let failed = false;
        let lastFolderId: string | undefined;
        let lastDocumentId: string | undefined;
        let firstDocumentId: string | undefined;

        for (const step of plan!.steps) {
          step.status = "running";
          await updatePendingPlan(planId, { steps: plan!.steps });

          const progressRunning = {
            stepId: step.id,
            tool: step.tool,
            status: "running" as const,
          };
          send({ stepProgress: progressRunning });
          await publishPlanProgress({
            planId,
            userId: user.id,
            event: "step",
            step: progressRunning,
          });

          const input: Record<string, unknown> = {
            ...(step.tool === "generate_schedule" ||
            step.tool === "generate_form" ||
            step.tool === "update_document"
              ? { ...step.input, confirmed: true }
              : step.input),
          };

          if (step.tool === "create_document" && lastFolderId) {
            input.folderId = lastFolderId;
          }
          if (step.tool === "generate_form") {
            // Flashcards a partir do resumo (primeiro doc), não do último arquivo do dia
            const sourceId = firstDocumentId ?? lastDocumentId;
            if (sourceId) {
              input.sourceDocumentId = sourceId;
            }
            if (plan!.draftQuestions?.length && !input.questions) {
              input.questions = plan!.draftQuestions;
            }
            delete input._deferredPreview;
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
            const progressError = {
              stepId: step.id,
              tool: step.tool,
              status: "error" as const,
              error: result.error,
            };
            send({ stepProgress: progressError });
            await publishPlanProgress({
              planId,
              userId: user.id,
              event: "step",
              step: progressError,
            });
            break;
          }

          step.status = "done";
          step.result = result.data;
          const data = result.data as Record<string, unknown> | undefined;
          if (step.tool === "create_folder" && data?.folderId) {
            lastFolderId = String(data.folderId);
          }
          if (step.tool === "create_document" && data?.documentId) {
            lastDocumentId = String(data.documentId);
            firstDocumentId ??= lastDocumentId;
          }

          const progressDone = {
            stepId: step.id,
            tool: step.tool,
            status: "done" as const,
            result: result.data,
          };
          send({ stepProgress: progressDone });
          await publishPlanProgress({
            planId,
            userId: user.id,
            event: "step",
            step: progressDone,
          });
        }

        const finalPlan = toToolPlanPreview(plan!, failed ? "error" : "done");
        send({ toolPlan: finalPlan, done: true });
        await publishPlanProgress({
          planId,
          userId: user.id,
          event: "plan",
          toolPlan: finalPlan,
        });

        await deletePendingPlan(planId);
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
