import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { markAllNotificationsRead } from "@/app/actions/requests";
import { EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";

export const metadata: Metadata = { title: "Notificaciones" };

export default async function NotificationsPage() {
  const user = await requireUser("/notificaciones");
  const notifications = await db.notification.findMany({
    where: { userId: user.id, visibleAt: { lte: new Date() } },
    orderBy: { visibleAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">Notificaciones</h1>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <SubmitButton variant="secondary" pendingText="…">Marcar todo como leído</SubmitButton>
          </form>
        )}
      </div>
      <div className="mt-6 space-y-2">
        {notifications.length === 0 ? (
          <EmptyState title="Sin notificaciones por ahora">
            Agrega tus habilidades en{" "}
            <Link href="/perfil/editar" className="font-semibold text-brand-600">tu perfil</Link> para recibir solicitudes
            al instante.
          </EmptyState>
        ) : (
          notifications.map((n) => (
            <Link
              key={n.id}
              href={n.link}
              className={`card flex gap-3 p-4 hover:border-brand-200 ${n.read ? "" : "border-brand-200 bg-brand-50/40"}`}
            >
              {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{n.title}</div>
                {n.body && <div className="truncate text-sm text-zinc-600">{n.body}</div>}
              </div>
              <div className="shrink-0 text-xs text-zinc-400">{timeAgo(n.visibleAt)}</div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
