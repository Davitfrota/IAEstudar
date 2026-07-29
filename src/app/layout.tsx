import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const heading = Archivo_Black({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: "400",
});

const sans = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
    <html
      lang="pt-BR"
      className={`${heading.variable} ${sans.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            className:
              "!border-2 !border-black !shadow-[4px_4px_0_#000] !rounded-[5px] !font-semibold",
          }}
        />
      </body>
    </html>
  );
}
