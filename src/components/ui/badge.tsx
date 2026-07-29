import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-base border-2 border-border px-2.5 py-0.5 text-xs font-heading uppercase w-fit whitespace-nowrap shrink-0",
  {
    variants: {
      variant: {
        default: "bg-main text-main-foreground",
        neutral: "bg-secondary-background text-foreground",
        lavender: "bg-lavender text-foreground",
        pink: "bg-pink text-foreground",
        mint: "bg-mint text-foreground",
        blue: "bg-baby-blue text-foreground",
        peach: "bg-peach text-foreground",
        chart1: "bg-chart-1 text-foreground",
        chart2: "bg-chart-2 text-foreground",
        chart3: "bg-chart-3 text-foreground",
        chart4: "bg-chart-4 text-foreground",
        chart5: "bg-chart-5 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
