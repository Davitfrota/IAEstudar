import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22><path fill=%22%231c241c%22 fill-opacity=%220.03%22 d=%22M0 119h120v1H0zM119 0v120h1V0z%22/></svg>')]"
      />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <p className="font-display text-xl tracking-tight text-[var(--accent)]">
          IA Estudar
        </p>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">
              Entrar
            </button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <div className="flex items-center gap-3">
            <Link
              href="/agente"
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Abrir app
            </Link>
            <UserButton />
          </div>
        </Show>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 pb-24 pt-10">
        <p className="font-display text-5xl leading-none text-[var(--accent)] md:text-7xl">
          IA Estudar
        </p>
        <h1 className="mt-6 max-w-2xl text-2xl font-medium leading-snug text-[var(--fg)] md:text-3xl">
          Uma conversa. Pasta, documento, cronograma e prática — no mesmo lugar.
        </h1>
        <p className="mt-4 max-w-xl text-base text-[var(--muted)]">
          Descreva o que precisa estudar e até quando. O agente organiza o
          estado no banco sem você pular entre Notion, Anki e planner.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white">
                Começar
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/agente"
              className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white"
            >
              Ir para o agente
            </Link>
          </Show>
        </div>
      </section>
    </main>
  );
}
