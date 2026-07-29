export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg-elevated)] px-6 py-10">
      <p className="font-display text-xl text-[var(--fg)]">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-[var(--muted)]">{description}</p>
      ) : null}
    </div>
  );
}
