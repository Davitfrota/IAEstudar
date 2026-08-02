import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  className,
  action,
  href,
  actionLabel,
}: {
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
  href?: string;
  actionLabel?: string;
}) {
  const resolvedAction =
    action ??
    (href && actionLabel ? (
      <Link href={href}>
        <Button size="sm">{actionLabel}</Button>
      </Link>
    ) : null);

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
      {resolvedAction ? <div className="mt-2">{resolvedAction}</div> : null}
    </div>
  );
}
