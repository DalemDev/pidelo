import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { getReputations } from "@/server/queries/reputation";
import { categoryOf } from "@/domain/catalog";
import { splitSkills, timeAgo } from "@/domain/format";
import { Avatar, PlanBadge, RequestCard, Stars } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/perfil/[id]">): Promise<Metadata> {
  const { id } = await params;
  const u = await db.user.findUnique({ where: { id }, select: { name: true } });
  return { title: u?.name ?? "Perfil" };
}

export default async function ProfilePage({ params }: PageProps<"/perfil/[id]">) {
  const { id } = await params;
  const [profile, me] = await Promise.all([
    db.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        city: true,
        bio: true,
        skills: true,
        plan: true,
        createdAt: true,
        reviewsReceived: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { author: { select: { id: true, name: true } }, request: { select: { title: true } } },
        },
      },
    }),
    getCurrentUser(),
  ]);
  if (!profile) notFound();

  const [rep, openRequests] = await Promise.all([
    getReputations([profile.id]).then((m) => m.get(profile.id)!),
    db.request.findMany({
      where: { authorId: profile.id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { author: { select: { name: true } }, _count: { select: { offers: true } } },
    }),
  ]);
  const skills = splitSkills(profile.skills);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <Avatar name={profile.name} size="lg" />
        <div className="flex-1">
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight">
            {profile.name} <PlanBadge plan={profile.plan} />
          </h1>
          <div className="mt-1 text-sm text-zinc-500">
            {profile.city} · En Pídelo desde {profile.createdAt.toLocaleDateString("es-EC", { month: "long", year: "numeric" })}
          </div>
          {profile.bio && <p className="mt-3 max-w-2xl text-zinc-700">{profile.bio}</p>}
          {skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {skills.map((s) => {
                const c = categoryOf(s);
                return <span key={s} className="chip bg-brand-50 text-brand-700">{c.icon} {c.label}</span>;
              })}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:w-56">
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="font-display text-2xl font-bold">{rep.rating?.toFixed(1) ?? "—"}</div>
            <div className="text-xs text-zinc-500">{rep.reviews} reseñas</div>
          </div>
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="font-display text-2xl font-bold">{rep.completed}</div>
            <div className="text-xs text-zinc-500">trabajos</div>
          </div>
        </div>
      </div>
      {me?.id === profile.id && (
        <div className="mt-3 text-right">
          <Link href="/perfil/editar" className="text-sm font-semibold text-brand-600">Editar perfil →</Link>
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">Reseñas</h2>
        {profile.reviewsReceived.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Todavía no tiene reseñas.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {profile.reviewsReceived.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <Stars value={r.rating} className="text-lg" />
                  <span className="text-xs text-zinc-400">{timeAgo(r.createdAt)}</span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-zinc-700">&ldquo;{r.comment}&rdquo;</p>}
                <div className="mt-3 text-xs text-zinc-500">
                  <Link href={`/perfil/${r.author.id}`} className="font-semibold hover:underline">{r.author.name}</Link> · {r.request.title}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {openRequests.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Solicitudes abiertas de {profile.name.split(" ")[0]}</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {openRequests.map((r) => <RequestCard key={r.id} r={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
