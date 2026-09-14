import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultAgendaWindow } from "../../src/lib/agenda-window";
import {
  generateScheduleSchema,
  MAX_SCHEDULE_HORIZON_DAYS,
  MAX_SCHEDULE_TOPICS,
} from "../../src/server/schemas";

describe("defaultAgendaWindow", () => {
  it("usa segunda-feira da semana atual até +365 dias", () => {
    // Quarta 2026-09-16 → semana começa 2026-09-14
    const { from, to } = defaultAgendaWindow(new Date("2026-09-16T15:00:00"));
    assert.equal(from, "2026-09-14");
    assert.equal(to, "2027-09-14");
  });
});

describe("generateScheduleSchema caps", () => {
  it("rejeita mais tópicos que o máximo", () => {
    const topics = Array.from(
      { length: MAX_SCHEDULE_TOPICS + 1 },
      (_, i) => `t${i}`,
    );
    const result = generateScheduleSchema.safeParse({
      title: "Cronograma",
      topics,
    });
    assert.equal(result.success, false);
  });

  it("rejeita targetDate além do horizonte", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const far = new Date(today);
    far.setDate(far.getDate() + MAX_SCHEDULE_HORIZON_DAYS + 1);
    const targetDate = far.toISOString().slice(0, 10);

    const result = generateScheduleSchema.safeParse({
      title: "Cronograma",
      topics: ["a"],
      targetDate,
    });
    assert.equal(result.success, false);
  });

  it("aceita carga no limite", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + MAX_SCHEDULE_HORIZON_DAYS);
    const targetDate = end.toISOString().slice(0, 10);
    const topics = Array.from({ length: MAX_SCHEDULE_TOPICS }, (_, i) => `t${i}`);

    const result = generateScheduleSchema.safeParse({
      title: "Cronograma",
      topics,
      targetDate,
    });
    assert.equal(result.success, true);
  });
});
