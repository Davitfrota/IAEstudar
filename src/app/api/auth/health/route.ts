import { NextResponse } from "next/server";

function isAuthorizedHealth(request: Request): boolean {
  const token = process.env.HEALTH_CHECK_TOKEN;
  if (!token) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${token}`;
}

/** Diagnóstico rápido: o servidor enxerga o Supabase? */
export async function GET(request: Request) {
  const isProd = process.env.NODE_ENV === "production";
  const healthToken = process.env.HEALTH_CHECK_TOKEN;

  if (isProd && healthToken && !isAuthorizedHealth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    const body = isProd && !healthToken ? { ok: false } : {
      ok: false,
      error: "Env NEXT_PUBLIC_SUPABASE_* ausente",
    };
    return NextResponse.json(body, { status: 500 });
  }

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    const body = await res.text();

    if (isProd && !healthToken) {
      return NextResponse.json({ ok: res.ok }, { status: res.ok ? 200 : 503 });
    }

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      project: url,
      health: body,
    });
  } catch (err) {
    if (isProd && !healthToken) {
      return NextResponse.json({ ok: false }, { status: 502 });
    }

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
