// Catálogo del producto: categorías, tipos de solicitud, modalidades, ciudades y estados. Módulo puro.

export const CATEGORIES = [
  { slug: "academico", label: "Tutoría académica", icon: "🎓" },
  { slug: "tecnologia", label: "Tecnología y programación", icon: "💻" },
  { slug: "diseno", label: "Diseño y multimedia", icon: "🎨" },
  { slug: "contabilidad", label: "Contabilidad y auditoría", icon: "📊" },
  { slug: "legal", label: "Trámites y asesoría legal", icon: "⚖️" },
  { slug: "redaccion", label: "Redacción y traducción", icon: "✍️" },
  { slug: "marketing", label: "Marketing y redes", icon: "📣" },
  { slug: "hogar", label: "Hogar y reparaciones", icon: "🔧" },
  { slug: "compras", label: "Compras y encargos", icon: "🛒" },
  { slug: "mandados", label: "Mandados y transporte", icon: "🚚" },
  { slug: "bienestar", label: "Bienestar y acompañamiento", icon: "🤝" },
  { slug: "otros", label: "Otros", icon: "✨" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

export const KINDS = [
  { value: "RESOLVER", label: "Resolver algo", hint: "Un trabajo o problema concreto" },
  { value: "ACOMPANAMIENTO", label: "Acompañamiento", hint: "Asesoría, tutoría o guía" },
  { value: "COMPRA", label: "Busco quien me venda", hint: "Un producto o servicio a comprar" },
  { value: "OTRO", label: "Otro", hint: "Cualquier otra necesidad" },
] as const;

export type Kind = (typeof KINDS)[number]["value"];
export const KIND_VALUES = KINDS.map((k) => k.value) as [Kind, ...Kind[]];

export const MODALITIES = [
  { value: "CUALQUIERA", label: "Remoto o presencial" },
  { value: "REMOTO", label: "Remoto" },
  { value: "PRESENCIAL", label: "Presencial" },
] as const;

export type Modality = (typeof MODALITIES)[number]["value"];
export const MODALITY_VALUES = MODALITIES.map((m) => m.value) as [Modality, ...Modality[]];

export const ALL_ECUADOR = "Todo Ecuador";

export const CITIES = [
  ALL_ECUADOR,
  "Quito",
  "Guayaquil",
  "Cuenca",
  "Santo Domingo",
  "Machala",
  "Manta",
  "Portoviejo",
  "Loja",
  "Ambato",
  "Riobamba",
  "Esmeraldas",
  "Ibarra",
  "Quevedo",
  "Milagro",
  "Latacunga",
  "Babahoyo",
  "Tulcán",
  "Puyo",
  "Tena",
  "Galápagos",
] as const;

export const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  OPEN: { label: "Recibiendo ofertas", tone: "bg-emerald-100 text-emerald-800" },
  AWAITING_PAYMENT: { label: "Esperando pago", tone: "bg-amber-100 text-amber-900" },
  IN_PROGRESS: { label: "En progreso", tone: "bg-sky-100 text-sky-800" },
  DELIVERED: { label: "Entregado", tone: "bg-amber-100 text-amber-800" },
  COMPLETED: { label: "Completado", tone: "bg-zinc-200 text-zinc-700" },
  CANCELLED: { label: "Cancelado", tone: "bg-rose-100 text-rose-800" },
  EXPIRED: { label: "Vencida", tone: "bg-zinc-200 text-zinc-600" },
};

export function categoryOf(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function kindLabel(value: string) {
  return KINDS.find((k) => k.value === value)?.label ?? value;
}

export function modalityLabel(value: string) {
  return MODALITIES.find((m) => m.value === value)?.label ?? value;
}
