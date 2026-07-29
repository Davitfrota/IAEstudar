import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import { createGroqClient, groqModel } from "@/lib/ai/groq";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { assertGenerateRateLimit } from "@/server/rate-limit";
import { DocumentRepository } from "@/server/repositories/document-repository";
import { FormRepository } from "@/server/repositories/form-repository";
import type {
  FormType,
  GenerateFormInput,
  FsrsRating,
} from "@/server/schemas";
import type { FormQuestion, FsrsCardState } from "@/server/types";
import {
  PROMPT_FLASHCARD_DECK,
  PROMPT_OPEN_FORM,
  PROMPT_QUIZ,
} from "@/server/prompts/forms";

const MIN_CONTENT_LENGTH = 50;

const ratingMap: Record<FsrsRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const stateToDb: Record<State, FormQuestion["fsrs_state"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const dbToState: Record<FormQuestion["fsrs_state"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

function promptForType(type: FormType) {
  switch (type) {
    case "flashcard_deck":
      return PROMPT_FLASHCARD_DECK;
    case "quiz":
      return PROMPT_QUIZ;
    case "open_form":
      return PROMPT_OPEN_FORM;
  }
}

function questionTypeForForm(type: FormType): FormQuestion["type"] {
  switch (type) {
    case "flashcard_deck":
      return "qa";
    case "quiz":
      return "multiple_choice";
    case "open_form":
      return "open";
  }
}

function toFsrsCard(q: FormQuestion): Card {
  const empty = createEmptyCard(new Date(q.created_at));
  return {
    ...empty,
    due: new Date(q.fsrs_due),
    stability: q.fsrs_stability ?? empty.stability,
    difficulty: q.fsrs_difficulty ?? empty.difficulty,
    elapsed_days: q.fsrs_elapsed_days,
    scheduled_days: q.fsrs_scheduled_days,
    reps: q.fsrs_reps,
    lapses: q.fsrs_lapses,
    state: dbToState[q.fsrs_state],
    last_review: q.fsrs_last_review
      ? new Date(q.fsrs_last_review)
      : undefined,
  };
}

function fromFsrsCard(card: Card): FsrsCardState {
  return {
    state: stateToDb[card.state],
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    last_review: card.last_review?.toISOString() ?? null,
  };
}

type GeneratedQuestion = {
  prompt: string;
  answer: string;
  choices?: string[];
};

export class FormService {
  private scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

  private async forms() {
    return new FormRepository(await createDbClient());
  }

  private async documents() {
    return new DocumentRepository(await createDbClient());
  }

  async list(userId: string) {
    return (await this.forms()).list(userId);
  }

  async get(userId: string, formId: string) {
    const form = await (await this.forms()).getOwned(userId, formId);
    if (!form) {
      throw new AppError("Formulário não encontrado", 404, "FORM_NOT_FOUND");
    }
    return form;
  }

  async countDue(userId: string) {
    return (await this.forms()).countDue(userId);
  }

  async listDue(userId: string, input: { date?: string; folderId?: string } = {}) {
    return (await this.forms()).listDue(userId, input);
  }

  async listPracticeQueue(userId: string, formId: string) {
    await this.get(userId, formId);
    return (await this.forms()).listDueForForm(userId, formId);
  }

  async softDelete(userId: string, formId: string) {
    await this.get(userId, formId);
    await (await this.forms()).softDelete(userId, formId);
  }

  async previewGenerate(userId: string, input: GenerateFormInput) {
    assertGenerateRateLimit(userId, "generate_form");

    const doc = await (await this.documents()).getOwned(
      userId,
      input.sourceDocumentId,
    );
    if (!doc) {
      throw new AppError("Documento não encontrado", 404, "DOCUMENT_NOT_FOUND");
    }
    if (doc.content_text.trim().length < MIN_CONTENT_LENGTH) {
      throw new AppError(
        `Documento precisa ter pelo menos ${MIN_CONTENT_LENGTH} caracteres em content_text`,
        400,
        "DOCUMENT_TOO_SHORT",
      );
    }

    const questionCount = input.questionCount ?? 10;
    const questions = await this.generateQuestionsWithAi({
      type: input.type,
      instruction: input.instruction,
      contentText: doc.content_text,
      questionCount,
    });

    const estimate = estimateGenerationCost({
      contentChars: doc.content_text.length,
      questionCount: questions.length,
      model: groqModel(),
    });

    return {
      status: "pending_confirmation" as const,
      preview: {
        sourceDocumentId: doc.id,
        sourceTitle: doc.title,
        type: input.type,
        instruction: input.instruction,
        questionCount: questions.length,
        contentPreview: doc.content_text.slice(0, 280),
        questions,
        estimate,
      },
    };
  }

  async generate(userId: string, input: GenerateFormInput) {
    // Se já veio do preview editado, não cobra rate limit de novo nem regenera.
    if (!input.questions?.length) {
      assertGenerateRateLimit(userId, "generate_form");
    }

    const doc = await (await this.documents()).getOwned(
      userId,
      input.sourceDocumentId,
    );
    if (!doc) {
      throw new AppError("Documento não encontrado", 404, "DOCUMENT_NOT_FOUND");
    }
    if (doc.content_text.trim().length < MIN_CONTENT_LENGTH) {
      throw new AppError(
        `Documento precisa ter pelo menos ${MIN_CONTENT_LENGTH} caracteres em content_text`,
        400,
        "DOCUMENT_TOO_SHORT",
      );
    }

    const questions =
      input.questions?.length ?
        input.questions
      : await this.generateQuestionsWithAi({
          type: input.type,
          instruction: input.instruction,
          contentText: doc.content_text,
          questionCount: input.questionCount ?? 10,
        });

    const forms = await this.forms();
    const form = await forms.create(userId, {
      sourceDocumentId: doc.id,
      title: `${doc.title} — ${input.type}`,
      type: input.type,
      generationInstruction: input.instruction,
    });

    const qType = questionTypeForForm(input.type);
    const created = await forms.createQuestions(
      questions.map((q, index) => ({
        form_id: form.id,
        type: qType,
        prompt: q.prompt,
        answer: q.answer,
        choices: q.choices ?? null,
        position: index,
      })),
    );

    return {
      formId: form.id,
      questionsCreated: created.length,
    };
  }

  private async generateQuestionsWithAi(input: {
    type: FormType;
    instruction: string;
    contentText: string;
    questionCount: number;
  }): Promise<GeneratedQuestion[]> {
    if (!process.env.GROQ_API_KEY) {
      throw new AppError(
        "GROQ_API_KEY não configurada",
        500,
        "AI_NOT_CONFIGURED",
      );
    }

    const client = createGroqClient();
    const system = promptForType(input.type);

    const response = await client.chat.completions.create({
      model: groqModel(),
      max_tokens: 4096,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            `Instrução do usuário: ${input.instruction}`,
            `Quantidade de questões: ${input.questionCount}`,
            "Conteúdo do documento:",
            input.contentText.slice(0, 12000),
            "",
            'Responda APENAS com JSON: {"questions":[{"prompt":"...","answer":"...","choices":["..."]}]}',
            "choices só para quiz (múltipla escolha).",
          ].join("\n"),
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";

    const parsed = JSON.parse(extractJson(text)) as {
      questions?: GeneratedQuestion[];
    };

    if (!parsed.questions?.length) {
      throw new AppError(
        "IA não retornou questões válidas",
        502,
        "AI_EMPTY_RESULT",
      );
    }

    return parsed.questions.slice(0, input.questionCount);
  }

  async recordReview(userId: string, formQuestionId: string, rating: FsrsRating) {
    const repo = await this.forms();
    const question = await repo.getQuestionOwned(userId, formQuestionId);
    if (!question) {
      throw new AppError("Questão não encontrada", 404, "QUESTION_NOT_FOUND");
    }

    const beforeCard = toFsrsCard(question);
    const stateBefore = fromFsrsCard(beforeCard);
    const now = new Date();
    const result = this.scheduler.next(beforeCard, now, ratingMap[rating]);
    const stateAfter = fromFsrsCard(result.card);

    await repo.insertReview({
      formQuestionId,
      userId,
      rating,
      stateBefore,
      stateAfter,
    });

    await repo.updateFsrsState(formQuestionId, stateAfter);

    return {
      nextDue: stateAfter.due,
      newState: stateAfter,
    };
  }
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

/** Estimativa transparente estilo RemNote (antes de persistir). */
function estimateGenerationCost(input: {
  contentChars: number;
  questionCount: number;
  model: string;
}) {
  const inputTokens = Math.ceil(input.contentChars / 4) + 400;
  const outputTokens = input.questionCount * 120;
  // Groq llama-3.3-70b ~$0.59 / $0.79 per 1M tokens (ordem de grandeza)
  const costUsd =
    (inputTokens / 1_000_000) * 0.59 + (outputTokens / 1_000_000) * 0.79;
  const credits = Math.max(1, Math.ceil(input.questionCount * 0.8));

  return {
    estimatedCards: input.questionCount,
    estimatedCredits: credits,
    estimatedCostUsd: Number(costUsd.toFixed(4)),
    model: input.model,
    note: "Estimativa aproximada antes de confirmar. Edite as perguntas abaixo e confirme só o que quiser manter.",
  };
}
