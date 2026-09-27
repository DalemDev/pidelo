import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/constants";
import { AutoRenewToggle, SubscribeButton } from "./plan-buttons";
import { balance } from "@/lib/ledger";
import { ACCOUNTS } from "@/lib/money";

export const metadata: Metadata = { title: "Planes" };

export default async function PlansPage() {
  const user = await getCurrentUser();
  const current = (user?.plan ?? "FREE") as PlanId;
  const walletCents = user ? await balance(ACCOUNTS.available(user.id)) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center">
        <span className="chip bg-brand-50 text-brand-700">Para quienes resuelven</span>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Gana más trabajos, paga menos comisión</h1>
        <p className="mx-auto mt-2 max-w-2xl text-zinc-600">
          Publicar necesidades siempre es gratis. Los planes son para quienes ofrecen sus servicios y quieren llegar primero.
        </p>
      </div>

      {user && current !== "FREE" && user.planRenewsAt && (
        <div className="card mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>
            Tu plan <b>{PLANS[current].label}</b> {user.planAutoRenew ? "se renueva" : "termina"} el{" "}
            <b>{user.planRenewsAt.toLocaleDateString("es-EC", { day: "numeric", month: "long" })}</b>.
          </span>
          <AutoRenewToggle autoRenew={user.planAutoRenew} />
        </div>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {(Object.values(PLANS)).map((plan) => {
          const highlight = plan.id === "PRO";
          const isCurrent = plan.id === current;
          return (
            <div
              key={plan.id}
              className={`card relative flex flex-col p-6 ${highlight ? "border-brand-300 shadow-xl shadow-brand-900/5 ring-2 ring-brand-100" : ""} ${
                plan.id === "ELITE" ? "bg-gradient-to-b from-sun-100/40 to-white" : ""
              }`}
            >
              {highlight && <span className="chip absolute -top-3 left-6 bg-brand-600 text-white">Recomendado</span>}
              <h2 className="font-display text-2xl font-bold">{plan.label}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-4xl font-bold">${plan.price.toFixed(2)}</span>
                <span className="text-zinc-500">/mes</span>
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                Comisión {Math.round(plan.fee * 100)} % · 🪙 {plan.monthlyCredits} créditos/mes
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex gap-2">
                    <span className="text-emerald-600">✓</span>
                    {perk}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {user?.role === "ADMIN" ? (
                  <p className="text-center text-xs text-zinc-500">Las cuentas de administración no usan planes.</p>
                ) : !user ? (
                  <Link href="/registro?next=/planes" className={`${highlight ? "btn-primary" : "btn-secondary"} w-full`}>
                    Empezar
                  </Link>
                ) : isCurrent ? (
                  <div className="btn-secondary pointer-events-none w-full">Tu plan actual</div>
                ) : plan.id === "FREE" ? (
                  <p className="text-center text-xs text-zinc-500">Desactiva la renovación para volver al plan gratis al final del periodo.</p>
                ) : (
                  <SubscribeButton planId={plan.id} label={`Suscribirme a ${plan.label}`} primary={highlight} canUseBalance={walletCents >= plan.price * 100} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mx-auto mt-10 max-w-3xl p-6 text-sm text-zinc-600">
        <h3 className="font-semibold text-zinc-900">¿Cómo se paga solo el plan?</h3>
        <p className="mt-1">
          En un trabajo de $100, con el plan gratis recibes $90. Con Pro recibes $93 y con Élite $95. Si haces más de 2 trabajos de ese
          tamaño al mes, Pro ya te sale gratis, y eso sin contar los créditos incluidos ni la ventaja de ofertar primero.
        </p>
        <p className="mt-3 text-xs text-zinc-400">MVP: suscripción simulada, no se cobra dinero real.</p>
      </div>
    </div>
  );
}
