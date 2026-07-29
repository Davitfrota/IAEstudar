import { NextResponse } from "next/server";
import { checkReadiness } from "@/server/readiness";

/** Diagnóstico de env + backends (Supabase, Groq, planos, Redis, Realtime). */
export async function GET() {
  const report = await checkReadiness();
  return NextResponse.json(report, {
    status: report.readyFor.smoke ? 200 : 503,
  });
}
