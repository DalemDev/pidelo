import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { PLANS, planOf, type PlanId } from "@/domain/plans";
import { quotePlanChange } from "@/domain/plans";
import { AutoRenewToggle, CancelChangeButton, SubscribeButton } from "./plan-buttons";
import { balance } from "@/server/services/ledger";
import { ACCOUNTS, fmtCents } from "@/domain/money";
import { simulatedPaymentsEnabled } from "@/server/config/env";

export const metadata: Metadata = { title: "Planes" };

const fmtDate = (d: Date) => d.toLocaleDateString("es-EC", { day: "numeric", month: "long" });

export default async function PlansPage({ searchParams }: PageProps<"/planes">) {
  const [user, sp] = await Promise.all([getCurrentUser(), searchParams]);
  const changed = typeof sp.cambio === "string" && typeof sp.plan === "string" && sp.plan in PLANS ? { kind: sp.cambio, plan: PLANS[sp.plan as PlanId] } : null;
  const paid = Number(sp.monto ?? 0);
  const gained = Number(sp.creditos ?? 0);
  const current = (user?.plan ?? "FREE") as PlanId;
  const walletCents = user ? await balance(ACCOUNTS.available(user.id)) : 0;
  const nextPlan = user?.nextPlan ? planOf(user.nextPlan) : null;
  const cardEnabled = simulatedPaymentsEnabled();

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center">
        <span className="chip bg-brand-50 text-brand-700">Para quienes resuelven</span>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">Gana más trabajos, paga menos comisión</h1>
        <p className="mx-auto mt-2 max-w-2xl text-zinc-600">
          Publicar necesidades siempre es gratis. Los planes son para quienes ofrecen sus servicios y quieren llegar primero.
        </p>
      </div>

      {changed && (
        <div role="status" className="mx-auto mt-8 max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {changed.kind === "downgrade" ? (
            <>
              Listo: pasarás a <b>{changed.plan.label}</b> en tu próxima renovación. Hasta entonces conservas tu plan actual.
            </>
          ) : (
            <>
              {changed.kind === "upgrade" ? "Ahora tienes el plan" : "Te suscribiste al plan"} <b>{changed.plan.label}</b>.{" "}
              {paid > 0 && <>Pagaste {fmtCents(paid)}{changed.kind === "upgrade" && " por los días que quedan del ciclo"} y </>}
              sumaste {gained} créditos.
            </>
          )}
        </div>
      )}

      {user && current !== "FREE" && user.planRenewsAt && (
        <div className="card mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>
            Tu plan <b>{PLANS[current].label}</b>{" "}
            {nextPlan && user.planAutoRenew ? (
              <>
                pasará a <b>{nextPlan.label}</b> el
              </>
            ) : user.planAutoRenew ? (
              "se renueva el"
            ) : (
              "termina el"
            )}{" "}
            <b>{fmtDate(user.planRenewsAt)}</b>.
          </span>
          <div className="flex gap-2">
            {nextPlan && user.planAutoRenew && <CancelChangeButton />}
            <AutoRenewToggle autoRenew={user.planAutoRenew} />
          </div>
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
                Comisión {Math.round(plan.fee * 100)} % · {plan.monthlyCredits} créditos/mes
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
                  (() => {
                    const q = quotePlanChange(user, plan.id);
                    if (q.kind === "DOWNGRADE") {
                      return user.nextPlan === plan.id ? (
                        <p className="text-center text-xs text-zinc-500">Cambio programado para el {fmtDate(q.renewsAt)}.</p>
                      ) : (
                        <SubscribeButton
                          planId={plan.id}
                          label={`Cambiar a ${plan.label} al renovar`}
                          note={`Conservas tu plan actual hasta el ${fmtDate(q.renewsAt)}. Sin cobros hoy.`}
                          primary={false}
                          cardEnabled={cardEnabled}
                          free
                        />
                      );
                    }
                    if (q.kind === "UPGRADE") {
                      return (
                        <SubscribeButton
                          planId={plan.id}
                          label={`Mejorar a ${plan.label} · ${fmtCents(q.chargeCents)}`}
                          note={`Pagas solo la diferencia por los ${q.daysLeft} días que quedan y recibes ${q.credits} créditos. Tu renovación sigue el ${fmtDate(q.renewsAt)}.`}
                          primary={highlight}
                          canUseBalance={walletCents >= q.chargeCents}
                          cardEnabled={cardEnabled}
                        />
                      );
                    }
                    return (
                      <SubscribeButton
                        planId={plan.id}
                        label={`Suscribirme a ${plan.label}`}
                        primary={highlight}
                        canUseBalance={q.kind === "NEW" && walletCents >= q.chargeCents}
                        cardEnabled={cardEnabled}
                      />
                    );
                  })()
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
        <p className="mt-3 text-xs text-zinc-400">
          {cardEnabled
            ? "Entorno de pruebas: el pago con tarjeta no cobra dinero real."
            : "Los planes se pagan con el saldo de tu billetera y se renuevan con él cada 30 días."}
        </p>
      </div>
    </div>
  );
}
