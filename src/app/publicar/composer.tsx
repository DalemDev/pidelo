"use client";

import { useActionState, useState, useTransition } from "react";
import { aiDraft, createRequest } from "@/app/actions/requests";
import Link from "next/link";
import { BOOST_COSTS, FEATURE_DAYS } from "@/domain/policies";
import { CATEGORIES, CITIES, KINDS, MODALITIES } from "@/domain/catalog";
import { FormMessage, SubmitButton } from "@/components/form-bits";
import type { Draft } from "@/server/infra/ai/request-draft";

const PROMPTS = [
  "Necesito que alguien me explique contabilidad de costos, tengo examen el lunes",
  "Busco quien me venda 20 camisetas estampadas con logo en Cuenca",
  "Se me dañó la refri y necesito un técnico hoy en Guayaquil",
  "Necesito que alguien revise el contrato de arriendo antes de firmarlo",
];

function isoInDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Fecha local (no UTC): en Ecuador (UTC-5) toISOString adelantaría un día por la noche.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Opciones pagadas con créditos. Nunca se marcan solas: si la IA detecta urgencia, solo lo sugiere.
function BoostOptions({ credits, aiSaysUrgent }: { credits: number; aiSaysUrgent: boolean }) {
  const [urgent, setUrgent] = useState(false);
  const [featured, setFeatured] = useState(false);
  const total = (urgent ? BOOST_COSTS.URGENT : 0) + (featured ? BOOST_COSTS.FEATURE : 0);
  const short = total > credits;

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-sun-100/40 p-3">
      <div className="flex items-center justify-between text-sm">
        <b>Más visibilidad (opcional)</b>
        <Link href="/creditos" className="text-xs font-semibold text-amber-900 hover:underline">🪙 Tienes {credits} créditos</Link>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white/70 p-2.5">
        <input type="checkbox" name="urgent" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-amber-500" />
        <span className="flex-1 text-sm">
          <b>⚡ Urgente · {BOOST_COSTS.URGENT} créditos</b> — aparece primero y avisamos con prioridad.
          {aiSaysUrgent && !urgent && <span className="block text-xs text-amber-800">Parece que lo necesitas pronto: esta opción te ayuda a recibir ofertas más rápido.</span>}
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white/70 p-2.5">
        <input type="checkbox" name="featured" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className="mt-0.5 h-5 w-5 accent-amber-500" />
        <span className="flex-1 text-sm">
          <b>⭐ Destacar {FEATURE_DAYS} días · {BOOST_COSTS.FEATURE} créditos</b> — primera posición y diseño resaltado.
        </span>
      </label>
      {total > 0 && (
        <p className={`text-xs ${short ? "text-rose-600" : "text-zinc-600"}`}>
          Total: {total} créditos.{" "}
          {short && (
            <>
              Te faltan {total - credits}. <Link href="/creditos" className="font-semibold underline">Comprar créditos</Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function Composer({ defaultCity, aiEnabled, credits }: { defaultCity: string; aiEnabled: boolean; credits: number }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [manual, setManual] = useState(false);
  const [aiError, setAiError] = useState<string>();
  const [thinking, startThinking] = useTransition();
  const [state, action] = useActionState(createRequest, undefined);

  function runAssistant() {
    setAiError(undefined);
    startThinking(async () => {
      const result = await aiDraft(text);
      if (result.error) setAiError(result.error);
      else if (result.draft) setDraft(result.draft);
    });
  }

  const showForm = draft || manual;
  // `key` fuerza a React a re-montar el formulario con los valores del nuevo borrador.
  const formKey = draft ? JSON.stringify(draft) : "manual";

  return (
    <div className="mt-8 space-y-6">
      {/* Paso 1: texto libre */}
      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="free-text" className="font-semibold">1. Cuéntanos qué necesitas</label>
          <span className={`chip ${aiEnabled ? "bg-brand-50 text-brand-700" : "bg-zinc-100 text-zinc-600"}`}>
            {aiEnabled ? "✨ IA activa" : "Asistente básico"}
          </span>
        </div>
        <textarea
          id="free-text"
          className="input min-h-32 resize-y text-base"
          placeholder="Ej: necesito alguien que me ayude a entender cómo declarar el IVA de mi negocio, estoy en Quito y lo necesito esta semana, tengo unos $30"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={3000}
        />
        {!text && (
          <div className="mt-3 flex flex-wrap gap-2">
            {PROMPTS.map((p) => (
              <button key={p} type="button" onClick={() => setText(p)} className="chip bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
                {p}
              </button>
            ))}
          </div>
        )}
        {aiError && <p className="mt-3 text-sm text-rose-600">{aiError}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={runAssistant} disabled={thinking || text.trim().length < 10} className="btn-primary">
            {thinking ? "Ordenando tu solicitud…" : draft ? "✨ Volver a generar" : "✨ Ordenar con IA"}
          </button>
          {!showForm && (
            <button type="button" onClick={() => setManual(true)} className="btn-ghost">
              Prefiero llenarlo yo
            </button>
          )}
        </div>
      </div>

      {/* Sugerencias del asistente */}
      {draft && (draft.policyNote || draft.missingInfo.length > 0) && (
        <div className="space-y-3">
          {draft.policyNote && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <b>Importante:</b> {draft.policyNote}
            </div>
          )}
          {draft.missingInfo.length > 0 && (
            <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm">
              <b className="text-brand-900">Para recibir mejores ofertas, agrega:</b>
              <ul className="mt-1 list-inside list-disc text-zinc-700">
                {draft.missingInfo.map((q) => <li key={q}>{q}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Paso 2: formulario estructurado */}
      {showForm && (
        <form key={formKey} action={action} className="card space-y-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">2. Revisa y publica</h2>
            {draft && (
              <span className="text-xs text-zinc-500">
                {draft.source === "ai" ? "Borrador generado con IA" : "Borrador generado automáticamente"} · puedes editar todo
              </span>
            )}
          </div>

          <div>
            <label className="label" htmlFor="title">Título</label>
            <input className="input" id="title" name="title" required maxLength={100} defaultValue={draft?.title ?? text.slice(0, 80)} />
          </div>
          <div>
            <label className="label" htmlFor="description">Descripción</label>
            <textarea className="input min-h-40" id="description" name="description" required defaultValue={draft?.description ?? text} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="category">Categoría</label>
              <select className="input" id="category" name="category" defaultValue={draft?.category ?? "otros"}>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="kind">Tipo de solicitud</label>
              <select className="input" id="kind" name="kind" defaultValue={draft?.kind ?? "RESOLVER"}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label} — {k.hint}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="modality">Modalidad</label>
              <select className="input" id="modality" name="modality" defaultValue={draft?.modality ?? "CUALQUIERA"}>
                {MODALITIES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="city">Ciudad</label>
              <select className="input" id="city" name="city" defaultValue={draft && draft.city !== "Todo Ecuador" ? draft.city : defaultCity}>
                {CITIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="budgetMin">Presupuesto desde (USD)</label>
              <input className="input" id="budgetMin" name="budgetMin" type="number" min={0} step="0.01" placeholder="A convenir" defaultValue={draft?.budgetMin ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="budgetMax">Hasta (USD)</label>
              <input className="input" id="budgetMax" name="budgetMax" type="number" min={0} step="0.01" placeholder="A convenir" defaultValue={draft?.budgetMax ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="deadline">Fecha límite</label>
              <input className="input" id="deadline" name="deadline" type="date" min={isoInDays(0)} defaultValue={draft?.deadlineDays != null ? isoInDays(draft.deadlineDays) : ""} />
            </div>
          </div>

          <BoostOptions credits={credits} aiSaysUrgent={draft?.urgent ?? false} />

          <FormMessage state={state} />
          <div className="flex items-center justify-end gap-3">
            <span className="text-xs text-zinc-500">Publicar es gratis</span>
            <SubmitButton className="px-6" pendingText="Publicando y buscando ayuda…">Publicar y avisar a expertos</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
