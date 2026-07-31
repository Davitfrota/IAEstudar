/**
 * Serializa saves assíncronos: se um save chega enquanto outro está em voo,
 * guarda só o draft mais recente e envia após o atual terminar.
 * Evita que um PATCH mais antigo sobrescreva conteúdo mais novo no servidor.
 */
export function createSerialSaver<T>(
  save: (draft: T) => Promise<void>,
): (draft: T) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  let latest: T | null = null;
  let scheduled = false;

  return (draft: T) => {
    latest = draft;
    if (scheduled) {
      return chain;
    }

    scheduled = true;
    chain = chain
      .catch(() => undefined)
      .then(async () => {
        scheduled = false;
        while (latest !== null) {
          const next = latest;
          latest = null;
          await save(next);
        }
      });

    return chain;
  };
}
