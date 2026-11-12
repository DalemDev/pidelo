"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AppError } from "@/domain/errors";
import { MessageSchema, OfferSchema, RequestSchema, ReviewSchema } from "@/domain/schemas";
import { requireUser } from "@/server/auth/session";
import { parseInput, runAction, runVoidAction, type FormState } from "@/server/http/action";
import type { Draft } from "@/server/infra/ai/request-draft";
import { sendMessage as sendChatMessage } from "@/server/services/chat";
import { markAllRead } from "@/server/services/notifications";
import * as offers from "@/server/services/offers";
import * as requests from "@/server/services/requests";
import * as reviews from "@/server/services/reviews";

// Adaptadores de formulario → servicios. La lógica de negocio vive en src/server/services.

export async function aiDraft(text: string): Promise<{ draft?: Draft; error?: string }> {
  const actor = await requireUser("/publicar");
  try {
    return { draft: await requests.draftWithAssistant(actor, String(text ?? "")) };
  } catch (error) {
    if (error instanceof AppError) return { error: error.message };
    throw error;
  }
}

export async function createRequest(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser("/publicar");
  let target = "";
  const state = await runAction("createRequest", async () => {
    const input = parseInput(RequestSchema, {
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
    const { request, masked } = await requests.createRequest(actor, input);
    revalidatePath("/solicitudes");
    target = `/solicitudes/${request.id}?publicada=1${masked ? "&oculto=1" : ""}`;
  });
  if (target) redirect(target);
  return state;
}

export async function cancelRequest(requestId: string) {
  const actor = await requireUser();
  await runVoidAction("cancelRequest", () => requests.cancelRequest(actor, requestId));
  revalidatePath(`/solicitudes/${requestId}`);
}

export async function createOffer(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser(`/solicitudes/${requestId}`);
  return runAction("createOffer", async () => {
    const input = parseInput(OfferSchema, {
      price: formData.get("price"),
      deliveryDays: formData.get("deliveryDays"),
      message: formData.get("message"),
    });
    const { warning } = await offers.createOffer(actor, requestId, input, formData.get("saveTemplate") === "on");
    revalidatePath(`/solicitudes/${requestId}`);
    return warning ? { warn: warning } : { ok: "Oferta enviada. Te avisaremos cuando respondan." };
  });
}

export async function withdrawOffer(offerId: string) {
  const actor = await requireUser();
  await runVoidAction("withdrawOffer", async () => {
    const requestId = await offers.withdrawOffer(actor, offerId);
    revalidatePath(`/solicitudes/${requestId}`);
  });
}

export async function markDelivered(requestId: string) {
  const actor = await requireUser();
  await runVoidAction("markDelivered", () => requests.markDelivered(actor, requestId));
  revalidatePath(`/solicitudes/${requestId}`);
}

export async function sendMessage(offerId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  const raw = String(formData.get("body") ?? "").trim();
  if (!raw) return undefined;
  return runAction("sendMessage", async () => {
    const body = parseInput(MessageSchema, raw);
    const { requestId, warning } = await sendChatMessage(actor, offerId, body);
    revalidatePath(`/solicitudes/${requestId}/chat/${offerId}`);
    return warning ? { warn: warning } : { ok: "sent" };
  });
}

export async function leaveReview(requestId: string, _: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireUser();
  return runAction("leaveReview", async () => {
    const input = parseInput(ReviewSchema, { rating: formData.get("rating"), comment: formData.get("comment") ?? "" });
    await reviews.leaveReview(actor, requestId, input);
    revalidatePath(`/solicitudes/${requestId}`);
    return { ok: "Gracias por tu calificación." };
  });
}

export async function markAllNotificationsRead() {
  const actor = await requireUser();
  await markAllRead(actor.id);
  revalidatePath("/", "layout");
}
