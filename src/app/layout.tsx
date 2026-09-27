import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Pídelo · Publica lo que necesitas, alguien lo resuelve", template: "%s · Pídelo" },
  description:
    "La plataforma de Ecuador donde publicas lo que necesitas y recibes ofertas de personas que pueden resolverlo en minutos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${jakarta.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-200 bg-white py-8 text-center text-sm text-zinc-500">
          Pídelo (nombre provisional) · Hecho en Ecuador 🇪🇨 · MVP: los pagos protegidos son simulados
        </footer>
      </body>
    </html>
  );
}
