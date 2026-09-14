import { AppError } from "@/server/http";

/** Alinhado ao max_rows do PostgREST/Supabase (supabase/config.toml). */
export const POSTGREST_MAX_ROWS = 1000;

export type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Busca todas as linhas via range paginado.
 * Evita truncamento silencioso quando a tabela passa do max_rows do PostgREST.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize: number = POSTGREST_MAX_ROWS,
): Promise<T[]> {
  if (pageSize < 1) {
    throw new AppError("pageSize inválido", 500, "FETCH_FAILED");
  }

  const all: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new AppError(
        `Falha ao listar dados: ${error.message}`,
        500,
        "FETCH_FAILED",
      );
    }

    const rows = data ?? [];
    all.push(...rows);

    if (rows.length < pageSize) {
      break;
    }
  }

  return all;
}
