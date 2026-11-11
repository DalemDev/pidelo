import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db/client";
import { requireMember } from "@/server/auth/session";
import { budgetLabel, money, timeAgo } from "@/domain/format";
import { STRIKES_LOSE_PRIORITY, STRIKES_SUSPEND } from "@/domain/policies";
import { categoryOf } from "@/domain/catalog";
import { EmptyState, PlanBadge, StatusBadge } from "@/components/ui";

export const metadata: Metadata = { title: "Mi actividad" };

const OFFER_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "Esperando respuesta", tone: "bg-amber-100 text-amber-800" },
  ACCEPTED: { label: "Aceptada", tone: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "No seleccionada", tone: "bg-zinc-100 text-zinc-600" },
  WITHDRAWN: { label: "Retirada", tone: "bg-zinc-100 text-zinc-600" },
};

export default async function ActivityPage() {
  const user = await requireMember("/actividad");
  const [requests, offers] = await Promise.all([
    db.request.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { offers: { where: { status: { not: "WITHDRAWN" } } } } } },
    }),
    db.offer.findMany({
      where: { providerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { request: { select: { id: true, title: true, status: true, category: true, createdAt: true } } },
    }),
  ]);

  const completed = offers.filter((o) => o.status === "ACCEPTED" && o.request.status === "COMPLETED");
  const earned = completed.reduce((sum, o) => sum + o.price * (1 - o.feeRate), 0);

  // Estadísticas (beneficio Élite)
  const decided = offers.filter((o) => o.status === "ACCEPTED" || o.status === "REJECTED");
  const acceptance = decided.length ? offers.filter((o) => o.status === "ACCEPTED").length / decided.length : null;
  const responseMins = offers.map((o) => (o.createdAt.getTime() - o.request.createdAt.getTime()) / 60_000);
  const avgResponse = responseMins.length ? responseMins.reduce((a, b) => a + b, 0) / responseMins.length : null;
  const avgTicket = completed.length ? completed.reduce((a, o) => a + o.price, 0) / completed.length : null;
  const fmtMins = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} días`);
  const isElite = user.plan === "ELITE";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Mi actividad</h1>

      {user.strikes > 0 && (
        <div
          className={`mt-4 rounded-2xl border p-4 text-sm ${
            user.strikes >= STRIKES_LOSE_PRIORITY ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <b>
            Tienes {user.strikes} de {STRIKES_SUSPEND} advertencias
          </b>{" "}
          por intentar compartir contactos o acordar pagos fuera de Pídelo.{" "}
          {user.suspendedUntil && user.suspendedUntil > new Date()
            ? `Tu cuenta está suspendida hasta el ${user.suspendedUntil.toLocaleDateString("es-EC", { day: "numeric", month: "long" })}.`
            : user.strikes >= STRIKES_LOSE_PRIORITY
              ? "Perdiste la prioridad: ya no recibes avisos instantáneos y tus ofertas aparecen al final."
              : `Con ${STRIKES_LOSE_PRIORITY} pierdes la prioridad en avisos; con ${STRIKES_SUSPEND}, tu cuenta se suspende.`}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Solicitudes publicadas" value={String(requests.length)} />
        <Stat label="Ofertas enviadas" value={String(offers.length)} />
        <Stat label="Ganado en Pídelo" value={money(earned)} />
      </div>

      <section className="relative mt-6">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-display text-lg font-bold">Estadísticas de proveedor</h2>
          <PlanBadge plan="ELITE" />
        </div>
        <div className={`grid gap-4 sm:grid-cols-3 ${isElite ? "" : "pointer-events-none select-none blur-sm"}`} aria-hidden={!isElite}>
          <Stat label="Tasa de aceptación" value={acceptance != null ? `${Math.round(acceptance * 100)} %` : "—"} />
          <Stat label="Tiempo promedio en ofertar" value={avgResponse != null ? fmtMins(avgResponse) : "—"} />
          <Stat label="Ticket promedio" value={avgTicket != null ? money(avgTicket) : "—"} />
        </div>
        {!isElite && (
          <div className="absolute inset-0 top-8 grid place-items-center">
            <Link href="/planes" className="btn-primary shadow-lg">★ Desbloquea tus estadísticas con Élite</Link>
          </div>
        )}
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Lo que pedí</h2>
            <Link href="/publicar" className="text-sm font-semibold text-brand-600">+ Nueva</Link>
          </div>
          <div className="mt-3 space-y-2">
            {requests.length === 0 ? (
              <EmptyState title="Aún no publicas nada">
                <Link href="/publicar" className="font-semibold text-brand-600">Publica tu primera necesidad</Link>
              </EmptyState>
            ) : (
              requests.map((r) => (
                <Link key={r.id} href={`/solicitudes/${r.id}`} className="card flex items-center gap-3 p-4 hover:border-brand-200">
                  <span className="text-2xl">{categoryOf(r.category).icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.title}</div>
                    <div className="text-xs text-zinc-500">
                      {budgetLabel(r.budgetMin, r.budgetMax)} · {timeAgo(r.createdAt)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={r.status} />
                    {r.status === "OPEN" && <span className="text-xs font-semibold text-brand-600">{r._count.offers} ofertas</span>}
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Donde ofrecí ayuda</h2>
            <Link href="/solicitudes?vista=parati" className="text-sm font-semibold text-brand-600">Buscar más</Link>
          </div>
          <div className="mt-3 space-y-2">
            {offers.length === 0 ? (
              <EmptyState title="Aún no envías ofertas">
                <Link href="/solicitudes" className="font-semibold text-brand-600">Explora solicitudes</Link> y empieza a ganar.
              </EmptyState>
            ) : (
              offers.map((o) => {
                const s = OFFER_STATUS[o.status]!;
                return (
                  <Link key={o.id} href={`/solicitudes/${o.request.id}`} className="card flex items-center gap-3 p-4 hover:border-brand-200">
                    <span className="text-2xl">{categoryOf(o.request.category).icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{o.request.title}</div>
                      <div className="text-xs text-zinc-500">
                        Tu oferta: {money(o.price)} · {timeAgo(o.createdAt)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`chip ${s.tone}`}>{s.label}</span>
                      {o.status === "ACCEPTED" && <StatusBadge status={o.request.status} />}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value}</div>
    </div>
  );
}
