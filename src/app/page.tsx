import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Marquee } from "@/components/ui/marquee";
import { createClient } from "@/lib/supabase/server";

const features = [
  {
    title: "Pastas & docs",
    body: "Organize matérias com árvore de pastas e editor BlockNote.",
    color: "bg-lavender",
  },
  {
    title: "Agenda",
    body: "Cronogramas gerados pelo agente até a data da prova.",
    color: "bg-mint",
  },
  {
    title: "Formulários FSRS",
    body: "Flashcards, quiz e perguntas abertas com revisão espaçada.",
    color: "bg-pink",
  },
  {
    title: "Agente MCP",
    body: "Uma instrução em português cria pasta → doc → agenda → form.",
    color: "bg-main",
  },
];

export default async function HomePage() {
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  } catch {
    signedIn = false;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Marquee
        items={[
          "IA Estudar",
          "Pastas",
          "Agenda",
          "FSRS",
          "Agente MCP",
          "Neobrutalism",
          "Estude sem fragmentar",
        ]}
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-base border-2 border-border bg-lavender font-heading shadow-shadow">
            IA
          </span>
          <p className="font-heading text-xl uppercase tracking-tight md:text-2xl">
            IA Estudar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="mint">Fase 1</Badge>
          <Button asChild variant="neutral" size="sm">
            <Link href={signedIn ? "/agente" : "/sign-in"}>
              {signedIn ? "App" : "Entrar"}
            </Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 pb-10 pt-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-base border-2 border-border bg-secondary-background p-8 shadow-shadow md:p-10">
          <Badge variant="lavender" className="mb-4">
            Plataforma de estudo pessoal
          </Badge>
          <h1 className="font-heading text-4xl uppercase leading-[0.95] md:text-6xl">
            Get started with creating study layouts today.
          </h1>
          <p className="mt-5 max-w-xl text-base font-base md:text-lg">
            Uma conversa. Pasta, documento, cronograma e prática — no mesmo
            lugar. Sem Notion + Anki + planner soltos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={signedIn ? "/agente" : "/sign-up"}>
                {signedIn ? "Abrir agente" : "Começar agora"}
              </Link>
            </Button>
            <Button asChild variant="neutral" size="lg">
              <Link href={signedIn ? "/pastas" : "/sign-in"}>Ver pastas</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Alert variant="blue">
            <AlertTitle>Feito com Tailwind</AlertTitle>
            <AlertDescription>
              Estrutura neobrutalism.dev + paleta pastel IA Estudar.
            </AlertDescription>
          </Alert>
          <Alert variant="pink">
            <AlertTitle>Alertas em rosa chiclete</AlertTitle>
            <AlertDescription>
              CTA em pêssego, fundo manteiga, secundário azul bebê.
            </AlertDescription>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Badge>Pêssego CTA</Badge>
            <Badge variant="lavender">Lavanda</Badge>
            <Badge variant="pink">Rosa</Badge>
            <Badge variant="mint">Menta</Badge>
            <Badge variant="blue">Azul</Badge>
          </div>
        </div>
      </section>

      <Marquee
        className="bg-mint"
        items={[
          "Pastas",
          "Documentos",
          "Cronogramas",
          "Flashcards",
          "Quiz",
          "Open form",
          "FSRS",
        ]}
      />

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h2 className="mb-6 font-heading text-3xl uppercase md:text-4xl">
          Fully customizable set of study tools.
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <Card key={f.title} className={`${f.color} shadow-shadow`}>
              <CardHeader>
                <CardTitle>{f.title}</CardTitle>
                <CardDescription className="text-foreground opacity-90">
                  {f.body}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <Card className="overflow-hidden bg-lavender">
          <div className="flex flex-col items-start gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div>
              <h2 className="font-heading text-3xl uppercase md:text-4xl">
                Start your study project today.
              </h2>
              <p className="mt-2 max-w-md text-sm md:text-base">
                Crie conta, peça pro agente montar a matéria e pratique no
                celular ou no desktop.
              </p>
            </div>
            <Button asChild size="lg" variant="neutral">
              <Link href={signedIn ? "/agente" : "/sign-up"}>
                {signedIn ? "Ir para o app" : "Criar conta"}
              </Link>
            </Button>
          </div>
        </Card>
      </section>

      <Marquee
        className="bg-pink"
        items={[
          "IA Estudar",
          "#FFF3B0",
          "#A8D8EA",
          "#FFD3B4",
          "#FFAAA7",
          "#C8B6E2",
          "#B5EAD7",
        ]}
      />
    </main>
  );
}
