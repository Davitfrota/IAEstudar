import { requireAppUser } from "@/server/auth";
import { fail, AppError } from "@/server/http";
import { executeMcpTool } from "@/server/mcp/tools";
import {
  deletePendingPlan,
  getPendingPlan,
  preparePlanResume,
  toToolPlanPreview,
  updatePendingPlan,
} from "@/server/pending-plans";
import { publishPlanProgress } from "@/server/plan-progress";
import { updatePlanDraftSchema } from "@/server/schemas";
import { ConversationService } from "@/server/services/conversation-service";
import { createDbClient } from "@/lib/supabase/admin";

type Params = { params: Promise<{ planId: string }> };

function stripPlanMeta(input: Record<string, unknown>) {
  const next = { ...input };
  for (const key of Object.keys(next)) {
    if (key.startsWith("_")) delete next[key];
  }
  return next;
}

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

    // Resume: limpa steps com erro/running e renova TTL
    const hasPartial =
      plan.steps.some((s) => s.status === "done") &&
      plan.steps.some((s) => s.status !== "done");
    if (hasPartial) {
      plan = (await preparePlanResume(planId)) ?? plan;
    }

    try {
      const body = await request.json();
      const parsed = updatePlanDraftSchema.safeParse(body);
      if (parsed.success && parsed.data.draftQuestions) {
        for (const step of plan.steps) {
          if (
            step.tool === "generate_form" &&
            step.input._formRole === "course_review"
          ) {
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
        const folderIds = new Map<string, string>();
        const docIds = new Map<string, string>();
        const sessionByDay = new Map<
          number,
          { documentId: string; folderId?: string }
        >();
        let scheduleItems: Array<{
          id: string;
          position: number;
        }> = [];
        let boundScheduleId: string | undefined;
        let boundScheduleTitle: string | undefined;
        let linkedScheduleDocs = false;

        // Reconstrói IDs a partir de steps já concluídos (resume)
        for (const step of plan!.steps) {
          if (step.status !== "done" || !step.result) continue;
          const data = step.result as Record<string, unknown>;
          const raw = step.input;
          if (step.tool === "create_folder" && data.folderId) {
            const key =
              typeof raw._folderKey === "string" ? raw._folderKey : "root";
            folderIds.set(key, String(data.folderId));
          }
          if (step.tool === "create_document" && data.documentId) {
            const docKey =
              typeof raw._docKey === "string"
                ? raw._docKey
                : `doc_${docIds.size}`;
            docIds.set(docKey, String(data.documentId));
            if (typeof raw._dayIndex === "number") {
              const folderKey =
                typeof raw._folderKey === "string" ? raw._folderKey : undefined;
              sessionByDay.set(raw._dayIndex, {
                documentId: String(data.documentId),
                folderId: folderKey ? folderIds.get(folderKey) : undefined,
              });
            }
          }
          if (step.tool === "generate_schedule" && data.scheduleId) {
            boundScheduleId = String(data.scheduleId);
            boundScheduleTitle =
              typeof raw.title === "string" ? raw.title : undefined;
            const items = data.items as
              | Array<{ id: string; position?: number }>
              | undefined;
            if (Array.isArray(items)) {
              scheduleItems = items
                .map((it, idx) => ({
                  id: String(it.id),
                  position:
                    typeof it.position === "number" ? it.position : idx,
                }))
                .sort((a, b) => a.position - b.position);
            }
          }
        }

        for (const step of plan!.steps) {
          if (step.status === "done") continue;

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

          const raw = { ...step.input };
          const input: Record<string, unknown> = {
            ...(step.tool === "generate_schedule" ||
            step.tool === "generate_form" ||
            step.tool === "update_document"
              ? { ...raw, confirmed: true }
              : raw),
          };

          if (step.tool === "create_folder") {
            const parentKey = raw._parentFolderKey;
            if (typeof parentKey === "string" && folderIds.has(parentKey)) {
              input.parentFolderId = folderIds.get(parentKey);
            }
          }

          if (step.tool === "create_document") {
            const folderKey = raw._folderKey;
            if (typeof folderKey === "string" && folderIds.has(folderKey)) {
              input.folderId = folderIds.get(folderKey);
            } else if (folderIds.has("root")) {
              input.folderId = folderIds.get("root");
            }
          }

          if (step.tool === "generate_form") {
            const docKey = raw._docKey;
            if (typeof docKey === "string" && docIds.has(docKey)) {
              input.sourceDocumentId = docIds.get(docKey);
            } else if (docIds.has("summary")) {
              input.sourceDocumentId = docIds.get("summary");
            }

            const dayIndex =
              typeof raw._dayIndex === "number" ? raw._dayIndex : undefined;
            if (dayIndex != null && scheduleItems[dayIndex]) {
              input.scheduleItemId = scheduleItems[dayIndex]!.id;
            }

            if (
              plan!.draftQuestions?.length &&
              raw._formRole === "course_review" &&
              !input.questions
            ) {
              input.questions = plan!.draftQuestions;
            }
            delete input._deferredPreview;
          }

          if (
            step.tool === "generate_form" &&
            !linkedScheduleDocs &&
            scheduleItems.length > 0 &&
            sessionByDay.size > 0
          ) {
            const db = await createDbClient();
            for (const [dayIndex, session] of sessionByDay) {
              const item = scheduleItems[dayIndex];
              if (!item) continue;
              await db
                .from("schedule_items")
                .update({
                  document_id: session.documentId,
                  folder_id: session.folderId ?? null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", item.id)
                .eq("user_id", user.id);
            }
            linkedScheduleDocs = true;
          }

          const result = await executeMcpTool(
            { userId: user.id },
            step.tool,
            stripPlanMeta(input),
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
            await updatePendingPlan(planId, { steps: plan!.steps });
            break;
          }

          step.status = "done";
          step.result = result.data;
          const data = result.data as Record<string, unknown> | undefined;

          if (step.tool === "create_folder" && data?.folderId) {
            const key =
              typeof raw._folderKey === "string" ? raw._folderKey : "root";
            folderIds.set(key, String(data.folderId));
          }

          if (step.tool === "create_document" && data?.documentId) {
            const docId = String(data.documentId);
            const docKey =
              typeof raw._docKey === "string"
                ? raw._docKey
                : `doc_${docIds.size}`;
            docIds.set(docKey, docId);

            if (typeof raw._dayIndex === "number") {
              const folderKey =
                typeof raw._folderKey === "string" ? raw._folderKey : undefined;
              sessionByDay.set(raw._dayIndex, {
                documentId: docId,
                folderId: folderKey ? folderIds.get(folderKey) : undefined,
              });
            }
          }

          if (step.tool === "generate_schedule" && data?.scheduleId) {
            boundScheduleId = String(data.scheduleId);
            boundScheduleTitle =
              typeof step.input.title === "string"
                ? step.input.title
                : undefined;
            const items = data.items as
              | Array<{ id: string; position?: number }>
              | undefined;
            if (Array.isArray(items)) {
              scheduleItems = items
                .map((it, idx) => ({
                  id: String(it.id),
                  position:
                    typeof it.position === "number" ? it.position : idx,
                }))
                .sort((a, b) => a.position - b.position);
            }

            if (!linkedScheduleDocs && sessionByDay.size > 0) {
              const db = await createDbClient();
              for (const [dayIndex, session] of sessionByDay) {
                const item = scheduleItems[dayIndex];
                if (!item) continue;
                await db
                  .from("schedule_items")
                  .update({
                    document_id: session.documentId,
                    folder_id: session.folderId ?? null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", item.id)
                  .eq("user_id", user.id);
              }
              linkedScheduleDocs = true;
            }
          }

          await updatePendingPlan(planId, { steps: plan!.steps });

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

        let scheduleBound:
          | { conversationId: string; scheduleId: string; title: string }
          | undefined;

        if (!failed && boundScheduleId && plan!.conversationId) {
          try {
            const bound = await new ConversationService().bindSchedule(
              user.id,
              plan!.conversationId,
              boundScheduleId,
              boundScheduleTitle ?? plan!.summary,
            );
            scheduleBound = {
              conversationId: plan!.conversationId,
              scheduleId: bound.scheduleId,
              title: bound.title,
            };
          } catch (err) {
            console.warn(
              "[confirm] bindSchedule falhou:",
              err instanceof Error ? err.message : err,
            );
          }
        }

        const finalPlan = toToolPlanPreview(plan!, failed ? "error" : "done");
        send({ toolPlan: finalPlan, done: true, scheduleBound });
        await publishPlanProgress({
          planId,
          userId: user.id,
          event: "plan",
          toolPlan: finalPlan,
        });

        // Só apaga quando concluído com sucesso — em erro mantém para resume
        if (!failed) {
          await deletePendingPlan(planId);
        } else {
          await updatePendingPlan(planId, { steps: plan!.steps });
        }
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
