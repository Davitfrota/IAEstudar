import { z } from "zod";
import { AppError } from "@/server/http";
import { AgentActionRepository } from "@/server/repositories/agent-action-repository";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createDocumentSchema,
  createFolderSchema,
  generateFormSchema,
  generateScheduleSchema,
  listDueSchema,
  recordReviewSchema,
} from "@/server/schemas";
import { DocumentService } from "@/server/services/document-service";
import { FolderService } from "@/server/services/folder-service";
import { FormService } from "@/server/services/form-service";
import { ScheduleService } from "@/server/services/schedule-service";

export type ToolContext = {
  userId: string;
};

export type ToolResult = {
  status: "success" | "error" | "pending_confirmation";
  data?: unknown;
  error?: string;
};

type ToolHandler = (
  ctx: ToolContext,
  input: unknown,
) => Promise<ToolResult>;

async function withAudit(
  ctx: ToolContext,
  toolName: string,
  input: unknown,
  run: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const audit = new AgentActionRepository(createAdminClient());
  try {
    const result = await run();
    await audit.log({
      userId: ctx.userId,
      toolName,
      input,
      output: result.data ?? { error: result.error },
      status: result.status,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Erro desconhecido";
    await audit.log({
      userId: ctx.userId,
      toolName,
      input,
      output: { error: message },
      status: "error",
    });
    return { status: "error", error: message };
  }
}

export const mcpToolDefinitions = [
  {
    name: "create_folder",
    description: "Cria uma pasta de estudo para o usuário autenticado.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        parentFolderId: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_document",
    description: "Cria um documento (anotações) opcionalmente dentro de uma pasta.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        folderId: { type: "string" },
        initialContent: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "generate_schedule",
    description:
      "Gera um cronograma distribuindo tópicos entre hoje e targetDate (ou 14 dias). Requer confirmação do usuário antes de persistir se confirmed=false.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        topics: { type: "array", items: { type: "string" } },
        targetDate: { type: "string", description: "YYYY-MM-DD futuro" },
        dailyMinutes: { type: "number" },
        confirmed: { type: "boolean" },
      },
      required: ["title", "topics"],
    },
  },
  {
    name: "generate_form",
    description:
      "Gera formulário (flashcard_deck|quiz|open_form) a partir de um documento. Exige confirmação explícita (confirmed=true) para persistir.",
    inputSchema: {
      type: "object",
      properties: {
        sourceDocumentId: { type: "string" },
        type: {
          type: "string",
          enum: ["flashcard_deck", "quiz", "open_form"],
        },
        instruction: { type: "string" },
        questionCount: { type: "number" },
        confirmed: { type: "boolean" },
      },
      required: ["sourceDocumentId", "type", "instruction"],
    },
  },
  {
    name: "record_review",
    description: "Registra revisão FSRS (again|hard|good|easy) de uma questão.",
    inputSchema: {
      type: "object",
      properties: {
        formQuestionId: { type: "string" },
        rating: {
          type: "string",
          enum: ["again", "hard", "good", "easy"],
        },
      },
      required: ["formQuestionId", "rating"],
    },
  },
  {
    name: "list_due",
    description: "Lista questões com fsrs_due <= agora (ou date informada).",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string" },
        folderId: { type: "string" },
      },
    },
  },
] as const;

const generateScheduleWithConfirmSchema = generateScheduleSchema.and(
  z.object({ confirmed: z.boolean().optional().default(false) }),
);

const handlers: Record<string, ToolHandler> = {
  create_folder: async (ctx, raw) =>
    withAudit(ctx, "create_folder", raw, async () => {
      const input = createFolderSchema.parse(raw);
      const folder = await new FolderService().create(ctx.userId, input);
      return { status: "success", data: { folderId: folder.id } };
    }),

  create_document: async (ctx, raw) =>
    withAudit(ctx, "create_document", raw, async () => {
      const input = createDocumentSchema.parse(raw);
      const doc = await new DocumentService().create(ctx.userId, input);
      return { status: "success", data: { documentId: doc.id } };
    }),

  generate_schedule: async (ctx, raw) =>
    withAudit(ctx, "generate_schedule", raw, async () => {
      const input = generateScheduleWithConfirmSchema.parse(raw);
      if (!input.confirmed) {
        return {
          status: "pending_confirmation",
          data: {
            preview: {
              title: input.title,
              topics: input.topics,
              targetDate: input.targetDate ?? null,
              dailyMinutes: input.dailyMinutes ?? 30,
              estimatedSessions: input.topics.length,
            },
            message:
              "Confirme com o usuário e chame novamente com confirmed=true",
          },
        };
      }

      const result = await new ScheduleService().generate(ctx.userId, input);
      return {
        status: "success",
        data: {
          scheduleId: result.scheduleId,
          itemsCreated: result.itemsCreated,
          topicsSkipped: result.topicsSkipped,
        },
      };
    }),

  generate_form: async (ctx, raw) =>
    withAudit(ctx, "generate_form", raw, async () => {
      const input = generateFormSchema.parse(raw);
      const forms = new FormService();

      if (!input.confirmed) {
        const preview = await forms.previewGenerate(ctx.userId, input);
        return {
          status: "pending_confirmation",
          data: {
            ...preview,
            message:
              "Mostre o preview ao usuário e chame novamente com confirmed=true",
          },
        };
      }

      const result = await forms.generate(ctx.userId, input);
      return { status: "success", data: result };
    }),

  record_review: async (ctx, raw) =>
    withAudit(ctx, "record_review", raw, async () => {
      const input = recordReviewSchema.parse(raw);
      const result = await new FormService().recordReview(
        ctx.userId,
        input.formQuestionId,
        input.rating,
      );
      return { status: "success", data: result };
    }),

  list_due: async (ctx, raw) =>
    withAudit(ctx, "list_due", raw, async () => {
      const input = listDueSchema.parse(raw ?? {});
      const questions = await new FormService().listDue(ctx.userId, input);
      return { status: "success", data: { questions } };
    }),
};

export async function executeMcpTool(
  ctx: ToolContext,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) {
    return { status: "error", error: `Ferramenta desconhecida: ${name}` };
  }
  return handler(ctx, input);
}

/** Ferramentas no formato Anthropic Messages API tool definitions. */
export function anthropicTools() {
  return mcpToolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}
