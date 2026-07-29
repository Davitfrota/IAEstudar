"use client";

import { useTheme } from "@/components/ThemeProvider";
import { THEME_META } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, cycleTheme } = useTheme();
  const meta = THEME_META[theme];

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={`Tema: ${meta.label} — clique para trocar`}
      aria-label={`Tema atual ${meta.label}. Clique para o próximo design system.`}
      className={cn(
        "inline-flex items-center justify-center rounded-base border-2 border-border px-2.5 py-0.5 text-xs font-heading uppercase shadow-shadow transition-all",
        "hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black",
        meta.badgeClass,
        className,
      )}
    >
      {meta.label}
    </button>
  );
}
