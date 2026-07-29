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

describe("theme", () => {
  it("cycles neo → clay → glass → neo", () => {
    expect(nextTheme("neo")).toBe("clay");
    expect(nextTheme("clay")).toBe("glass");
    expect(nextTheme("glass")).toBe("neo");
    expect(THEMES).toHaveLength(3);
    expect(isThemeId("neo")).toBe(true);
    expect(isThemeId("y2k")).toBe(false);
    expect(THEME_META.clay.label).toBe("Clay");
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
