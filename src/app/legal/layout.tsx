import Link from "next/link";
import { LEGAL } from "@/server/config/legal";

const PAGES = [
  { href: "/legal/terminos", label: "Términos y condiciones" },
  { href: "/legal/privacidad", label: "Política de privacidad" },
  { href: "/legal/cookies", label: "Política de cookies" },
];

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-[200px_1fr]">
      <nav aria-label="Documentos legales" className="space-y-1 text-sm">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="block rounded-lg px-3 py-2 font-semibold text-zinc-700 hover:bg-zinc-100">
            {p.label}
          </Link>
        ))}
      </nav>
      <article className="legal-doc min-w-0 space-y-4 text-[15px] leading-relaxed text-zinc-700">
        {children}
        <p className="border-t border-zinc-200 pt-4 text-xs text-zinc-500">Última actualización: {LEGAL.updatedAt}.</p>
      </article>
    </div>
  );
}
