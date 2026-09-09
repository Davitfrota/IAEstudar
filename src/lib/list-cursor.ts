import { AppError } from "@/server/http";

/** Cursor opaco para keyset em (created_at, id). */
export type ListCursor = {
  created_at: string;
  id: string;
};

export function encodeListCursor(row: ListCursor): string {
  return Buffer.from(
    JSON.stringify({ created_at: row.created_at, id: row.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeListCursor(raw: string): ListCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<ListCursor>;
    if (
      typeof parsed.created_at !== "string" ||
      typeof parsed.id !== "string" ||
      !parsed.created_at ||
      !parsed.id
    ) {
      throw new Error("shape");
    }
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    throw new AppError("Cursor de paginação inválido", 400, "INVALID_CURSOR");
  }
}

/**
 * Filtro PostgREST para (created_at, id) > cursor, combinado com
 * ORDER BY created_at ASC, id ASC.
 */
export function listCursorOrFilter(cursor: ListCursor): string {
  const ts = cursor.created_at.replace(/"/g, "");
  return `created_at.gt."${ts}",and(created_at.eq."${ts}",id.gt.${cursor.id})`;
}

export function nextListCursor<T extends ListCursor>(
  rows: T[],
  limit: number,
): string | null {
  if (rows.length < limit || rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return encodeListCursor(last);
}
