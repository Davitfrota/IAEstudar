import { afterAll, describe, expect, it } from "vitest";
import {
  createPendingPlan,
  deletePendingPlan,
  getPendingPlan,
} from "@/server/pending-plans";

describe("pending plans store (integration)", () => {
  const created: string[] = [];

  afterAll(async () => {
    await Promise.all(created.map((id) => deletePendingPlan(id)));
  });

  it("persists and isolates by userId", async () => {
    const userA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const userB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    const plan = await createPendingPlan({
      userId: userA,
      summary: "integration test",
      steps: [
        {
          tool: "create_folder",
          description: "Criar pasta Teste",
          input: { name: "Teste" },
        },
      ],
    });
    created.push(plan.planId);

    const loaded = await getPendingPlan(plan.planId);
    expect(loaded?.userId).toBe(userA);
    expect(loaded?.userId).not.toBe(userB);
  });
});
