"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { runAction, runVoidAction, type FormState } from "@/server/http/action";
import * as billing from "@/server/services/billing";
import * as requests from "@/server/services/requests";

// Adaptadores de compras, planes e impulsos de solicitudes.

export type PayMethod = billing.PayMethod;
export type BoostKind = requests.BoostKind;

export async function buyCredits(packId: string, method: PayMethod = "CARD"): Promise<FormState> {
  const actor = await requireUser("/creditos");
  return runAction("buyCredits", async () => {
    const pack = await billing.buyCredits(actor, packId, method);
    revalidatePath("/", "layout");
    return { ok: `Listo: sumaste ${pack.credits} créditos.` };
  });
}

export async function subscribePlan(planId: string, method: PayMethod = "CARD"): Promise<FormState> {
  const actor = await requireUser("/planes");
  let target = "";
  const state = await runAction("subscribePlan", async () => {
    const quote = await billing.subscribePlan(actor, planId, method);
    revalidatePath("/", "layout");
    // La tarjeta del plan cambia tras aplicar el cambio, así que el resultado se muestra a nivel de página.
    const params = new URLSearchParams({ cambio: quote.kind.toLowerCase(), plan: planId });
    if (quote.kind === "NEW" || quote.kind === "UPGRADE") {
      params.set("monto", String(quote.chargeCents));
      params.set("creditos", String(quote.credits));
    }
    target = `/planes?${params}`;
  });
  if (target) redirect(target);
  return state;
}

export async function setAutoRenew(autoRenew: boolean) {
  const actor = await requireUser("/planes");
  await runVoidAction("setAutoRenew", () => billing.setAutoRenew(actor, autoRenew === true));
  revalidatePath("/planes");
}

export async function cancelPlanChange() {
  const actor = await requireUser("/planes");
  await runVoidAction("cancelPlanChange", () => billing.cancelPlanChange(actor));
  revalidatePath("/planes");
}

export async function boostRequest(requestId: string, kind: BoostKind): Promise<FormState> {
  const actor = await requireUser();
  return runAction("boostRequest", async () => {
    await requests.boostRequest(actor, requestId, kind);
    revalidatePath(`/solicitudes/${requestId}`);
    revalidatePath("/solicitudes");
    return { ok: "Listo: tu solicitud ganó visibilidad." };
  });
}
