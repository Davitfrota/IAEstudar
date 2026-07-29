"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Marquee } from "@/components/ui/marquee";
import { mapAuthError } from "@/lib/auth-errors";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await res.json()) as {
        error?: string;
        session?: boolean;
      };
      if (!res.ok) {
        setError(payload.error ?? "Falha no cadastro");
        return;
      }
      if (payload.session) {
        router.replace("/agente");
        router.refresh();
        return;
      }
      setInfo(
        "Conta criada, mas sem sessão: a confirmação de email está ativa. No Dashboard Supabase → Authentication → Providers → Email, desative “Confirm email” para desenvolvimento local.",
      );
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <Marquee
        className="bg-pink"
        items={["Criar conta", "IA Estudar", "Neo", "Começar"]}
      />
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md bg-lavender">
          <CardHeader>
            <CardTitle className="text-2xl">Criar conta</CardTitle>
            <CardDescription>
              Email + senha (mín. 6 caracteres).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error ? (
                <Alert variant="pink">
                  <AlertTitle>Erro</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {info ? (
                <Alert variant="mint">
                  <AlertTitle>Quase lá</AlertTitle>
                  <AlertDescription>{info}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Criando…" : "Criar conta"}
              </Button>
              <p className="text-center text-sm">
                Já tem conta?{" "}
                <Link href="/sign-in" className="font-heading underline">
                  Entrar
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
