import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { logout } from "@/app/actions/auth";
import { Avatar, PlanBadge } from "./ui";
import { refreshAccount } from "@/server/services/billing";
import { runScheduledJobsOnRequest } from "@/server/jobs/scheduler";

export async function Navbar() {
  const session = await getCurrentUser();
  // Renueva planes y entrega créditos mensuales si corresponde (una consulta; casi siempre no hace nada).
  if (session) await refreshAccount(session.id);
  // En producción los trabajos programados los dispara el cron; esto solo actúa en desarrollo.
  await runScheduledJobsOnRequest();
  const [user, unread] = session
    ? await Promise.all([
        db.user.findUnique({ where: { id: session.id }, select: { id: true, name: true, email: true, credits: true, plan: true, role: true } }),
        db.notification.count({ where: { userId: session.id, read: false, visibleAt: { lte: new Date() } } }),
      ])
    : [null, 0];
  const isAdminUser = user?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center gap-1.5 px-4 sm:gap-2">
        <Link href="/" className="mr-2 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 font-display text-lg font-bold text-white">
            P
          </span>
          <span className="hidden font-display text-xl font-bold tracking-tight min-[400px]:inline">Pídelo</span>
        </Link>

        <Link href="/solicitudes" className="btn-ghost hidden sm:inline-flex">
          Explorar
        </Link>
        {user && !isAdminUser && (
          <Link href="/actividad" className="btn-ghost hidden sm:inline-flex">
            Mi actividad
          </Link>
        )}
        {!isAdminUser && (
          <Link href="/planes" className="btn-ghost hidden md:inline-flex">
            Planes
          </Link>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {isAdminUser ? (
            <Link href="/admin" className="btn-primary">
              ⚙️ <span className="hidden sm:inline">Panel de administración</span>
              <span className="sm:hidden">Admin</span>
            </Link>
          ) : (
            <Link href="/publicar" className="btn-primary">
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:inline">Publicar necesidad</span>
              <span className="sm:hidden">Publicar</span>
            </Link>
          )}

          {user ? (
            <>
              {!isAdminUser && (
              <Link
                href="/creditos"
                className="chip h-10 shrink-0 gap-1.5 whitespace-nowrap rounded-xl border border-amber-200 bg-sun-100/60 px-3 text-sm text-amber-900 hover:bg-sun-100"
                aria-label={`${user.credits} créditos`}
              >
                🪙 {user.credits}
              </Link>
              )}
              <Link
                href="/notificaciones"
                className="relative grid h-10 w-10 place-items-center rounded-xl hover:bg-zinc-100"
                aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center rounded-full">
                  <Avatar name={user.name} size="sm" />
                </summary>
                <div className="card absolute right-0 mt-2 w-52 overflow-hidden p-1.5 text-sm">
                  <div className="px-3 py-2">
                    <div className="flex items-center gap-1.5 font-semibold">
                      {user.name} <PlanBadge plan={user.plan} />
                    </div>
                    <div className="truncate text-xs text-zinc-500">{user.email}</div>
                  </div>
                  {!isAdminUser && (
                    <>
                      <Link href="/billetera" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">
                        💰 Billetera
                      </Link>
                      <Link href="/creditos" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">
                        Mis créditos
                      </Link>
                    </>
                  )}
                  {user.role === "ADMIN" && (
                    <Link href="/admin" className="block rounded-lg px-3 py-2 font-semibold text-brand-700 hover:bg-brand-50">
                      ⚙️ Administración
                    </Link>
                  )}
                  {!isAdminUser && (
                    <Link href="/planes" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">
                      {user.plan === "FREE" ? "Mejorar plan ✨" : "Mi plan"}
                    </Link>
                  )}
                  <Link href={`/perfil/${user.id}`} className="block rounded-lg px-3 py-2 hover:bg-zinc-100">
                    Mi perfil
                  </Link>
                  {!isAdminUser && (
                    <>
                      <Link href="/actividad" className="block rounded-lg px-3 py-2 hover:bg-zinc-100 sm:hidden">
                        Mi actividad
                      </Link>
                      <Link href="/perfil/editar" className="block rounded-lg px-3 py-2 hover:bg-zinc-100">
                        Editar perfil y habilidades
                      </Link>
                    </>
                  )}
                  <form action={logout}>
                    <button className="w-full rounded-lg px-3 py-2 text-left text-rose-600 hover:bg-rose-50">
                      Cerrar sesión
                    </button>
                  </form>
                </div>
              </details>
            </>
          ) : (
            <Link href="/ingresar" className="btn-secondary">
              Ingresar
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
