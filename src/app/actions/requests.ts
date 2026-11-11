"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { ADMIN_BLOCKED, getCurrentUser, isAdmin, requireUser } from "@/server/auth/session";
import { draftRequest, type Draft } from "@/server/infra/ai/request-draft";
import { BOOST_COSTS, FEATURE_DAYS, contactUnlocked, offerCost } from "@/domain/policies";
import { CATEGORY_SLUGS, CITIES, KIND_VALUES, MODALITY_VALUES } from "@/domain/catalog";
import { planOf } from "@/domain/plans";
import { InsufficientCredits, grantCredits, spendCredits } from "@/server/services/credits";
import { notify, notifyMatchingProviders } from "@/server/services/matching";
import { money } from "@/domain/format";
import {
  isSuspended,
  recordViolation,
  screenText,
  suspendedMessage,
  warningText,
  type ScreenResult,
} from "@/server/services/moderation";
import type { FormState } from "./auth";

// ---------------------------------------------------------------------------
// Publicar

export async function aiDraft(text: string): Promise<{ draft?: Draft; error?: string }> {
  const current = await getCurrentUser();
  if (!current) return { error: "Inicia sesión para usar el asistente" };
  if (isAdmin(current)) return { error: ADMIN_BLOCKED };
  const clean = text.trim();
  if (clean.length < 10) return { error: "Cuéntanos un poco más (al menos 10 caracteres)" };
  if (clean.length > 3000) return { error: "El texto es muy largo (máximo 3000 caracteres)" };
  return { draft: await draftRequest(clean) };
}

const optionalMoney = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().min(0).max(100000).nullable(),
);

const RequestSchema = z
  .object({
    title: z.string().trim().min(8, "El título es muy corto").max(100),
    description: z.string().trim().min(20, "Describe un poco más lo que necesitas").max(5000),
    category: z.enum(CATEGORY_SLUGS),
    kind: z.enum(KIND_VALUES),
    modality: z.enum(MODALITY_VALUES),
    city: z.enum(CITIES),
    urgent: z.boolean(),
    featured: z.boolean(),
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    deadline: z.preprocess((v) => (v ? new Date(`${v}T23:59:00-05:00`) : null), z.date().nullable()),
  })
  .refine((d) => d.budgetMin == null || d.budgetMax == null || d.budgetMin <= d.budgetMax, {
    message: "El presupuesto mínimo no puede ser mayor que el máximo",
  });

export async function createRequest(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/publicar");
  if (isAdmin(user)) return { error: ADMIN_BLOCKED };
  const parsed = RequestSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    kind: formData.get("kind"),
    modality: formData.get("modality"),
    city: formData.get("city"),
    urgent: formData.get("urgent") === "on",
    featured: formData.get("featured") === "on",
    budgetMin: formData.get("budgetMin"),
    budgetMax: formData.get("budgetMax"),
    deadline: formData.get("deadline"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  if (isSuspended(user)) return { error: suspendedMessage(user.suspendedUntil!) };

  // Las publicaciones son públicas: nunca deben llevar datos de contacto.
  const [title, description] = await Promise.all([screenText(parsed.data.title), screenText(parsed.data.description)]);
  const flagged = [title, description].find((r) => r.blocked) ?? [title, description].find((r) => r.masked);
  if (flagged) {
    const strikes = await recordViolation(user.id, "REQUEST", `${parsed.data.title}\n\n${parsed.data.description}`, flagged);
    if (flagged.blocked) return { error: warningText(flagged, strikes) };
  }

  // Publicar es gratis; "urgente" y "destacar" se pagan con créditos.
  const { featured, ...fields } = parsed.data;
  const boosts = [
    fields.urgent && { cost: BOOST_COSTS.URGENT, reason: "URGENT", label: "Marcar como urgente" },
    featured && { cost: BOOST_COSTS.FEATURE, reason: "FEATURE", label: `Destacar ${FEATURE_DAYS} días` },
  ].filter((b) => !!b);

  let request;
  try {
    request = await db.$transaction(async (tx) => {
      for (const b of boosts) await spendCredits(tx, user.id, b.cost, b.reason, `${b.label} · ${title.text}`);
      return tx.request.create({
        data: {
          ...fields,
          title: title.text,
          description: description.text,
          featuredUntil: featured ? new Date(Date.now() + FEATURE_DAYS * 86400_000) : null,
          authorId: user.id,
        },
      });
    });
  } catch (e) {
    if (e instanceof InsufficientCredits) {
      return { error: `${e.message} Quita las opciones pagadas o compra créditos.` };
    }
    throw e;
  }
  await notifyMatchingProviders({ ...request, authorId: user.id });
  revalidatePath("/solicitudes");
  redirect(`/solicitudes/${request.id}?publicada=1${flagged ? "&oculto=1" : ""}`);
}

export async function cancelRequest(requestId: string) {
  const user = await requireUser();
  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.authorId !== user.id) return;
  if (request.status === "AWAITING_PAYMENT") {
    const submitted = await db.payment.count({ where: { requestId, status: { in: ["SUBMITTED", "CONFIRMED"] } } });
    if (submitted) return; // ya pagó: debe resolverse por disputa, no cancelando
  } else if (request.status !== "OPEN") return;

  const pending = await db.offer.findMany({ where: { requestId, status: { in: ["PENDING", "ACCEPTED"] } } });
  await db.$transaction(async (tx) => {
    await tx.request.update({ where: { id: requestId }, data: { status: "CANCELLED", escrow: "NONE" } });
    await tx.offer.updateMany({ where: { requestId, status: { in: ["PENDING", "ACCEPTED"] } }, data: { status: "REJECTED" } });
    await tx.payment.updateMany({ where: { requestId, status: { in: ["PENDING", "REJECTED"] } }, data: { status: "CANCELLED" } });
    // Si el cliente cancela sin elegir, quienes ofertaron recuperan sus créditos.
    for (const o of pending) {
      if (o.creditsSpent > 0) {
        await grantCredits(tx, o.providerId, o.creditsSpent, "REFUND", `Devolución: solicitud cancelada · ${request.title}`);
      }
    }
  });
  for (const o of pending) {
    await notify(o.providerId, "↩️ Solicitud cancelada", `Te devolvimos ${o.creditsSpent} crédito(s) · ${request.title}`, "/creditos");
  }
  revalidatePath(`/solicitudes/${requestId}`);
}

// ---------------------------------------------------------------------------
// Ofertas

const OfferSchema = z.object({
  price: z.coerce.number().min(1, "El precio mínimo es $1").max(100000),
  deliveryDays: z.coerce.number().int().min(0).max(365),
  message: z.string().trim().min(15, "Cuéntale por qué eres la persona indicada").max(2000),
});

export async function createOffer(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser(`/solicitudes/${requestId}`);
  if (isAdmin(user)) return { error: ADMIN_BLOCKED };
  const parsed = OfferSchema.safeParse({
    price: formData.get("price"),
    deliveryDays: formData.get("deliveryDays"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const request = await db.request.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "OPEN") return { error: "Esta solicitud ya no recibe ofertas" };
  if (request.authorId === user.id) return { error: "No puedes ofertar en tu propia solicitud" };

  const existing = await db.offer.findUnique({
    where: { requestId_providerId: { requestId, providerId: user.id } },
  });
  if (existing && existing.status !== "WITHDRAWN") return { error: "Ya enviaste una oferta" };
  if (isSuspended(user)) return { error: suspendedMessage(user.suspendedUntil!) };
  if (request.premiumUntil && request.premiumUntil > new Date() && !planOf(user.plan).earlyAccess) {
    return { error: "Esta solicitud está en acceso anticipado para Pro y Élite. Podrás ofertar en unos minutos." };
  }

  const screened = await screenText(parsed.data.message);
  let strikes = 0;
  if (screened.blocked || screened.masked) {
    strikes = await recordViolation(user.id, "OFFER", parsed.data.message, screened);
    if (screened.blocked) return { error: warningText(screened, strikes) };
  }
  const cost = offerCost(request.budgetMin, request.budgetMax);
  const data = { ...parsed.data, message: screened.text, creditsSpent: cost };

  let offer;
  try {
    offer = await db.$transaction(async (tx) => {
      await spendCredits(tx, user.id, cost, "OFFER", `Oferta · ${request.title}`);
      return existing
        ? tx.offer.update({ where: { id: existing.id }, data: { ...data, status: "PENDING" } })
        : tx.offer.create({ data: { ...data, requestId, providerId: user.id } });
    });
  } catch (e) {
    if (e instanceof InsufficientCredits) return { error: `${e.message} Compra créditos o mejora tu plan para ofertar.` };
    throw e;
  }

  // Beneficio Pro/Élite: guardar el mensaje como plantilla para próximas ofertas.
  if (formData.get("saveTemplate") === "on" && planOf(user.plan).earlyAccess) {
    await db.user.update({ where: { id: user.id }, data: { offerTemplate: screened.text } });
  }

  await notify(
    request.authorId,
    `💬 Nueva oferta de ${user.name}`,
    `${money(offer.price)} · ${request.title}`,
    `/solicitudes/${requestId}#oferta-${offer.id}`,
  );
  revalidatePath(`/solicitudes/${requestId}`);
  if (screened.masked) return { warn: warningText(screened, strikes) };
  return { ok: "¡Oferta enviada! Te avisaremos cuando respondan." };
}

export async function withdrawOffer(offerId: string) {
  const user = await requireUser();
  const offer = await db.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.providerId !== user.id || offer.status !== "PENDING") return;
  await db.offer.update({ where: { id: offerId }, data: { status: "WITHDRAWN" } });
  revalidatePath(`/solicitudes/${offer.requestId}`);
}

export async function markDelivered(requestId: string) {
  const user = await requireUser();
  const request = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: true } });
  if (!request || request.status !== "IN_PROGRESS" || request.acceptedOffer?.providerId !== user.id) return;
  await db.request.update({ where: { id: requestId }, data: { status: "DELIVERED", deliveredAt: new Date() } });
  await notify(
    request.authorId,
    "📦 Marcaron tu solicitud como entregada",
    `Confirma o reporta un problema en 72 h; si no, el pago se libera solo · ${request.title}`,
    `/solicitudes/${requestId}`,
  );
  revalidatePath(`/solicitudes/${requestId}`);
}

// ---------------------------------------------------------------------------
// Chat y reseñas

async function loadThread(offerId: string, userId: string) {
  const offer = await db.offer.findUnique({ where: { id: offerId }, include: { request: true } });
  if (!offer) return null;
  const participants = [offer.providerId, offer.request.authorId];
  return participants.includes(userId) ? offer : null;
}

export async function sendMessage(offerId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return undefined;
  if (body.length > 2000) return { error: "Mensaje muy largo" };

  const offer = await loadThread(offerId, user.id);
  if (!offer) return { error: "No tienes acceso a esta conversación" };
  if (isSuspended(user)) return { error: suspendedMessage(user.suspendedUntil!) };

  // Antes del pago protegido se filtran contactos; después pueden coordinar libremente.
  let screened: ScreenResult = { text: body, masked: false, blocked: false, reasons: [] };
  let strikes = 0;
  if (!contactUnlocked(offer.request, offer.id)) {
    screened = await screenText(body);
    if (screened.blocked || screened.masked) {
      strikes = await recordViolation(user.id, "CHAT", body, screened);
      if (screened.blocked) return { error: warningText(screened, strikes) };
    }
  }

  await db.message.create({ data: { offerId, senderId: user.id, body: screened.text, masked: screened.masked } });
  const recipient = user.id === offer.providerId ? offer.request.authorId : offer.providerId;
  await notify(recipient, `✉️ Mensaje de ${user.name}`, screened.text.slice(0, 120), `/solicitudes/${offer.requestId}/chat/${offerId}`);
  revalidatePath(`/solicitudes/${offer.requestId}/chat/${offerId}`);
  if (screened.masked) return { warn: warningText(screened, strikes) };
  return { ok: "sent" };
}

const ReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Elige una calificación").max(5),
  comment: z.string().trim().max(1000),
});

export async function leaveReview(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ReviewSchema.safeParse({ rating: formData.get("rating"), comment: formData.get("comment") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };

  const request = await db.request.findUnique({ where: { id: requestId }, include: { acceptedOffer: true } });
  if (!request || request.status !== "COMPLETED" || !request.acceptedOffer) {
    return { error: "Solo puedes calificar trabajos completados" };
  }
  const providerId = request.acceptedOffer.providerId;
  let targetId: string;
  if (user.id === request.authorId) targetId = providerId;
  else if (user.id === providerId) targetId = request.authorId;
  else return { error: "No participaste en este trabajo" };

  const already = await db.review.findUnique({ where: { requestId_authorId: { requestId, authorId: user.id } } });
  if (already) return { error: "Ya calificaste este trabajo" };

  await db.review.create({ data: { ...parsed.data, requestId, authorId: user.id, targetId } });
  await notify(targetId, `⭐ ${user.name} te calificó con ${parsed.data.rating}/5`, request.title, `/perfil/${targetId}`);
  revalidatePath(`/solicitudes/${requestId}`);
  return { ok: "¡Gracias por tu calificación!" };
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, read: false, visibleAt: { lte: new Date() } }, data: { read: true } });
  revalidatePath("/", "layout");
}
