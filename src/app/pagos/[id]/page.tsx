import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/session";
import { fmtCents } from "@/domain/money";
import { PAYMENT_INFO } from "@/server/config/payment-info";
import { paymentDeadline } from "@/domain/policies";
import { cancelPayment } from "@/app/actions/payments";
import { SubmitButton } from "@/components/form-bits";
import { ReceiptForm } from "./receipt-form";

export const metadata: Metadata = { title: "Pagar" };

const STATUS: Record<string, { label: string; tone: string; text: string }> = {
  PENDING: { label: "Esperando tu pago", tone: "bg-amber-100 text-amber-900", text: "Transfiere el monto exacto y sube el comprobante." },
  SUBMITTED: { label: "Verificando", tone: "bg-sky-100 text-sky-900", text: "Recibimos tu comprobante. Te avisamos apenas lo confirmemos." },
  CONFIRMED: { label: "Pago protegido", tone: "bg-emerald-100 text-emerald-900", text: "Tu dinero está retenido hasta que confirmes el trabajo." },
  REJECTED: { label: "Revisa tu comprobante", tone: "bg-rose-100 text-rose-900", text: "No pudimos verificarlo. Sube uno nuevo." },
  CANCELLED: { label: "Cancelado", tone: "bg-zinc-100 text-zinc-700", text: "Este pago fue cancelado." },
};

export default async function PaymentPage({ params }: PageProps<"/pagos/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/pagos/${id}`);
  const payment = await db.payment.findUnique({
    where: { id },
    include: { request: { select: { id: true, title: true } } },
  });
  if (!payment || (payment.payerId !== user.id && user.role !== "ADMIN")) notFound();
  const offer = await db.offer.findUniqueOrThrow({ where: { id: payment.offerId }, include: { provider: { select: { name: true } } } });
  const st = STATUS[payment.status]!;
  const canPay = payment.status === "PENDING" || payment.status === "REJECTED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href={`/solicitudes/${payment.request.id}`} className="text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        ← {payment.request.title}
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Pago protegido</h1>
        <span className={`chip ${st.tone}`}>{st.label}</span>
      </div>
      <p className="mt-1 text-zinc-600">{st.text}</p>
      {canPay && (
        <p className="mt-2 text-sm text-amber-800">
          Tienes hasta el{" "}
          <b>{paymentDeadline(payment).toLocaleString("es-EC", { timeZone: "America/Guayaquil", dateStyle: "long", timeStyle: "short" })}</b>{" "}
          para pagar. Si no, la oferta vuelve a competir y tu solicitud recibe ofertas de nuevo.
        </p>
      )}

      <div className="card mt-6 grid gap-4 p-6 sm:grid-cols-3">
        <div>
          <div className="text-sm text-zinc-500">Monto a pagar</div>
          <div className="font-display text-3xl font-bold">{fmtCents(payment.amountCents)}</div>
        </div>
        <div>
          <div className="text-sm text-zinc-500">Código de pago</div>
          <div className="font-mono text-xl font-bold tracking-wider text-brand-700">{payment.code}</div>
        </div>
        <div>
          <div className="text-sm text-zinc-500">Para</div>
          <div className="font-semibold">{offer.provider.name}</div>
        </div>
      </div>

      {payment.status === "REJECTED" && payment.adminNote && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <b>Motivo:</b> {payment.adminNote}
        </div>
      )}

      {canPay && (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="card p-5">
              <div className="font-semibold">Transferencia bancaria</div>
              <dl className="mt-3 space-y-1.5 text-sm">
                {[
                  ["Banco", PAYMENT_INFO.bank],
                  ["Tipo", PAYMENT_INFO.accountType],
                  ["Número", PAYMENT_INFO.accountNumber],
                  ["Titular", PAYMENT_INFO.holder],
                  ["RUC", PAYMENT_INFO.ruc],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-zinc-500">{k}</dt>
                    <dd className="text-right font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="card p-5">
              <div className="font-semibold">DeUna</div>
              <p className="mt-3 text-sm text-zinc-600">
                Paga desde la app DeUna al número <b>{PAYMENT_INFO.deunaPhone}</b> ({PAYMENT_INFO.holder}).
              </p>
              <div className="mt-4 rounded-xl bg-brand-50 p-3 text-sm">
                <b className="text-brand-900">Importante:</b> escribe el código <b className="font-mono">{payment.code}</b> en la
                descripción o concepto del pago.
              </div>
            </div>
          </div>

          <div className="card mt-6 p-6">
            <h2 className="font-semibold">Sube tu comprobante</h2>
            <ReceiptForm paymentId={payment.id} />
          </div>

          {payment.payerId === user.id && (
            <form action={cancelPayment.bind(null, payment.id)} className="mt-4 text-center">
              <SubmitButton variant="secondary" pendingText="…">
                Elegir otra oferta
              </SubmitButton>
            </form>
          )}
        </>
      )}

      {payment.status === "SUBMITTED" && (
        <div className="card mt-6 p-6 text-sm text-zinc-600">
          Enviado {payment.submittedAt?.toLocaleString("es-EC")} · {payment.method === "DEUNA" ? "DeUna" : "Transferencia"}
          {payment.reference && <> · ref. {payment.reference}</>}.{" "}
          <a href={`/api/comprobantes/${payment.id}`} target="_blank" className="font-semibold text-brand-600">
            Ver comprobante
          </a>
        </div>
      )}

      {payment.status === "CONFIRMED" && (
        <Link href={`/solicitudes/${payment.request.id}`} className="btn-primary mt-6">
          Ir al trabajo
        </Link>
      )}

      <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["1. Pagas", "Transfieres a la cuenta de Pídelo con tu código."],
          ["2. Lo retenemos", "El proveedor empieza sabiendo que el pago existe."],
          ["3. Confirmas", "Liberamos el pago cuando recibes el trabajo. Si hay un problema, abres una disputa."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl bg-white/60 p-4">
            <b>{t}</b>
            <p className="text-zinc-600">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
