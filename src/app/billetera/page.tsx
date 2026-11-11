import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/server/db/client";
import { requireMember } from "@/server/auth/session";
import { releaseDueEscrows, walletSummary } from "@/server/services/escrow";
import { MIN_PAYOUT_CENTS, NEW_PROVIDER_HOLD_DAYS, NEW_PROVIDER_JOBS, fmtCents } from "@/domain/money";
import { timeAgo } from "@/domain/format";
import { BankForm, PayoutForm } from "./forms";

export const metadata: Metadata = { title: "Billetera" };

const PAYOUT_STATUS: Record<string, { label: string; tone: string }> = {
  REQUESTED: { label: "En proceso", tone: "bg-amber-100 text-amber-900" },
  PAID: { label: "Transferido", tone: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Rechazado", tone: "bg-rose-100 text-rose-800" },
};

export default async function WalletPage() {
  const session = await requireMember("/billetera");
  // Asegura que los pagos vencidos (72 h) ya estén liberados antes de leer saldos.
  await releaseDueEscrows();
  const [w, bank, payouts] = await Promise.all([
    walletSummary(session.id),
    db.user.findUniqueOrThrow({
      where: { id: session.id },
      select: { bankName: true, bankAccountType: true, bankAccountNumber: true, bankHolderName: true, bankHolderId: true },
    }),
    db.payout.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Billetera</h1>
      <p className="mt-1 text-zinc-600">Lo que ganas en Pídelo y los reembolsos que recibes llegan aquí.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="text-sm font-semibold text-emerald-800">Disponible</div>
          <div className="mt-1 font-display text-3xl font-bold">{fmtCents(w.available)}</div>
          {w.locked > 0 && (
            <div className="mt-1 text-xs text-zinc-500">{fmtCents(w.withdrawable)} retirable hoy</div>
          )}
        </div>
        <div className="card p-5">
          <div className="text-sm text-zinc-500">🛡️ Retenido en trabajos</div>
          <div className="mt-1 font-display text-3xl font-bold">{fmtCents(w.heldTotal)}</div>
          <div className="mt-1 text-xs text-zinc-500">Se libera cuando el cliente confirma</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-zinc-500">Retiros en proceso</div>
          <div className="mt-1 font-display text-3xl font-bold">{fmtCents(w.payoutPending)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-zinc-500">Total retirado</div>
          <div className="mt-1 font-display text-3xl font-bold">{fmtCents(w.paidOut)}</div>
        </div>
      </div>

      {w.locked > 0 && (
        <p className="mt-3 rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">
          Por seguridad, a los proveedores con menos de {NEW_PROVIDER_JOBS} trabajos completados les retenemos lo liberado durante{" "}
          {NEW_PROVIDER_HOLD_DAYS} días antes de poder retirarlo ({fmtCents(w.locked)} por ahora).
        </p>
      )}

      {w.held.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Trabajos con pago retenido</h2>
          <div className="card mt-3 divide-y divide-zinc-100">
            {w.held.map((h) => (
              <Link key={h.id} href={`/solicitudes/${h.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-zinc-50">
                <span className="truncate">
                  {h.escrow === "DISPUTED" && <span className="chip mr-2 bg-rose-100 text-rose-800">En disputa</span>}
                  {h.title}
                </span>
                <span className="shrink-0 font-semibold">{fmtCents(h.net)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">Retirar a mi cuenta</h2>
          {bank.bankAccountNumber ? (
            <>
              <p className="mt-1 text-sm text-zinc-600">
                A {bank.bankName} ···{bank.bankAccountNumber.slice(-4)} · mínimo {fmtCents(MIN_PAYOUT_CENTS)} · 1 a 2 días hábiles.
              </p>
              <PayoutForm withdrawable={w.withdrawable} />
            </>
          ) : (
            <p className="mt-1 text-sm text-zinc-600">Registra tu cuenta bancaria para poder retirar.</p>
          )}
          <p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            También puedes usar tu saldo para <Link href="/creditos" className="font-semibold text-brand-600">comprar créditos</Link> o{" "}
            <Link href="/planes" className="font-semibold text-brand-600">pagar tu plan</Link> sin tarjeta.
          </p>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Cuenta bancaria</h2>
          <p className="mt-1 text-sm text-zinc-600">Debe estar a tu nombre. Verificamos que el titular coincida antes de transferir.</p>
          <BankForm
            bank={{
              bankName: bank.bankName ?? "",
              bankAccountType: bank.bankAccountType ?? "AHORROS",
              bankAccountNumber: bank.bankAccountNumber ?? "",
              bankHolderName: bank.bankHolderName ?? session.name,
              bankHolderId: bank.bankHolderId ?? "",
            }}
          />
        </section>
      </div>

      {payouts.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold">Mis retiros</h2>
          <div className="card mt-3 divide-y divide-zinc-100">
            {payouts.map((p) => {
              const st = PAYOUT_STATUS[p.status]!;
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                  <span className="font-display font-bold">{fmtCents(p.amountCents)}</span>
                  <span className={`chip ${st.tone}`}>{st.label}</span>
                  <span className="text-zinc-500">{timeAgo(p.createdAt)}</span>
                  {p.reference && <span className="text-zinc-500">· ref. {p.reference}</span>}
                  {p.adminNote && <span className="w-full text-xs text-rose-700">{p.adminNote}</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg font-bold">Movimientos</h2>
        <div className="card mt-3 divide-y divide-zinc-100">
          {w.entries.length === 0 ? (
            <p className="p-5 text-sm text-zinc-500">Todavía no tienes movimientos. Cuando completes un trabajo, tu pago aparecerá aquí.</p>
          ) : (
            w.entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{e.memo}</div>
                  <div className="text-xs text-zinc-400">
                    {timeAgo(e.createdAt)}
                    {e.account.startsWith("PAYOUT_PENDING") && " · retiros en proceso"}
                  </div>
                </div>
                <div className={`font-display font-bold ${e.amountCents > 0 ? "text-emerald-700" : "text-zinc-700"}`}>
                  {e.amountCents > 0 ? "+" : ""}
                  {fmtCents(e.amountCents)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
