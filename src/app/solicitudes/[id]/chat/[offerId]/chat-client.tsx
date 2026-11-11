"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import { sendMessage } from "@/app/actions/requests";

// Refresco periódico del hilo. Para más volumen, reemplazar por SSE o WebSockets (ver docs/ARQUITECTURA.md).
export function AutoRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}

export function ChatComposer({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(sendMessage.bind(null, offerId), undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="space-y-2">
      {(state?.error || state?.warn) && (
        <p role="alert" className={`rounded-xl px-3 py-2 text-sm ${state.error ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-900"}`}>
          {state.error ?? state.warn}
        </p>
      )}
    <form ref={formRef} action={action} className="card flex items-end gap-2 p-2">
      <textarea
        name="body"
        rows={1}
        required
        maxLength={2000}
        placeholder="Escribe un mensaje…"
        aria-label="Mensaje"
        className="max-h-40 min-h-11 flex-1 resize-none rounded-xl px-3 py-2.5 text-[15px] outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <button disabled={pending} className="btn-primary h-11">
        {pending ? "…" : "Enviar"}
      </button>
    </form>
    </div>
  );
}
