import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade,
} from "ts-fsrs";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
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
import { reviewResultFromExisting } from "@/server/services/review-idempotency";

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
  private repo = new FormRepository(createAdminClient());
  private documents = new DocumentRepository(createAdminClient());
  private scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

  list(userId: string) {
    return this.repo.list(userId);
  }

  async get(userId: string, formId: string) {
    const form = await this.repo.getOwned(userId, formId);
    if (!form) {
      throw new AppError("Formulário não encontrado", 404, "FORM_NOT_FOUND");
    }
    return form;
  }

  countDue(userId: string) {
    return this.repo.countDue(userId);
  }

  listDue(userId: string, input: { date?: string; folderId?: string } = {}) {
    return this.repo.listDue(userId, input);
  }

  async listPracticeQueue(userId: string, formId: string) {
    await this.get(userId, formId);
    return this.repo.listDueForForm(userId, formId);
  }

  async softDelete(userId: string, formId: string) {
    await this.get(userId, formId);
    await this.repo.softDelete(userId, formId);
  }

  async previewGenerate(userId: string, input: GenerateFormInput) {
    const doc = await this.documents.getOwned(userId, input.sourceDocumentId);
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

    return {
      status: "pending_confirmation" as const,
      preview: {
        sourceDocumentId: doc.id,
        sourceTitle: doc.title,
        type: input.type,
        instruction: input.instruction,
        questionCount: input.questionCount ?? 10,
        contentPreview: doc.content_text.slice(0, 280),
      },
    };
  }

  async generate(userId: string, input: GenerateFormInput) {
    assertGenerateRateLimit(userId, "generate_form");

    const doc = await this.documents.getOwned(userId, input.sourceDocumentId);
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

    const questions = await this.generateQuestionsWithAi({
      type: input.type,
      instruction: input.instruction,
      contentText: doc.content_text,
      questionCount: input.questionCount ?? 10,
    });

    const form = await this.repo.create(userId, {
      sourceDocumentId: doc.id,
      title: `${doc.title} — ${input.type}`,
      type: input.type,
      generationInstruction: input.instruction,
    });

    const qType = questionTypeForForm(input.type);
    const created = await this.repo.createQuestions(
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
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new AppError(
        "ANTHROPIC_API_KEY não configurada",
        500,
        "AI_NOT_CONFIGURED",
      );
    }

    const client = new Anthropic({ apiKey });
    const system = promptForType(input.type);

    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
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
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

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

  async recordReview(
    userId: string,
    formQuestionId: string,
    rating: FsrsRating,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await this.repo.findReviewByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (existing) {
        await this.repo.updateFsrsStateIfMatches(
          existing.form_question_id,
          existing.state_before,
          existing.state_after,
        );
        return reviewResultFromExisting(existing);
      }
    }

    const question = await this.repo.getQuestionOwned(userId, formQuestionId);
    if (!question) {
      throw new AppError("Questão não encontrada", 404, "QUESTION_NOT_FOUND");
    }

    const beforeCard = toFsrsCard(question);
    const stateBefore = fromFsrsCard(beforeCard);
    const now = new Date();
    const result = this.scheduler.next(beforeCard, now, ratingMap[rating]);
    const stateAfter = fromFsrsCard(result.card);

    const insertResult = await this.repo.insertReview({
      formQuestionId,
      userId,
      rating,
      stateBefore,
      stateAfter,
      idempotencyKey,
    });

    if (insertResult === "duplicate" && idempotencyKey) {
      const existing = await this.repo.findReviewByIdempotencyKey(
        userId,
        idempotencyKey,
      );
      if (existing) {
        await this.repo.updateFsrsStateIfMatches(
          existing.form_question_id,
          existing.state_before,
          existing.state_after,
        );
        return reviewResultFromExisting(existing);
      }
    }

    await this.repo.updateFsrsState(formQuestionId, stateAfter);

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
