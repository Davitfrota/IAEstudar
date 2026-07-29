import { NextResponse } from "next/server";

/** Diagnóstico rápido: o servidor enxerga o Supabase? */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Env NEXT_PUBLIC_SUPABASE_* ausente" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    const body = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      project: url,
      health: body,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        project: url,
        error: err instanceof Error ? err.message : "fetch failed",
      },
      { status: 502 },
    );
  }
}
