import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/session";
import { money } from "@/domain/format";
import { contactUnlocked } from "@/domain/policies";
import { Avatar } from "@/components/ui";
import { ChatComposer, AutoRefresh } from "./chat-client";

export const metadata: Metadata = { title: "Chat" };

export default async function ChatPage({ params }: PageProps<"/solicitudes/[id]/chat/[offerId]">) {
  const { id, offerId } = await params;
  const user = await requireUser(`/solicitudes/${id}/chat/${offerId}`);

  const offer = await db.offer.findUnique({
    where: { id: offerId },
    include: {
      provider: { select: { id: true, name: true } },
      request: {
        select: {
          id: true,
          title: true,
          authorId: true,
          acceptedOfferId: true,
          escrow: true,
          author: { select: { id: true, name: true } },
        },
      },
      // Últimos 200 mensajes: el chat se refresca seguido y no debe recargar historiales enormes.
      messages: { orderBy: { createdAt: "desc" }, take: 200, include: { sender: { select: { id: true, name: true } } } },
    },
  });
  // Solo quien pidió y quien ofertó pueden ver la conversación.
  if (!offer || offer.request.id !== id || ![offer.providerId, offer.request.authorId].includes(user.id)) notFound();

  const other = user.id === offer.providerId ? offer.request.author : offer.provider;
  const unlocked = contactUnlocked(offer.request, offer.id);

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-3xl flex-col px-4 py-6">
      <AutoRefresh />
      <div className="card flex items-center gap-3 p-4">
        <Link href={`/solicitudes/${id}`} className="btn-ghost px-2" aria-label="Volver">←</Link>
        <Avatar name={other.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{other.name}</div>
          <Link href={`/solicitudes/${id}`} className="block truncate text-xs text-zinc-500 hover:underline">
            {offer.request.title} · oferta de {money(offer.price)}
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-col-reverse overflow-y-auto py-4">
        {/* flex-col-reverse mantiene el scroll pegado al último mensaje */}
        <div className="space-y-2">
          {unlocked ? (
            <div className="mx-auto max-w-md rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-800">
              🛡️ Pago protegido. Ya pueden compartir datos para coordinar el trabajo. Nunca compartas contraseñas.
            </div>
          ) : (
            <div className="mx-auto max-w-md rounded-xl bg-zinc-100 px-3 py-2 text-center text-xs text-zinc-600">
              🔒 Teléfonos, correos y redes se desbloquean cuando se acepta la oferta y el pago queda protegido. Pagar por
              fuera = sin garantía ni reseñas. Los intentos cuentan como advertencia.
            </div>
          )}
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm">
              <div className="mb-1 text-xs font-semibold text-brand-700">Oferta de {offer.provider.name}</div>
              <div className="whitespace-pre-line">{offer.message}</div>
            </div>
          </div>
          {[...offer.messages].reverse().map((m) => {
            const mine = m.senderId === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm ${
                    mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md border border-zinc-200 bg-white"
                  }`}
                >
                  {m.body}
                  <div className={`mt-1 text-[10px] ${mine ? "text-brand-100" : "text-zinc-400"}`}>
                    {m.createdAt.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ChatComposer offerId={offerId} />
    </div>
  );
}
