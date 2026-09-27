"use client";

import { useActionState, useState } from "react";
import { createOffer, leaveReview } from "@/app/actions/requests";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import Link from "next/link";
import { boostRequest, type BoostKind } from "@/app/actions/billing";
import { openDispute } from "@/app/actions/payments";
import { money } from "@/lib/format";

export function OfferForm({
  requestId,
  suggested,
  cost,
  credits,
  fee,
  template,
}: {
  requestId: string;
  suggested?: number;
  cost: number;
  credits: number;
  fee: number;
  // null = el plan no incluye plantillas.
  template: string | null;
}) {
  const [state, action] = useActionState(createOffer.bind(null, requestId), undefined);
  const [price, setPrice] = useState(suggested ? String(suggested) : "");
  const net = Number(price) > 0 ? Number(price) * (1 - fee) : null;
  const short = credits < cost;

  return (
    <form action={action} className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="price">Tu precio (USD)</label>
          <input className="input" id="price" name="price" type="number" min={1} step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="deliveryDays">Días de entrega</label>
          <input className="input" id="deliveryDays" name="deliveryDays" type="number" min={0} max={365} defaultValue={1} required />
        </div>
      </div>
      {net != null && (
        <p className="text-xs text-zinc-500">
          Recibirás {money(net)} después de la comisión del {Math.round(fee * 100)} %.
          {fee > 0.05 && (
            <>
              {" "}
              <Link href="/planes" className="font-semibold text-brand-600">Paga menos comisión</Link>
            </>
          )}
        </p>
      )}
      <div>
        <label className="label" htmlFor="message">Mensaje</label>
        <textarea
          className="input min-h-28"
          id="message"
          name="message"
          required
          defaultValue={template ?? ""}
          placeholder="Hola, tengo experiencia en… Puedo ayudarte así…"
        />
        {template !== null ? (
          <label className="mt-1.5 flex items-center gap-2 text-xs text-zinc-600">
            <input type="checkbox" name="saveTemplate" className="accent-brand-600" /> Guardar este mensaje como mi plantilla
          </label>
        ) : (
          <p className="mt-1.5 text-xs text-zinc-400">✨ Con Pro puedes guardar una plantilla de oferta.</p>
        )}
      </div>
      <ul className="space-y-1 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">
        <li>✓ <b>Cobro asegurado:</b> el cliente paga antes de que empieces.</li>
        <li>✓ Solo los trabajos pagados en Pídelo suman reseñas y te suben en el ranking.</li>
        <li>✗ No compartas teléfono ni redes: se ocultan y cuentan como advertencia.</li>
      </ul>
      <FormMessage state={state} />
      {short ? (
        <div className="space-y-2 text-center">
          <p className="text-sm text-rose-600">
            Ofertar aquí cuesta 🪙 {cost} y tienes {credits}.
          </p>
          <Link href="/creditos" className="btn-primary w-full">Comprar créditos</Link>
        </div>
      ) : (
        <SubmitButton className="w-full">Enviar oferta · 🪙 {cost}</SubmitButton>
      )}
      <p className="text-center text-[11px] text-zinc-400">Si el cliente cancela la solicitud, te devolvemos los créditos.</p>
    </form>
  );
}

export function BoostButton({
  requestId,
  kind,
  label,
  cost,
  disabledReason,
}: {
  requestId: string;
  kind: BoostKind;
  label: string;
  cost: number;
  disabledReason?: string;
}) {
  const [state, action, pending] = useActionState(() => boostRequest(requestId, kind), undefined);
  return (
    <form action={action}>
      <button
        disabled={pending || !!disabledReason}
        className="btn-secondary w-full justify-between"
        title={disabledReason}
      >
        <span>{pending ? "Aplicando…" : label}</span>
        <span className="text-xs text-amber-900">{disabledReason ?? `🪙 ${cost}`}</span>
      </button>
      {state?.error && (
        <p className="mt-1 text-xs text-rose-600">
          {state.error} <Link href="/creditos" className="font-semibold underline">Comprar</Link>
        </p>
      )}
      {state?.ok && <p className="mt-1 text-xs text-emerald-700">{state.ok}</p>}
    </form>
  );
}

export function ReviewForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(leaveReview.bind(null, requestId), undefined);
  const [rating, setRating] = useState(0);
  if (state?.ok) return <FormMessage state={state} />;

  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1 text-3xl" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
            onClick={() => setRating(n)}
            className={n <= rating ? "text-sun-500" : "text-zinc-300 hover:text-sun-400"}
          >
            ★
          </button>
        ))}
      </div>
      <textarea className="input min-h-20" name="comment" placeholder="¿Cómo fue tu experiencia? (opcional)" />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Enviar calificación</SubmitButton>
    </form>
  );
}

export function DisputeForm({ requestId }: { requestId: string }) {
  const [state, action] = useActionState(openDispute.bind(null, requestId), undefined);
  if (state?.ok) return <FormMessage state={state} />;
  return (
    <form action={action} className="mt-3 space-y-2">
      <p className="text-xs text-zinc-500">
        El pago queda congelado (no se libera ni se reembolsa) hasta que el equipo de Pídelo revise el chat y la evidencia de ambas partes.
      </p>
      <textarea className="input min-h-24" name="reason" required minLength={20} placeholder="¿Qué pasó? Ej: no entregó a tiempo, el trabajo no es lo acordado…" />
      <FormMessage state={state} />
      <SubmitButton variant="secondary" className="w-full" pendingText="Abriendo…">
        Abrir disputa
      </SubmitButton>
    </form>
  );
}
