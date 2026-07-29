import { z } from "zod";

export const nameSchema = z.string().trim().min(1).max(200);

export const createFolderSchema = z.object({
  name: nameSchema,
  parentFolderId: z.string().uuid().optional().nullable(),
});

export const createDocumentSchema = z.object({
  title: nameSchema,
  folderId: z.string().uuid().optional().nullable(),
  initialContent: z.string().optional(),
  content: z.unknown().optional(),
});

export const updateDocumentSchema = z.object({
  title: nameSchema.optional(),
  folderId: z.string().uuid().nullable().optional(),
  content: z.unknown().optional(),
  contentText: z.string().optional(),
});

/** Input do MCP update_document (texto plano + confirmação se sobrescrever). */
export const mcpUpdateDocumentSchema = z.object({
  documentId: z.string().uuid(),
  title: nameSchema.optional(),
  contentText: z.string().min(1).max(100_000).optional(),
  folderId: z.string().uuid().nullable().optional(),
  confirmed: z.boolean().optional().default(false),
});

export const updateFolderSchema = z.object({
  name: nameSchema.optional(),
  parentFolderId: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

export const generateScheduleSchema = z
  .object({
    title: nameSchema,
    topics: z.array(z.string().trim().min(1)).min(1),
    targetDate: z.string().date().optional(),
    dailyMinutes: z.number().int().min(15).max(480).optional().default(30),
  })
  .superRefine((data, ctx) => {
    if (data.targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(`${data.targetDate}T00:00:00`);
      if (target < today) {
        ctx.addIssue({
          code: "custom",
          path: ["targetDate"],
          message: "target_date não pode estar no passado",
        });
      }
    }
  });

export const generateScheduleApiSchema = generateScheduleSchema.and(
  z.object({ confirmed: z.boolean().optional().default(false) }),
);

export const formTypeSchema = z.enum(["flashcard_deck", "quiz", "open_form"]);

export const generatedQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  answer: z.string().trim().min(1).max(4000),
  choices: z.array(z.string().trim().min(1)).max(8).optional(),
});

export const generateFormSchema = z.object({
  sourceDocumentId: z.string().uuid(),
  type: formTypeSchema,
  instruction: z.string().trim().min(1).max(2000),
  questionCount: z.number().int().min(1).max(50).optional().default(10),
  confirmed: z.boolean().optional().default(false),
  /** Questões editadas no preview — se presentes no confirm, não regenera com IA. */
  questions: z.array(generatedQuestionSchema).min(1).max(50).optional(),
});

export const fsrsRatingSchema = z.enum(["again", "hard", "good", "easy"]);

export const recordReviewSchema = z.object({
  formQuestionId: z.string().uuid(),
  rating: fsrsRatingSchema,
});

export const listDueSchema = z.object({
  date: z.string().datetime().optional(),
  folderId: z.string().uuid().optional(),
});

export const agentChatSchema = z
  .object({
    message: z.string().trim().min(1).max(8000).optional(),
    conversationId: z.string().uuid().optional(),
    confirmTool: z
      .object({
        name: z.enum(["generate_schedule", "generate_form", "update_document"]),
        input: z.record(z.string(), z.unknown()),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.message && !data.confirmTool) {
      ctx.addIssue({
        code: "custom",
        message: "Informe message ou confirmTool",
      });
    }
  });

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type McpUpdateDocumentInput = z.infer<typeof mcpUpdateDocumentSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type GenerateScheduleInput = z.infer<typeof generateScheduleSchema>;
export type GenerateFormInput = z.infer<typeof generateFormSchema>;
export type RecordReviewInput = z.infer<typeof recordReviewSchema>;
export type ListDueInput = z.infer<typeof listDueSchema>;
export type AgentChatInput = z.infer<typeof agentChatSchema>;
export type FsrsRating = z.infer<typeof fsrsRatingSchema>;
export type FormType = z.infer<typeof formTypeSchema>;
