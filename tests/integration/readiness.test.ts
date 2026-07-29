import { describe, expect, it } from "vitest";
import { checkReadiness } from "@/server/readiness";

const hasSupabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasSupabase)("readiness (integration)", () => {
  it("reports smoke checks", async () => {
    const report = await checkReadiness();
    expect(report.checks.supabase).toBeDefined();
    expect(report.readyFor).toMatchObject({
      smoke: expect.any(Boolean),
      agent: expect.any(Boolean),
      durablePlans: expect.any(Boolean),
      realtimeProgress: expect.any(Boolean),
    });
  });
});
