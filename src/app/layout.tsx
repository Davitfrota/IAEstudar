import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const themeBootScript = `(function(){try{var k='ia-estudar-theme';var t=localStorage.getItem(k);if(t!=='neo'&&t!=='clay'&&t!=='glass')t='neo';var r=document.documentElement;r.classList.remove('theme-neo','theme-clay','theme-glass');r.classList.add('theme-'+t);r.dataset.theme=t;}catch(e){document.documentElement.classList.add('theme-neo');document.documentElement.dataset.theme='neo';}})();`;

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
      className={`${heading.variable} ${sans.variable} theme-neo h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className:
                "theme-toast !font-semibold",
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
