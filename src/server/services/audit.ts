import "server-only";
import { db } from "@/server/db/client";
import type { Tx } from "@/server/db/client";
import { clientIp } from "@/server/infra/rate-limit";

// Registro de auditoría de acciones sensibles (quién, qué, sobre qué, cuándo y desde dónde).
// Se escribe dentro de la misma transacción que la operación: si la operación se revierte, el registro también.

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  // Sin datos sensibles: montos, estados, notas.
  data?: Record<string, unknown>;
};

async function currentIp() {
  try {
    return await clientIp();
  } catch {
    // Fuera de un request (cron, scripts) no hay cabeceras.
    return "";
  }
}

export async function audit(entry: AuditEntry, client: Tx | typeof db = db) {
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      data: JSON.stringify(entry.data ?? {}),
      ip: await currentIp(),
    },
  });
}
