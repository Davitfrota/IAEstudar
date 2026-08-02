"use client";

import { useTheme } from "@/components/ThemeProvider";
import { THEME_META } from "@/lib/theme";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: number;
  /** idle = cabeça normal; thinking = cabeça pensando */
  pose?: "idle" | "thinking";
  alt?: string;
  /** círculo estilo avatar de chat */
  avatar?: boolean;
};

export function NaraMascot({
  className,
  size = 72,
  pose = "idle",
  alt = "Nara",
  avatar = false,
}: Props) {
  const { theme } = useTheme();
  const src =
    pose === "thinking"
      ? THEME_META[theme].mascotThinking
      : THEME_META[theme].mascot;

  const img = (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      className={cn(
        "bg-transparent object-contain",
        !avatar && "drop-shadow-[3px_3px_0_rgba(0,0,0,0.2)]",
        avatar && "h-[92%] w-[92%]",
        className,
      )}
      style={{ background: "transparent" }}
    />
  );

  if (!avatar) {
    return (
      <span
        className="inline-flex shrink-0"
        style={{ width: size, height: size }}
      >
        {img}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary-background shadow-shadow",
        className,
      )}
      style={{ width: size, height: size }}
      aria-label={alt}
    >
      {img}
    </span>
  );
}
