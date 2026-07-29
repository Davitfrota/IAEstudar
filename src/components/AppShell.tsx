"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const links = [
  { href: "/pastas", label: "Pastas" },
  { href: "/agenda", label: "Agenda" },
  { href: "/formularios", label: "Formulários" },
  { href: "/agente", label: "Agente" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_88%,white)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-6 px-4 py-3">
          <Link
            href="/agente"
            className="font-display text-lg text-[var(--accent)]"
          >
            IA Estudar
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    active
                      ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                      : "text-[var(--muted)] hover:text-[var(--fg)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
