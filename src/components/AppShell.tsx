"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const links = [
  { href: "/pastas", label: "Pastas", tone: "bg-lavender" },
  { href: "/agenda", label: "Agenda", tone: "bg-mint" },
  { href: "/formularios", label: "Forms", tone: "bg-pink" },
  { href: "/agente", label: "Nara", tone: "bg-main" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  };

  const exportData = async () => {
    try {
      const res = await fetch("/api/export");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro ao exportar");
      const blob = new Blob([JSON.stringify(json.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ia-estudar-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Export baixado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no export");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b-2 border-border bg-secondary-background">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3 px-4 py-3">
          <Link
            href="/agente"
            className="flex items-center gap-2 font-heading text-lg uppercase"
          >
            <span className="flex size-9 items-center justify-center rounded-base border-2 border-border bg-lavender text-sm shadow-shadow">
              IA
            </span>
            <span className="hidden sm:inline">IA Estudar</span>
          </Link>
          <nav className="flex flex-1 gap-2 overflow-x-auto">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-base border-2 border-border px-3 py-1.5 text-sm font-heading uppercase transition-all",
                    active
                      ? `${link.tone} shadow-shadow`
                      : "bg-secondary-background hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-shadow",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <ThemeSwitcher />
          <Button variant="neutral" size="sm" onClick={() => void exportData()}>
            Export
          </Button>
          <Button variant="neutral" size="sm" onClick={() => void signOut()}>
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
