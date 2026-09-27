import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type Leg = { account: string; amountCents: number };

/**
 * Registra una transacción contable. Invariante: los asientos suman exactamente cero
 * (el dinero nunca aparece ni desaparece, solo se mueve entre cuentas). Los asientos son inmutables:
 * para corregir algo se registra una transacción inversa, nunca se edita.
 */
export async function post(tx: Tx, legs: Leg[], memo: string, refType = "", refId = "") {
  const clean = legs.filter((l) => l.amountCents !== 0);
  const sum = clean.reduce((s, l) => s + l.amountCents, 0);
  if (sum !== 0) throw new Error(`Transacción descuadrada (${sum} centavos): ${memo}`);
  if (clean.some((l) => !Number.isInteger(l.amountCents))) throw new Error("Montos deben ser centavos enteros");

  const txId = randomUUID();
  await tx.ledgerEntry.createMany({
    data: clean.map((l) => ({ txId, account: l.account, amountCents: l.amountCents, memo, refType, refId })),
  });
  return txId;
}

export async function balance(account: string, client: Tx | typeof db = db) {
  const r = await client.ledgerEntry.aggregate({ where: { account }, _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}

/** Saldos por cuenta que empiezan con un prefijo (p. ej. "ESCROW:"). */
export async function balancesByPrefix(prefix: string) {
  const rows = await db.ledgerEntry.groupBy({
    by: ["account"],
    where: { account: { startsWith: prefix } },
    _sum: { amountCents: true },
  });
  return rows.map((r) => ({ account: r.account, cents: r._sum.amountCents ?? 0 }));
}
