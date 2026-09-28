import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import { ALL_ECUADOR, CATEGORIES, CITIES, EARLY_ACCESS_MINUTES, KINDS, planOf } from "@/lib/constants";
import { earlyAccessFilter, sortFeed } from "@/lib/feed";
import { splitSkills } from "@/lib/format";
import { EmptyState, RequestCard } from "@/components/ui";

export const metadata: Metadata = { title: "Explorar solicitudes" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function FeedPage({ searchParams }: PageProps<"/solicitudes">) {
  const sp = await searchParams;
  const q = param(sp.q).trim();
  const categoria = param(sp.categoria);
  const tipo = param(sp.tipo);
  const ciudad = param(sp.ciudad);
  const urgente = param(sp.urgente) === "1";
  const user = await getCurrentUser();
  const skills = user ? splitSkills(user.skills) : [];
  const paraTi = param(sp.vista) === "parati" && skills.length > 0;

  const where: Prisma.RequestWhereInput = { status: "OPEN" };
  // PostgreSQL distingue mayúsculas en LIKE: la búsqueda debe ser insensible ("excel" encuentra "Excel").
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }];
  if (categoria) where.category = categoria;
  else if (paraTi) where.category = { in: skills };
  if (tipo) where.kind = tipo;
  if (ciudad) where.city = { in: [ciudad, ALL_ECUADOR] };
  if (urgente) where.urgent = true;
  if (user && paraTi) where.authorId = { not: user.id };
  where.AND = [earlyAccessFilter(user)];

  const requests = sortFeed(
    await db.request.findMany({
      where,
      orderBy: { bumpedAt: "desc" },
      take: 100,
      include: { author: { select: { name: true } }, _count: { select: { offers: true } } },
    }),
  ).slice(0, 60);
  const isPremium = !!user && planOf(user.plan).earlyAccess;

  const tabHref = (vista?: string) => {
    const params = new URLSearchParams();
    if (vista) params.set("vista", vista);
    return `/solicitudes${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Solicitudes abiertas</h1>
          <p className="mt-1 text-zinc-600">Encuentra a alguien a quien ayudar y envía tu oferta.</p>
        </div>
        {user && (
          <div className="flex rounded-xl bg-zinc-100 p-1 text-sm font-semibold">
            <Link href={tabHref()} className={`rounded-lg px-4 py-1.5 ${!paraTi ? "bg-white shadow-sm" : "text-zinc-600"}`}>
              Todas
            </Link>
            <Link
              href={skills.length ? tabHref("parati") : "/perfil/editar"}
              className={`rounded-lg px-4 py-1.5 ${paraTi ? "bg-white shadow-sm" : "text-zinc-600"}`}
            >
              🎯 Para ti
            </Link>
          </div>
        )}
      </div>

      <form className="card mt-6 grid gap-3 p-4 md:grid-cols-[2fr_1fr_1fr_1fr_auto_auto]">
        {paraTi && <input type="hidden" name="vista" value="parati" />}
        <input className="input" name="q" defaultValue={q} placeholder="Buscar: excel, tesis, plomero, SRI…" aria-label="Buscar" />
        <select className="input" name="categoria" defaultValue={categoria} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>)}
        </select>
        <select className="input" name="tipo" defaultValue={tipo} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        <select className="input" name="ciudad" defaultValue={ciudad} aria-label="Ciudad">
          <option value="">Todo el país</option>
          {CITIES.filter((c) => c !== ALL_ECUADOR).map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 px-2 text-sm font-semibold">
          <input type="checkbox" name="urgente" value="1" defaultChecked={urgente} className="h-4 w-4 accent-amber-500" />
          ⚡ Urgentes
        </label>
        <button className="btn-primary">Filtrar</button>
      </form>

      {user && !isPremium && user.role !== "ADMIN" && (
        <Link
          href="/planes"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm hover:border-brand-200"
        >
          <span>
            ⏱ Los miembros <b>Pro</b> ven y ofertan en solicitudes nuevas <b>{EARLY_ACCESS_MINUTES} minutos antes</b>. Quien oferta
            primero gana más trabajos.
          </span>
          <span className="shrink-0 font-semibold text-brand-700">Ver planes →</span>
        </Link>
      )}

      <div className="mt-6">
        {requests.length === 0 ? (
          <EmptyState title="No hay solicitudes con esos filtros">
            Prueba otros filtros o{" "}
            <Link href="/publicar" className="font-semibold text-brand-600">publica tu propia necesidad</Link>.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {requests.map((r) => (
              <RequestCard key={r.id} r={r} matched={skills.includes(r.category) && r.authorId !== user?.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
