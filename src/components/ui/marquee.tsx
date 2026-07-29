import { cn } from "@/lib/utils";

export function Marquee({
  items,
  className,
}: {
  items: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex w-full overflow-x-hidden border-y-2 border-border bg-lavender text-foreground font-heading uppercase",
        className,
      )}
    >
      <div className="animate-marquee whitespace-nowrap py-3">
        {items.map((item) => (
          <span key={`a-${item}`} className="mx-4 text-xl md:text-2xl">
            {item}
          </span>
        ))}
      </div>
      <div className="absolute top-0 animate-marquee2 whitespace-nowrap py-3">
        {items.map((item) => (
          <span key={`b-${item}`} className="mx-4 text-xl md:text-2xl">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
