import "server-only";
import { ACCOUNTS, BANK_CHANGE_HOLD_HOURS, NEW_PROVIDER_HOLD_DAYS, NEW_PROVIDER_JOBS, splitFee } from "@/domain/money";
import { db } from "@/server/db/client";
import { balance } from "@/server/services/ledger";

/** Saldos de la billetera y cuánto se puede retirar hoy. Lo usan la página de billetera y el servicio de retiros. */
export async function walletSummary(userId: string) {
  const [available, payoutPending, paidOut, heldJobs, completedJobs, recentReleases, entries, user] = await Promise.all([
    balance(ACCOUNTS.available(userId)),
    balance(ACCOUNTS.payoutPending(userId)),
    db.payout.aggregate({ where: { userId, status: "PAID" }, _sum: { amountCents: true } }),
    db.request.findMany({
      where: { escrow: { in: ["HELD", "DISPUTED"] }, acceptedOffer: { providerId: userId } },
      select: { id: true, title: true, escrow: true, status: true, acceptedOffer: { select: { feeRate: true } } },
      take: 100,
    }),
    db.offer.count({ where: { providerId: userId, status: "ACCEPTED", request: { status: "COMPLETED" } } }),
    db.ledgerEntry.aggregate({
      where: {
        account: ACCOUNTS.available(userId),
        refType: "RELEASE",
        createdAt: { gte: new Date(Date.now() - NEW_PROVIDER_HOLD_DAYS * 86400_000) },
      },
      _sum: { amountCents: true },
    }),
    db.ledgerEntry.findMany({
      where: { account: { in: [ACCOUNTS.available(userId), ACCOUNTS.payoutPending(userId)] } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.user.findUnique({ where: { id: userId }, select: { bankUpdatedAt: true } }),
  ]);

  const held = await Promise.all(
    heldJobs.map(async (r) => {
      const cents = await balance(ACCOUNTS.escrow(r.id));
      return { ...r, cents, net: splitFee(cents, r.acceptedOffer?.feeRate ?? 0.1).provider };
    }),
  );

  // Proveedores nuevos: lo liberado en los últimos días aún no se puede retirar (protección ante fraude).
  const isNew = completedJobs < NEW_PROVIDER_JOBS;
  const locked = isNew ? Math.min(available, recentReleases._sum.amountCents ?? 0) : 0;
  // Tras cambiar la cuenta bancaria, los retiros esperan (protección ante robo de sesión).
  const bankHoldUntil =
    user?.bankUpdatedAt && user.bankUpdatedAt.getTime() + BANK_CHANGE_HOLD_HOURS * 3600_000 > Date.now()
      ? new Date(user.bankUpdatedAt.getTime() + BANK_CHANGE_HOLD_HOURS * 3600_000)
      : null;

  return {
    available,
    withdrawable: bankHoldUntil ? 0 : Math.max(0, available - locked),
    locked,
    isNew,
    bankHoldUntil,
    payoutPending,
    paidOut: paidOut._sum.amountCents ?? 0,
    held,
    heldTotal: held.reduce((s, h) => s + h.net, 0),
    entries,
  };
}
