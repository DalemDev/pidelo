import type { Metadata } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { LEGAL } from "@/server/config/legal";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Pídelo · Publica lo que necesitas, alguien lo resuelve", template: "%s · Pídelo" },
  description:
    "Publica lo que necesitas y recibe ofertas de personas que pueden resolverlo. Pago protegido hasta que confirmes el trabajo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${jakarta.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-200 bg-white py-8 text-sm text-zinc-500">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="font-semibold text-zinc-700">Pídelo</div>
              <div>
                {LEGAL.companyName} · RUC {LEGAL.ruc}
              </div>
              <div>{LEGAL.address}</div>
            </div>
            <nav aria-label="Información legal" className="flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/legal/terminos" className="hover:text-zinc-800">Términos</Link>
              <Link href="/legal/privacidad" className="hover:text-zinc-800">Privacidad</Link>
              <Link href="/legal/cookies" className="hover:text-zinc-800">Cookies</Link>
              <a href={`mailto:${LEGAL.supportEmail}`} className="hover:text-zinc-800">Soporte y reclamos</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
