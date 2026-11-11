import Link from "next/link";
import { db } from "@/server/db/client";
import { CATEGORIES } from "@/domain/catalog";
import { RequestCard } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/session";
import { earlyAccessFilter, sortFeed } from "@/server/queries/feed";

const EXAMPLES = [
  "Necesito alguien que me explique cálculo integral antes del examen del viernes, en Quito o por Zoom",
  "Busco quien me venda un repuesto para lavadora LG en Guayaquil, lo necesito urgente",
  "Necesito una auditoría rápida de mis declaraciones del SRI de este año",
];

export default async function Home() {
  const user = await getCurrentUser();
  const [candidates, openCount, providerCount] = await Promise.all([
    db.request.findMany({
      where: { status: "OPEN", ...earlyAccessFilter(user) },
      orderBy: { bumpedAt: "desc" },
      take: 30,
      include: { author: { select: { name: true } }, _count: { select: { offers: true } } },
    }),
    db.request.count({ where: { status: "OPEN" } }),
    db.user.count({ where: { skills: { not: "" } } }),
  ]);
  const latest = sortFeed(candidates).slice(0, 6);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-200 bg-white">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-100 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-sun-100 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
          <div>
            <span className="chip bg-brand-50 text-brand-700">🇪🇨 Hecho para Ecuador</span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Publica lo que necesitas.
              <br />
              <span className="text-brand-600">Alguien lo resuelve.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-600">
              Tutorías, trámites, auditorías, reparaciones o conseguir ese producto que no encuentras. Cuéntalo como
              quieras: nuestra IA lo ordena y avisa <b>al instante</b> a las personas que saben resolverlo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/publicar" className="btn-primary px-6 py-3 text-base">
                Publicar mi necesidad
              </Link>
              <Link href="/solicitudes" className="btn-secondary px-6 py-3 text-base">
                Quiero ganar dinero ayudando
              </Link>
            </div>
            <div className="mt-8 flex gap-8 text-sm text-zinc-600">
              <div>
                <div className="font-display text-2xl font-bold text-zinc-900">{openCount}</div>
                solicitudes abiertas
              </div>
              <div>
                <div className="font-display text-2xl font-bold text-zinc-900">{providerCount}</div>
                personas listas para ayudar
              </div>
            </div>
          </div>

          <div className="card relative self-center p-5 shadow-xl shadow-brand-900/5">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Así de fácil</div>
            <div className="mt-3 rounded-xl bg-zinc-50 p-4 text-[15px] text-zinc-700">&ldquo;{EXAMPLES[0]}&rdquo;</div>
            <div className="my-3 flex items-center gap-2 text-xs font-semibold text-brand-600">
              <span className="h-px flex-1 bg-brand-100" />✨ La IA lo convierte en<span className="h-px flex-1 bg-brand-100" />
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
              <div className="flex flex-wrap gap-1.5">
                <span className="chip bg-white text-zinc-700">🎓 Tutoría académica</span>
                <span className="chip bg-white text-zinc-700">Acompañamiento</span>
                <span className="chip bg-white text-zinc-700">Quito · Remoto o presencial</span>
              </div>
              <div className="mt-2 font-display font-semibold">Tutoría de cálculo integral antes del viernes</div>
              <div className="mt-1 text-sm text-zinc-600">Presupuesto sugerido: $15 – $30</div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              🔔 Avisamos a 12 tutores de matemáticas · primera oferta en ~4 min
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl font-bold tracking-tight">Por qué es mejor que publicar en un grupo</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            ["✍️", "Escríbelo como te salga", "La IA arma una solicitud clara, sugiere presupuesto y te pregunta lo que falta."],
            ["🎯", "Match instantáneo", "Avisamos solo a quienes saben de ese tema y están en tu ciudad. Nada de esperar días."],
            ["🛡️", "Pago protegido", "Tu dinero queda retenido y solo se libera cuando confirmas que recibiste el trabajo."],
            ["⭐", "Reputación real", "Calificaciones y trabajos completados verificados. Sabes con quién tratas."],
          ].map(([icon, title, text]) => (
            <div key={title} className="card p-5">
              <div className="text-2xl">{icon}</div>
              <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-zinc-600">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categorías */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="font-display text-2xl font-bold tracking-tight">¿Qué necesitas hoy?</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/solicitudes?categoria=${c.slug}`}
              className="card flex flex-col items-start gap-2 p-4 text-sm font-semibold transition hover:border-brand-200 hover:shadow-md"
            >
              <span className="text-2xl">{c.icon}</span>
              {c.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Últimas solicitudes */}
      {latest.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl font-bold tracking-tight">Personas que necesitan ayuda ahora</h2>
            <Link href="/solicitudes" className="text-sm font-semibold text-brand-600 hover:underline">
              Ver todas →
            </Link>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {latest.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
