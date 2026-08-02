import { NextResponse } from "next/server";
import { checkReadiness } from "@/server/readiness";

function isAuthorizedHealth(request: Request): boolean {
  const token = process.env.HEALTH_CHECK_TOKEN;
  if (!token) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${token}`;
}

/** Diagnóstico de env + backends (Supabase, Groq, planos, Redis, Realtime). */
export async function GET(request: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const healthToken = process.env.HEALTH_CHECK_TOKEN;

  if (isProd && healthToken && !isAuthorizedHealth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await checkReadiness();

  if (isProd && !healthToken) {
    return NextResponse.json(
      { ok: report.ok, ready: report.readyFor.smoke },
      { status: report.readyFor.smoke ? 200 : 503 },
    );
  }

  return NextResponse.json(report, {
    status: report.readyFor.smoke ? 200 : 503,
  });
}
