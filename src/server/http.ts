import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { message: error.message, code: error.code } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Validação falhou",
          code: "VALIDATION_ERROR",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error("[api]", error instanceof Error ? error.message : "unknown");
  return NextResponse.json(
    { error: { message: "Erro interno", code: "INTERNAL" } },
    { status: 500 },
  );
}

export async function parseJson<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}
