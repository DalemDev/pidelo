import Link from "next/link";
import { STATUS_LABELS, categoryOf, kindLabel, modalityLabel } from "@/lib/constants";
import { budgetLabel, initials, timeAgo } from "@/lib/format";
import type { Reputation } from "@/lib/matching";

const AVATAR_COLORS = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  const dims = { sm: "h-9 w-9 text-sm", md: "h-11 w-11 text-base", lg: "h-20 w-20 text-2xl" }[size];
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold ${color} ${dims}`}>{initials(name)}</span>
  );
}

export function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`text-sun-500 ${className}`} aria-label={`${value.toFixed(1)} de 5 estrellas`}>
      {"★★★★★".slice(0, Math.round(value))}
      <span className="text-zinc-300">{"★★★★★".slice(Math.round(value))}</span>
    </span>
  );
}

export function ReputationLine({ rep }: { rep?: Reputation }) {
  if (!rep || (rep.reviews === 0 && rep.completed === 0)) {
    return <span className="text-xs text-zinc-500">Nuevo en Pídelo</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-600">
      {rep.rating != null && (
        <>
          <Stars value={rep.rating} />
          <b>{rep.rating.toFixed(1)}</b>
          <span className="text-zinc-400">({rep.reviews})</span>
          <span className="text-zinc-300">·</span>
        </>
      )}
      {rep.completed} trabajo{rep.completed === 1 ? "" : "s"} completado{rep.completed === 1 ? "" : "s"}
    </span>
  );
}

export function PlanBadge({ plan }: { plan: string }) {
  if (plan === "ELITE") {
    return <span className="chip bg-gradient-to-r from-amber-200 to-sun-400 py-0.5 text-[11px] text-amber-950">★ Élite</span>;
  }
  if (plan === "PRO") return <span className="chip bg-brand-600 py-0.5 text-[11px] text-white">✓ Pro</span>;
  return null;
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, tone: "bg-zinc-100 text-zinc-700" };
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}

type RequestCardData = {
  id: string;
  title: string;
  description: string;
  category: string;
  kind: string;
  modality: string;
  city: string;
  urgent: boolean;
  status: string;
  budgetMin: number | null;
  budgetMax: number | null;
  createdAt: Date;
  featuredUntil?: Date | null;
  premiumUntil?: Date | null;
  author: { name: string };
  _count: { offers: number };
};

export function RequestCard({ r, matched }: { r: RequestCardData; matched?: boolean }) {
  const cat = categoryOf(r.category);
  const featured = !!r.featuredUntil && r.featuredUntil > new Date();
  const early = !!r.premiumUntil && r.premiumUntil > new Date();
  return (
    <Link
      href={`/solicitudes/${r.id}`}
      className={`card group flex flex-col gap-3 p-5 transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md ${
        featured ? "border-amber-300 bg-gradient-to-b from-sun-100/50 to-white ring-1 ring-amber-200" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {featured && <span className="chip bg-amber-400 text-amber-950">⭐ Destacada</span>}
        {early && <span className="chip bg-brand-600 text-white">⏱ Acceso anticipado</span>}
        {r.urgent && <span className="chip bg-sun-100 text-amber-800">⚡ Urgente</span>}
        {matched && <span className="chip bg-brand-50 text-brand-700">🎯 Para ti</span>}
        <span className="chip bg-zinc-100 text-zinc-700">
          {cat.icon} {cat.label}
        </span>
        {r.status !== "OPEN" && <StatusBadge status={r.status} />}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold leading-snug group-hover:text-brand-700">{r.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{r.description}</p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-1">
        <div className="text-xs text-zinc-500">
          <div>
            {kindLabel(r.kind)} · {modalityLabel(r.modality)} · {r.city}
          </div>
          <div className="mt-0.5">
            {r.author.name} · {timeAgo(r.createdAt)} · {r._count.offers} oferta{r._count.offers === 1 ? "" : "s"}
          </div>
        </div>
        <div className="shrink-0 text-right font-display text-lg font-bold text-zinc-900">
          {budgetLabel(r.budgetMin, r.budgetMax)}
        </div>
      </div>
    </Link>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="text-4xl">🔍</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <div className="max-w-md text-sm text-zinc-600">{children}</div>
    </div>
  );
}
