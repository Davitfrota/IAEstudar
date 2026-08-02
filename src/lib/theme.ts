export const THEMES = ["neo", "clay", "glass", "material", "fluent"] as const;

export type ThemeId = (typeof THEMES)[number];

export const THEME_STORAGE_KEY = "ia-estudar-theme";

export const THEME_META: Record<
  ThemeId,
  { label: string; badgeClass: string; mascot: string; mascotThinking: string }
> = {
  neo: {
    label: "Neo",
    badgeClass: "bg-baby-blue text-foreground",
    mascot: "/nara/head-neo.png",
    mascotThinking: "/nara/head-neo-thinking.png",
  },
  clay: {
    label: "Clay",
    badgeClass: "bg-peach text-foreground",
    mascot: "/nara/head-clay.png",
    mascotThinking: "/nara/head-clay-thinking.png",
  },
  glass: {
    label: "Glass",
    badgeClass: "bg-mint text-foreground",
    mascot: "/nara/head-glass.png",
    mascotThinking: "/nara/head-glass-thinking.png",
  },
  material: {
    label: "Material",
    badgeClass: "bg-lavender text-foreground",
    mascot: "/nara/head-material.png",
    mascotThinking: "/nara/head-material-thinking.png",
  },
  fluent: {
    label: "Fluent",
    badgeClass: "bg-butter text-foreground",
    mascot: "/nara/head-fluent.png",
    mascotThinking: "/nara/head-fluent-thinking.png",
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
