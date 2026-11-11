import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/session";
import { balance, balancesByPrefix } from "@/server/services/ledger";
import { ACCOUNTS, fmtCents } from "@/domain/money";
import { timeAgo } from "@/domain/format";
import {
  adminConfirmPayment,
  adminMarkPayoutPaid,
  adminRejectPayment,
  adminRejectPayout,
  adminResolveDispute,
} from "@/app/actions/admin";
import { ActionForm, ResolveFields } from "./action-form";

export const metadata: Metadata = { title: "Administración" };

export default async function AdminPage() {
  const user = await requireUser("/admin");
  if (user.role !== "ADMIN") redirect("/");

  const [payments, disputes, payouts, world, revenue, escrows, availables, pendings, recentTx, violations] = await Promise.all([
    db.payment.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      include: { payer: { select: { name: true, email: true } }, request: { select: { id: true, title: true } } },
    }),
    db.dispute.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
      include: {
        openedBy: { select: { name: true } },
        request: {
          select: {
            id: true,
            title: true,
            author: { select: { name: true } },
            acceptedOffer: { select: { price: true, provider: { select: { name: true } } } },
          },
        },
      },
    }),
    db.payout.findMany({ where: { status: "REQUESTED" }, orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, email: true } } } }),
    balance(ACCOUNTS.WORLD),
    balance(ACCOUNTS.REVENUE),
    balancesByPrefix("ESCROW:"),
    balancesByPrefix("AVAILABLE:"),
    balancesByPrefix("PAYOUT_PENDING:"),
    db.ledgerEntry.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    db.violation.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
  ]);

  const sum = (rows: { cents: number }[]) => rows.reduce((s, r) => s + r.cents, 0);
  const escrowTotal = sum(escrows);
  const availableTotal = sum(availables);
  const pendingTotal = sum(pendings);
  // Invariante del libro: todo lo que entró (−WORLD) está en alguna cuenta interna.
  const balanced = world + escrowTotal + availableTotal + pendingTotal + revenue === 0;

  // Escrows con saldo en solicitudes que ya no deberían retenerlo (señal de error).
  const escrowIds = escrows.filter((e) => e.cents !== 0).map((e) => e.account.slice("ESCROW:".length));
  const anomalies = await db.request.findMany({
    where: { id: { in: escrowIds }, escrow: { notIn: ["HELD", "DISPUTED"] } },
    select: { id: true, title: true, escrow: true },
  });
  const disputeHeld = new Map(escrows.map((e) => [e.account.slice("ESCROW:".length), e.cents]));

  // Libro legible: una fila por transacción, con sus asientos y nombres en vez de ids.
  const ids = (prefix: string) => recentTx.filter((e) => e.account.startsWith(prefix)).map((e) => e.account.split(":")[1]!);
  const [names, titles] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...ids("AVAILABLE:"), ...ids("PAYOUT_PENDING:")] } }, select: { id: true, name: true } }),
    db.request.findMany({ where: { id: { in: ids("ESCROW:") } }, select: { id: true, title: true } }),
  ]);
  const nameOf = new Map(names.map((u) => [u.id, u.name]));
  const titleOf = new Map(titles.map((r) => [r.id, r.title]));
  const label = (account: string) => {
    const [kind, id = ""] = account.split(":");
    if (kind === "WORLD") return "🌎 Exterior (banco)";
    if (kind === "REVENUE") return "📈 Ingresos Pídelo";
    if (kind === "ESCROW") return `🛡️ Retenido · ${titleOf.get(id) ?? id.slice(0, 6)}`;
    if (kind === "AVAILABLE") return `💰 Saldo de ${nameOf.get(id) ?? id.slice(0, 6)}`;
    if (kind === "PAYOUT_PENDING") return `🏦 Retiro en proceso · ${nameOf.get(id) ?? id.slice(0, 6)}`;
    return account;
  };
  const txs: { txId: string; memo: string; createdAt: Date; legs: typeof recentTx }[] = [];
  for (const e of recentTx) {
    const t = txs.find((x) => x.txId === e.txId);
    if (t) t.legs.push(e);
    else txs.push({ txId: e.txId, memo: e.memo, createdAt: e.createdAt, legs: [e] });
  }
  // La última transacción puede venir incompleta por el límite de la consulta.
  if (txs.length > 1) txs.pop();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Administración</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Counter label="Pagos por verificar" value={payments.length} href="#pagos" />
        <Counter label="Disputas abiertas" value={disputes.length} href="#disputas" />
        <Counter label="Retiros por transferir" value={payouts.length} href="#retiros" />
      </div>

      {/* Pagos */}
      <Section id="pagos" title="🧾 Pagos por verificar" empty={!payments.length}>
        {payments.map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-lg font-bold text-brand-700">{p.code}</div>
                <div className="text-sm">
                  {p.payer.name} ({p.payer.email}) · <Link href={`/solicitudes/${p.request.id}`} className="underline">{p.request.title}</Link>
                </div>
                <div className="text-xs text-zinc-500">
                  {p.method === "DEUNA" ? "DeUna" : "Transferencia"}
                  {p.reference && ` · ref. ${p.reference}`} · enviado {p.submittedAt && timeAgo(p.submittedAt)}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold">{fmtCents(p.amountCents)}</div>
                <a href={`/api/comprobantes/${p.id}`} target="_blank" className="text-sm font-semibold text-brand-600">
                  Ver comprobante ↗
                </a>
              </div>
            </div>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Verifica en el banco que llegó <b>{fmtCents(p.amountCents)}</b> con el código <b>{p.code}</b> antes de confirmar.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ActionForm action={adminConfirmPayment.bind(null, p.id)} label="✓ Confirmar: el dinero llegó" />
              <ActionForm action={adminRejectPayment.bind(null, p.id)} label="Rechazar comprobante" variant="secondary">
                <input className="input" name="note" placeholder="Motivo (p. ej. monto no coincide)" required />
              </ActionForm>
            </div>
          </div>
        ))}
      </Section>

      {/* Disputas */}
      <Section id="disputas" title="⚖️ Disputas abiertas" empty={!disputes.length}>
        {disputes.map((d) => {
          const held = disputeHeld.get(d.request.id) ?? 0;
          return (
            <div key={d.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/solicitudes/${d.request.id}`} className="font-semibold underline">{d.request.title}</Link>
                  <div className="text-sm text-zinc-600">
                    Cliente: {d.request.author.name} · Proveedor: {d.request.acceptedOffer?.provider.name} · abierta por {d.openedBy.name}{" "}
                    {timeAgo(d.createdAt)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500">Retenido</div>
                  <div className="font-display text-2xl font-bold">{fmtCents(held)}</div>
                </div>
              </div>
              <blockquote className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">&ldquo;{d.reason}&rdquo;</blockquote>
              <p className="mt-2 text-xs text-zinc-500">
                Revisa el chat del trabajo y pide evidencia a ambas partes antes de resolver. La comisión solo se cobra sobre lo que se libera al
                proveedor.
              </p>
              <ActionForm action={adminResolveDispute.bind(null, d.id)} label="Resolver disputa" className="mt-3">
                <ResolveFields heldCents={held} />
              </ActionForm>
            </div>
          );
        })}
      </Section>

      {/* Retiros */}
      <Section id="retiros" title="🏦 Retiros por transferir" empty={!payouts.length}>
        {payouts.map((p) => {
          const b = JSON.parse(p.bankSnapshot) as Record<string, string>;
          const nameMismatch = b.bankHolderName?.trim().toLowerCase() !== p.user.name.trim().toLowerCase();
          return (
            <div key={p.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <div className="font-semibold">{p.user.name} <span className="font-normal text-zinc-500">({p.user.email})</span></div>
                  <div>
                    {b.bankName} · {b.bankAccountType === "CORRIENTE" ? "Corriente" : "Ahorros"} · <span className="font-mono">{b.bankAccountNumber}</span>
                  </div>
                  <div>Titular: {b.bankHolderName} · CI/RUC {b.bankHolderId}</div>
                  {nameMismatch && <div className="mt-1 text-xs font-semibold text-rose-700">⚠️ El titular no coincide con el nombre del usuario</div>}
                </div>
                <div className="text-right">
                  <div className="font-display text-2xl font-bold">{fmtCents(p.amountCents)}</div>
                  <div className="text-xs text-zinc-500">solicitado {timeAgo(p.createdAt)}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ActionForm action={adminMarkPayoutPaid.bind(null, p.id)} label="✓ Marcar como transferido">
                  <input className="input" name="reference" placeholder="N.º de la transferencia" required />
                </ActionForm>
                <ActionForm action={adminRejectPayout.bind(null, p.id)} label="Rechazar y devolver al saldo" variant="secondary">
                  <input className="input" name="note" placeholder="Motivo" required />
                </ActionForm>
              </div>
            </div>
          );
        })}
      </Section>

      {/* Conciliación */}
      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">📒 Conciliación</h2>
        <div className={`mt-3 rounded-2xl p-4 text-sm ${balanced && !anomalies.length ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}>
          {balanced ? "✓ El libro cuadra: cada dólar recibido está en una cuenta." : "✗ El libro NO cuadra: revisa los asientos."}
          {anomalies.length > 0 && <> · ⚠️ {anomalies.length} escrow(s) con saldo en solicitudes cerradas.</>}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Money label="Recibido neto (debe estar en el banco)" cents={-world} />
          <Money label="Retenido (escrow)" cents={escrowTotal} />
          <Money label="Saldos de usuarios" cents={availableTotal} />
          <Money label="Retiros por transferir" cents={pendingTotal} />
          <Money label="Ingresos Pídelo" cents={revenue} />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Compara diariamente &ldquo;Recibido neto&rdquo; con el saldo real de la cuenta bancaria de la empresa. Si no coinciden, hay un pago confirmado
          por error o una transferencia sin registrar.
        </p>
        {anomalies.map((a) => (
          <div key={a.id} className="mt-2 text-sm text-rose-800">
            ⚠️ <Link href={`/solicitudes/${a.id}`} className="underline">{a.title}</Link> (estado {a.escrow})
          </div>
        ))}

        <h3 className="mt-6 font-semibold">Últimas transacciones</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Doble entrada: cada transacción mueve dinero de una cuenta a otra, así que sus asientos siempre suman $0. El signo − indica de
          dónde sale el dinero y el + a dónde llega.
        </p>
        <div className="mt-2 space-y-2">
          {txs.map((t) => (
            <div key={t.txId} className="card p-3 text-xs">
              <div className="flex justify-between gap-3">
                <b className="text-sm">{t.memo}</b>
                <span className="shrink-0 text-zinc-500">{timeAgo(t.createdAt)}</span>
              </div>
              <div className="mt-2 divide-y divide-zinc-100 rounded-lg bg-zinc-50 px-3">
                {t.legs.map((e) => (
                  <div key={e.id} className="flex justify-between gap-3 py-1.5">
                    <span className="truncate">{label(e.account)}</span>
                    <span className={`shrink-0 font-mono ${e.amountCents < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                      {e.amountCents > 0 ? "+" : ""}
                      {fmtCents(e.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Moderación */}
      {violations.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">🛡️ Intentos de fuga recientes</h2>
          <div className="card mt-3 divide-y divide-zinc-100 text-sm">
            {violations.map((v) => (
              <div key={v.id} className="px-5 py-3">
                <b>{v.user.name}</b> · {v.context} · {v.action === "BLOCKED" ? "bloqueado" : "ocultado"} ({v.detector}) · {timeAgo(v.createdAt)}
                <div className="truncate text-xs text-zinc-500">{v.excerpt}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Counter({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <a href={href} className={`card p-5 hover:border-brand-200 ${value ? "border-amber-300 bg-sun-100/40" : ""}`}>
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold">{value}</div>
    </a>
  );
}

function Money({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 font-display text-xl font-bold">{fmtCents(cents)}</div>
    </div>
  );
}

function Section({ id, title, empty, children }: { id: string; title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <div className="mt-3 space-y-3">{empty ? <p className="text-sm text-zinc-500">Nada pendiente. 🎉</p> : children}</div>
    </section>
  );
}
