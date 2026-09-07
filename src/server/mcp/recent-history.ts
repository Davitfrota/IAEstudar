/**
 * Converte uma janela de histórico já limitada (mais recentes primeiro)
 * para a ordem cronológica que o modelo espera (mais antigas → mais novas).
 *
 * PostgREST `ORDER BY created_at ASC LIMIT N` devolve as N *mais antigas*,
 * descartando o turno atual depois que a conversa passa de N linhas.
 * Por isso a query deve usar `ORDER BY created_at DESC LIMIT N` e depois
 * esta função.
 */
export function toChronologicalHistoryWindow<T>(newestFirst: T[]): T[] {
  return newestFirst.slice().reverse();
}
