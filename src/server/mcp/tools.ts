import { z } from "zod";
import { createDbClient } from "@/lib/supabase/admin";
import {
  createDocumentSchema,
  createFolderSchema,
  generateFormSchema,
  generateScheduleSchema,
  listDueSchema,
  mcpUpdateDocumentSchema,
  recordReviewSchema,
} from "@/server/schemas";
import { DocumentService } from "@/server/services/document-service";
import { FolderService } from "@/server/services/folder-service";
import { FormService } from "@/server/services/form-service";
import { ScheduleService } from "@/server/services/schedule-service";
import { AppError } from "@/server/http";
import { AgentActionRepository } from "@/server/repositories/agent-action-repository";

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
  const audit = new AgentActionRepository(await createDbClient());
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
    name: "propose_study_plan",
    description:
      "PREFIRA esta tool quando o usuário pedir setup completo de estudo. Cria pasta do tema + resumo geral + arquivos por tópico OU por dia + cronograma (todos os dias até a data) + flashcards opcionais. Uma única chamada.",
    inputSchema: {
      type: "object",
      properties: {
        folderName: { type: "string" },
        documentTitle: { type: "string" },
        documentContent: {
          type: "string",
          description: "Resumo de estudo com ≥50 caracteres",
        },
        scheduleTitle: { type: "string" },
        topics: { type: "array", items: { type: "string" } },
        targetDate: {
          type: "string",
          description: "YYYY-MM-DD futuro (ex.: 2026-08-15)",
        },
        dailyMinutes: { type: "number" },
        includeForm: { type: "boolean" },
        formType: {
          type: "string",
          enum: ["flashcard_deck", "quiz", "open_form"],
        },
        formInstruction: { type: "string" },
        questionCount: { type: "number" },
        organizationMode: {
          type: "string",
          enum: ["by_topic", "by_day"],
          description:
            "by_topic = um arquivo por tópico; by_day = um arquivo por dia de estudo. Default by_topic.",
        },
        lessonNotes: {
          type: "array",
          description:
            "Conteúdo de cada arquivo extra (além do resumo). Em by_topic: um por tópico. Em by_day: um por dia.",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              content: { type: "string" },
            },
            required: ["title", "content"],
          },
        },
      },
      required: [
        "folderName",
        "documentTitle",
        "documentContent",
        "scheduleTitle",
        "topics",
      ],
    },
  },
  {
    name: "create_folder",
    description:
      "Cria só uma pasta. Para setup completo (pasta+doc+agenda+cards), use propose_study_plan.",
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
    description:
      "Cria só um documento. Para setup completo, use propose_study_plan.",
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
    name: "update_document",
    description:
      "Atualiza título e/ou conteúdo textual de um documento existente. Se o documento já tem conteúdo e contentText for enviado, exige confirmed=true (não sobrescreve sem confirmação).",
    inputSchema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        title: { type: "string" },
        contentText: { type: "string" },
        folderId: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "generate_schedule",
    description:
      "Gera só um cronograma. Para setup completo, use propose_study_plan. Requer confirmed=false até a UI confirmar.",
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
      "Gera só um formulário a partir de documento existente. Para setup novo completo, use propose_study_plan.",
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
  propose_study_plan: async (_ctx, raw) => ({
    status: "pending_confirmation",
    data: {
      message: "Plano consolidado aguardando confirmação na UI",
      draft: raw,
    },
  }),
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

  update_document: async (ctx, raw) =>
    withAudit(ctx, "update_document", raw, async () => {
      const input = mcpUpdateDocumentSchema.parse(raw);
      const docs = new DocumentService();
      const existing = await docs.get(ctx.userId, input.documentId);
      const hasContent = (existing.content_text ?? "").trim().length > 0;

      if (input.contentText && hasContent && !input.confirmed) {
        return {
          status: "pending_confirmation",
          data: {
            preview: {
              documentId: input.documentId,
              currentTitle: existing.title,
              newTitle: input.title ?? existing.title,
              currentLength: existing.content_text.length,
              newLength: input.contentText.length,
              previewText: input.contentText.slice(0, 280),
            },
            message:
              "Documento já tem conteúdo. Confirme com o usuário e chame com confirmed=true para sobrescrever.",
          },
        };
      }

      if (!input.title && !input.contentText && input.folderId === undefined) {
        return {
          status: "error",
          error: "Informe title, contentText ou folderId para atualizar",
        };
      }

      const content = input.contentText
        ? [
            {
              type: "paragraph",
              content: [{ type: "text", text: input.contentText }],
            },
          ]
        : undefined;

      const updated = await docs.update(ctx.userId, input.documentId, {
        title: input.title,
        folderId: input.folderId,
        content,
        contentText: input.contentText,
      });

      return {
        status: "success",
        data: {
          documentId: updated.id,
          title: updated.title,
          contentLength: updated.content_text.length,
        },
      };
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

/** Ferramentas no formato OpenAI / Groq function calling. */
export function openaiTools() {
  return mcpToolDefinitions.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

/** @deprecated Use openaiTools — mantido por compatibilidade. */
export function anthropicTools() {
  return mcpToolDefinitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}
