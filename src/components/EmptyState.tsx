import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-base border-2 border-border bg-mint px-6 py-10 shadow-shadow",
        className,
      )}
    >
      <p className="font-heading text-xl uppercase">{title}</p>
      {description ? (
        <p className="max-w-md text-sm opacity-80">{description}</p>
      ) : null}
    </div>
  );
}
