// Cifra los datos bancarios guardados antes de que existiera el cifrado en reposo. Idempotente: los
// valores ya cifrados se dejan como están. Uso: npm run data:encrypt-bank
import "dotenv/config";
import { db } from "../src/server/db/client";
import { encrypt } from "../src/server/infra/crypto";

const PREFIX = "enc:v1:";
const plain = (v: string | null) => !!v && !v.startsWith(PREFIX);

async function main() {
  const users = await db.user.findMany({
    where: { OR: [{ bankAccountNumber: { not: null } }, { bankHolderId: { not: null } }] },
    select: { id: true, bankAccountNumber: true, bankHolderId: true },
  });
  let n = 0;
  for (const u of users) {
    if (!plain(u.bankAccountNumber) && !plain(u.bankHolderId)) continue;
    await db.user.update({
      where: { id: u.id },
      data: {
        bankAccountNumber: plain(u.bankAccountNumber) ? encrypt(u.bankAccountNumber) : u.bankAccountNumber,
        bankHolderId: plain(u.bankHolderId) ? encrypt(u.bankHolderId) : u.bankHolderId,
      },
    });
    n++;
  }
  const payouts = await db.payout.findMany({ where: { NOT: { bankSnapshot: { startsWith: PREFIX } } }, select: { id: true, bankSnapshot: true } });
  for (const p of payouts) await db.payout.update({ where: { id: p.id }, data: { bankSnapshot: encrypt(p.bankSnapshot) } });
  console.log(`Usuarios cifrados: ${n} · retiros cifrados: ${payouts.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
