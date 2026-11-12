import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db/client";
import { requireMember } from "@/server/auth/session";
import { BOOST_COSTS, FEATURE_DAYS } from "@/domain/policies";
import { CREDIT_PACKS, planOf } from "@/domain/plans";
import { timeAgo } from "@/domain/format";
import { BuyPackButton } from "./buy-button";
import { balance } from "@/server/services/ledger";
import { ACCOUNTS } from "@/domain/money";
import { simulatedPaymentsEnabled } from "@/server/config/env";

export const metadata: Metadata = { title: "Mis créditos" };

// Etiqueta corta del tipo de movimiento.
const REASON_LABEL: Record<string, string> = {
  PURCHASE: "Compra",
  MONTHLY: "Mensual",
  PLAN: "Plan",
  OFFER: "Oferta",
  FEATURE: "Destacar",
  URGENT: "Urgente",
  BUMP: "Subir",
  REFUND: "Devolución",
};

export default async function CreditsPage() {
  const session = await requireMember("/creditos");
  const [user, history, walletCents] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: session.id }, select: { credits: true, plan: true, creditsGrantedAt: true, planRenewsAt: true } }),
    db.creditTransaction.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    balance(ACCOUNTS.available(session.id)),
  ]);
  const plan = planOf(user.plan);
  const cardEnabled = simulatedPaymentsEnabled();
  const nextGrant =
    user.plan === "FREE"
      ? user.creditsGrantedAt && new Date(user.creditsGrantedAt.getTime() + 30 * 86400_000)
      : user.planRenewsAt;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Mis créditos</h1>
      <p className="mt-1 text-zinc-600">Publicar siempre es gratis. Los créditos sirven para ofertar y para dar visibilidad a tus solicitudes.</p>

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="card flex flex-col justify-between bg-gradient-to-br from-sun-100 to-white p-6">
          <div>
            <div className="text-sm font-semibold text-amber-900">Saldo disponible</div>
            <div className="mt-1 font-display text-5xl font-bold">{user.credits} <span className="text-2xl font-semibold text-zinc-500">créditos</span></div>
          </div>
          <div className="mt-4 text-sm text-zinc-600">
            Plan <b>{plan.label}</b>: {plan.monthlyCredits} créditos cada mes
            {nextGrant && <> · próximos el {nextGrant.toLocaleDateString("es-EC", { day: "numeric", month: "long" })}</>}.
            {user.plan === "FREE" && (
              <Link href="/planes" className="mt-2 block font-semibold text-brand-600">
                Obtén hasta 80 créditos al mes con Élite →
              </Link>
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold">¿En qué se usan?</h2>
          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-zinc-50 p-3">
              <b>Enviar una oferta</b>
              <p className="text-zinc-600">1 crédito (presupuesto &lt; $20), 2 (hasta $100) o 3 (más de $100). Te lo devolvemos si el cliente cancela.</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <b>Marcar urgente · {BOOST_COSTS.URGENT}</b>
              <p className="text-zinc-600">Tu solicitud sube arriba y se avisa con prioridad.</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <b>Destacar · {BOOST_COSTS.FEATURE}</b>
              <p className="text-zinc-600">Primera posición y diseño resaltado por {FEATURE_DAYS} días.</p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <b>Volver a subir · {BOOST_COSTS.BUMP}</b>
              <p className="text-zinc-600">Tu solicitud vuelve al inicio del listado (1 vez al día).</p>
            </div>
          </div>
        </div>
      </div>

      <h2 className="mt-10 font-display text-xl font-bold">Comprar créditos</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((p, i) => (
          <div key={p.id} className={`card relative flex flex-col items-center p-6 text-center ${i === 1 ? "border-brand-300 ring-2 ring-brand-100" : ""}`}>
            {i === 1 && <span className="chip absolute -top-3 bg-brand-600 text-white">Más popular</span>}
            <div className="font-display text-4xl font-bold">{p.credits}</div>
            <div className="mt-1 text-sm text-zinc-500">créditos {p.bonus && <b className="text-emerald-700">({p.bonus})</b>}</div>
            <div className="mt-4 font-display text-2xl font-bold">${p.price.toFixed(2)}</div>
            <div className="text-xs text-zinc-400">${(p.price / p.credits).toFixed(3)} por crédito</div>
            <BuyPackButton packId={p.id} canUseBalance={walletCents >= p.price * 100} cardEnabled={cardEnabled} />
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {cardEnabled
          ? "Entorno de pruebas: el pago con tarjeta no cobra dinero real."
          : "Los créditos se pagan con el saldo de tu billetera (lo que ganas o te reembolsan)."}
      </p>

      <h2 className="mt-10 font-display text-xl font-bold">Historial</h2>
      <div className="card mt-3 divide-y divide-zinc-100">
        {history.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">Sin movimientos todavía.</p>
        ) : (
          history.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="chip w-24 shrink-0 justify-center bg-zinc-100 text-zinc-600">{REASON_LABEL[t.reason] ?? "Otro"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{t.description}</div>
                <div className="text-xs text-zinc-400">{timeAgo(t.createdAt)}</div>
              </div>
              <div className={`font-display font-bold ${t.amount > 0 ? "text-emerald-700" : "text-zinc-700"}`}>
                {t.amount > 0 ? "+" : ""}
                {t.amount}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
