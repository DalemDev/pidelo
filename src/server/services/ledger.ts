import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db/client";
import type { Tx } from "@/server/db/client";

// Libro contable de doble entrada. Cuentas en src/domain/money.ts (ACCOUNTS).

type Leg = { account: string; amountCents: number };

/**
 * Registra una transacción contable. Invariante: los asientos suman exactamente cero
 * (el dinero nunca aparece ni desaparece, solo se mueve entre cuentas). Los asientos son inmutables:
 * para corregir algo se registra una transacción inversa, nunca se edita.
 */
export async function post(tx: Tx, legs: Leg[], memo: string, refType = "", refId = "") {
  const clean = legs.filter((l) => l.amountCents !== 0);
  if (clean.some((l) => !Number.isSafeInteger(l.amountCents))) throw new Error("Montos deben ser centavos enteros");
  const sum = clean.reduce((s, l) => s + l.amountCents, 0);
  if (sum !== 0) throw new Error(`Transacción descuadrada (${sum} centavos): ${memo}`);

  const txId = randomUUID();
  await tx.ledgerEntry.createMany({
    data: clean.map((l) => ({ txId, account: l.account, amountCents: l.amountCents, memo, refType, refId })),
  });
  return txId;
}

/**
 * Bloquea una cuenta (o cualquier clave) hasta que termine la transacción. Usar antes de leer un saldo
 * para debitarlo: con READ COMMITTED, dos transacciones simultáneas podrían leer el mismo saldo y gastarlo dos veces.
 */
export async function lockAccount(tx: Tx, account: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${account}))`;
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
