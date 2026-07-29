import { Suspense } from "react";
import SignInPage from "./SignInForm";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center text-sm opacity-80">
          Carregando…
        </main>
      }
    >
      <SignInPage />
    </Suspense>
  );
}
