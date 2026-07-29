import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IA Estudar",
  description: "Estudo pessoal com agente — pastas, agenda e prática FSRS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="pt-BR"
        className={`${display.variable} ${sans.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--fg)]">
          {children}
          <Toaster richColors position="top-right" />
        </body>
      </html>
    </ClerkProvider>
  );
}
