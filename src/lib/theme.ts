export const THEMES = ["neo", "clay", "glass", "material", "fluent"] as const;

export type ThemeId = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "ia-estudar-theme";

export const THEME_META: Record<
  ThemeId,
  { label: string; badgeClass: string }
> = {
  neo: {
    label: "Neo",
    badgeClass: "bg-baby-blue text-foreground",
  },
  clay: {
    label: "Clay",
    badgeClass: "bg-peach text-foreground",
  },
  glass: {
    label: "Glass",
    badgeClass: "bg-mint text-foreground",
  },
  material: {
    label: "Material",
    badgeClass: "bg-lavender text-foreground",
  },
  fluent: {
    label: "Fluent",
    badgeClass: "bg-butter text-foreground",
  },
};

export function isThemeId(value: unknown): value is ThemeId {
  return (
    value === "neo" ||
    value === "clay" ||
    value === "glass" ||
    value === "material" ||
    value === "fluent"
  );
}

export function nextTheme(current: ThemeId): ThemeId {
  const i = THEMES.indexOf(current);
  return THEMES[(i + 1) % THEMES.length]!;
}

export function applyThemeClass(theme: ThemeId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const id of THEMES) {
    root.classList.toggle(`theme-${id}`, id === theme);
  }
  root.dataset.theme = theme;
}
