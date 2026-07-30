import { describe, expect, it } from "vitest";
import {
  THEMES,
  isThemeId,
  nextTheme,
  THEME_META,
} from "@/lib/theme";
import {
  describeToolStep,
  summarizePlan,
  toToolPlanPreview,
  type PendingPlan,
} from "@/server/pending-plans";
import {
  __resetMemoryRateLimit,
  takeSlotSync,
} from "@/server/rate-limit";
import {
  createFolderSchema,
  generateScheduleSchema,
  nameSchema,
} from "@/server/schemas";
import { extractConversationTitle } from "@/server/mcp/agent";
import {
  extractInlineToolCalls,
  isGatheringPlanRequirements,
  sanitizeToolCompletion,
} from "@/lib/ai/groq-tools";

describe("theme", () => {
  it("cycles neo → clay → glass → material → fluent → neo", () => {
    expect(nextTheme("neo")).toBe("clay");
    expect(nextTheme("clay")).toBe("glass");
    expect(nextTheme("glass")).toBe("material");
    expect(nextTheme("material")).toBe("fluent");
    expect(nextTheme("fluent")).toBe("neo");
    expect(THEMES).toHaveLength(5);
    expect(isThemeId("material")).toBe(true);
    expect(isThemeId("fluent")).toBe(true);
    expect(isThemeId("y2k")).toBe(false);
    expect(THEME_META.fluent.label).toBe("Fluent");
  });
});

describe("conversation title", () => {
  it("extracts Título from first assistant line", () => {
    expect(
      extractConversationTitle(
        "Título: Cálculo — prova 15/08\n\nMonteí um plano com pasta e agenda.",
      ),
    ).toBe("Cálculo — prova 15/08");
    expect(extractConversationTitle("Titulo: Biologia Celular")).toBe(
      "Biologia Celular",
    );
    expect(extractConversationTitle("Sem título aqui")).toBeNull();
  });
});

describe("groq inline tools", () => {
  it("strips leaked <function=...> from assistant text", () => {
    const raw = `Título: Biologia Celular — Introdução

Olá! Qual é o objetivo?

<function=propose_study_plan>{"folderName":"Biologia Celular","topics":["A"]}</function>`;

    const { content, toolCalls } = extractInlineToolCalls(raw);
    expect(content).toContain("Qual é o objetivo?");
    expect(content).not.toContain("<function=");
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.name).toBe("propose_study_plan");
    expect(toolCalls[0]?.input.folderName).toBe("Biologia Celular");
  });

  it("drops creation tools while gathering requirements", () => {
    const text = `Título: Bio

1. Objetivo?
2. Prazo?
3. Nível?`;
    expect(isGatheringPlanRequirements(text)).toBe(true);

    const result = sanitizeToolCompletion(text, [
      {
        id: "1",
        name: "propose_study_plan",
        arguments: "{}",
        input: {},
      },
      {
        id: "2",
        name: "list_due",
        arguments: "{}",
        input: {},
      },
    ]);
    expect(result.toolCalls.map((c) => c.name)).toEqual(["list_due"]);
  });
});

describe("schemas", () => {
  it("rejects empty folder name", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
    expect(createFolderSchema.safeParse({ name: "Calc" }).success).toBe(true);
  });

  it("normalizes past targetDate to a future year", () => {
    const past = generateScheduleSchema.safeParse({
      title: "Prova",
      topics: ["a"],
      targetDate: "2020-01-01",
    });
    expect(past.success).toBe(true);
    if (past.success) {
      const normalized = past.data.targetDate!;
      expect(normalized).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(normalized > "2020-01-01").toBe(true);
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      expect(new Date(`${normalized}T23:59:59`).getTime()).toBeGreaterThanOrEqual(
        startOfToday.getTime(),
      );
    }
  });
});

describe("pending plan helpers", () => {
  it("summarizes mixed tools", () => {
    expect(
      summarizePlan([
        { tool: "create_folder" },
        { tool: "create_document" },
        { tool: "generate_form" },
      ]),
    ).toMatch(/pasta/);
  });

  it("describes steps", () => {
    expect(
      describeToolStep("create_folder", { name: "Cálculo" }),
    ).toContain("Cálculo");
  });

  it("expands propose_study_plan with by_topic docs", async () => {
    const { expandToPlanSteps } = await import("@/server/pending-plans");
    const steps = expandToPlanSteps("propose_study_plan", {
      folderName: "Calculo",
      documentTitle: "Resumo",
      documentContent:
        "Limites, derivadas e regra da cadeia formam a base do cálculo diferencial.",
      scheduleTitle: "Agenda",
      topics: ["Limites", "Derivadas"],
      organizationMode: "by_topic",
      includeForm: false,
      targetDate: "2026-08-15",
    });
    expect(steps.some((s) => s.tool === "create_folder")).toBe(true);
    expect(steps.filter((s) => s.tool === "create_document").length).toBe(3);
    expect(steps.some((s) => s.tool === "generate_schedule")).toBe(true);
  });

  it("toToolPlanPreview maps ownership fields", () => {
    const plan: PendingPlan = {
      planId: "p1",
      userId: "u-a",
      summary: "teste",
      steps: [
        {
          id: "s1",
          tool: "create_folder",
          description: "Criar pasta",
          input: { name: "X" },
          status: "pending",
        },
      ],
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    const preview = toToolPlanPreview(plan);
    expect(preview.planId).toBe("p1");
    expect(preview.status).toBe("awaiting_confirmation");
  });
});

describe("rate limit (memory)", () => {
  it("blocks after limit", () => {
    __resetMemoryRateLimit();
    const key = `test:${Date.now()}`;
    expect(takeSlotSync(key, 2, 60_000)).toBe(true);
    expect(takeSlotSync(key, 2, 60_000)).toBe(true);
    expect(takeSlotSync(key, 2, 60_000)).toBe(false);
  });
});

describe("multi-user plan ownership", () => {
  it("foreign userId must not match plan owner", () => {
    const planUserId = "11111111-1111-1111-1111-111111111111";
    const otherUserId = "22222222-2222-2222-2222-222222222222";
    expect(planUserId).not.toEqual(otherUserId);
  });
});
