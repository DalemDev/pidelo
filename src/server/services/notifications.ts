import "server-only";
import { db } from "@/server/db/client";
import type { Tx } from "@/server/db/client";
import { logger } from "@/server/infra/logger";

// Notificaciones. La bandeja dentro de la app es la fuente de verdad; los canales externos (correo,
// WhatsApp, push) se agregan implementando NotificationChannel, sin tocar a quienes notifican.

export type Notice = { userId: string; title: string; body: string; link: string };

export interface NotificationChannel {
  readonly name: string;
  deliver(notice: Notice): Promise<void>;
}

const externalChannels: NotificationChannel[] = [];

/** Registra un canal externo (p. ej. al integrar WhatsApp Business). */
export function registerChannel(channel: NotificationChannel) {
  externalChannels.push(channel);
}

async function fanOut(notices: Notice[]) {
  // Best effort: un canal caído no debe romper la operación que generó el aviso.
  await Promise.all(
    externalChannels.flatMap((channel) =>
      notices.map((n) =>
        channel.deliver(n).catch((error) => logger.warn("notification_channel_failed", { channel: channel.name, error })),
      ),
    ),
  );
}

export async function notify(userId: string, title: string, body: string, link: string, client: Tx | typeof db = db) {
  await client.notification.create({ data: { userId, title, body, link } });
  await fanOut([{ userId, title, body, link }]);
}

/** Aviso con visibilidad diferida (acceso anticipado de planes pagados). Solo bandeja interna. */
export async function notifyScheduled(notices: (Notice & { visibleAt: Date })[]) {
  if (notices.length) await db.notification.createMany({ data: notices });
}

export async function notifyAdmins(title: string, body: string, link: string) {
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  if (!admins.length) return;
  const notices = admins.map((a) => ({ userId: a.id, title, body, link }));
  await db.notification.createMany({ data: notices });
  await fanOut(notices);
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, read: false, visibleAt: { lte: new Date() } }, data: { read: true } });
}
