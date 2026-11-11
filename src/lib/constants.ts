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

// Los datos de contacto solo se desbloquean en el hilo de la oferta aceptada con el pago ya protegido.
export function contactUnlocked(request: { acceptedOfferId: string | null; escrow: string }, offerId: string) {
  return request.acceptedOfferId === offerId && ["HELD", "DISPUTED", "RELEASED"].includes(request.escrow);
}

// Anti-fuga: con 3 advertencias se pierde prioridad (sin match instantáneo, ofertas al final); con 5, suspensión.
export const STRIKES_LOSE_PRIORITY = 3;
export const STRIKES_SUSPEND = 5;

// ---------------------------------------------------------------------------
// Monetización

export type PlanId = "FREE" | "PRO" | "ELITE";

export const PLANS: Record<
  PlanId,
  { id: PlanId; label: string; price: number; fee: number; monthlyCredits: number; earlyAccess: boolean; priority: number; perks: string[] }
> = {
  FREE: {
    id: "FREE",
    label: "Gratis",
    price: 0,
    fee: 0.1,
    monthlyCredits: 5,
    earlyAccess: false,
    priority: 0,
    perks: ["5 créditos gratis cada mes", "Comisión del 10 %", "Avisos de solicitudes de tus categorías"],
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    price: 4.99,
    fee: 0.07,
    monthlyCredits: 30,
    earlyAccess: true,
    priority: 1,
    perks: [
      "30 créditos cada mes",
      "Comisión del 7 %",
      "Acceso anticipado: ves y ofertas 10 min antes",
      "Tus ofertas aparecen arriba",
      "Insignia Pro en tu perfil",
      "Plantilla de oferta reutilizable",
    ],
  },
  ELITE: {
    id: "ELITE",
    label: "Élite",
    price: 12.99,
    fee: 0.05,
    monthlyCredits: 80,
    earlyAccess: true,
    priority: 2,
    perks: [
      "80 créditos cada mes",
      "Comisión del 5 %",
      "Acceso anticipado + avisos urgentes primero",
      "Tus ofertas arriba y destacadas",
      "Insignia Élite en tu perfil",
      "Plantilla de oferta reutilizable",
      "Estadísticas: tasa de aceptación, tiempo de respuesta, ingresos",
    ],
  },
};

export function planOf(plan: string) {
  return PLANS[(plan in PLANS ? plan : "FREE") as PlanId];
}

// Minutos de ventaja que tienen Pro/Élite sobre el plan gratis en solicitudes nuevas.
export const EARLY_ACCESS_MINUTES = 10;

// 1 crédito ≈ $0.20; los paquetes grandes traen bonificación.
export const CREDIT_PACKS = [
  { id: "p10", credits: 10, price: 2, bonus: "" },
  { id: "p30", credits: 30, price: 5, bonus: "+20 %" },
  { id: "p75", credits: 75, price: 10, bonus: "+50 %" },
] as const;

export const BOOST_COSTS = { FEATURE: 3, URGENT: 5, BUMP: 2 } as const;
export const FEATURE_DAYS = 3;
export const BUMP_COOLDOWN_HOURS = 24;

// Ofertar cuesta más en solicitudes de mayor presupuesto.
export function offerCost(budgetMin: number | null, budgetMax: number | null) {
  const budget = budgetMax ?? budgetMin;
  if (budget == null || budget < 20) return 1;
  if (budget < 100) return 2;
  return 3;
}

export function isFeatured(r: { featuredUntil: Date | null }) {
  return !!r.featuredUntil && r.featuredUntil > new Date();
}

// Una solicitud abierta sin actividad (sin elegir oferta ni volver a subirla) vence a los 14 días
// y devuelve los créditos a quienes ofertaron. El recordatorio sale 2 días antes.
export const REQUEST_EXPIRY_DAYS = 14;
export const EXPIRY_WARNING_DAYS = 2;

// Plazo para pagar una oferta elegida. Si vence sin comprobante, la oferta vuelve a competir y la
// solicitud se reabre: así ni el cliente ni el proveedor quedan trabados esperando un pago que no llega.
export const PAYMENT_DEADLINE_HOURS = 48;

/** Fecha límite de un pago pendiente: cuenta desde que se eligió la oferta o desde el último comprobante enviado. */
export function paymentDeadline(p: { createdAt: Date; submittedAt: Date | null }) {
  return new Date((p.submittedAt ?? p.createdAt).getTime() + PAYMENT_DEADLINE_HOURS * 3600_000);
}

export function expiresAt(r: { bumpedAt: Date }) {
  return new Date(r.bumpedAt.getTime() + REQUEST_EXPIRY_DAYS * 86400_000);
}
