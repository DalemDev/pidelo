import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { getReputations } from "@/server/queries/reputation";
import { BOOST_COSTS, BUMP_COOLDOWN_HOURS, EXPIRY_WARNING_DAYS, REQUEST_EXPIRY_DAYS, expiresAt, FEATURE_DAYS, STRIKES_LOSE_PRIORITY, isFeatured, offerCost } from "@/domain/policies";
import { EARLY_ACCESS_MINUTES, planOf } from "@/domain/plans";
import { categoryOf, kindLabel, modalityLabel } from "@/domain/catalog";
import { budgetLabel, money, shortDate, timeAgo } from "@/domain/format";
import { cancelRequest, markDelivered, withdrawOffer } from "@/app/actions/requests";
import { confirmCompletion, selectOffer } from "@/app/actions/payments";
import { AUTO_RELEASE_HOURS } from "@/domain/money";
import { Avatar, PlanBadge, ReputationLine, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/form-bits";
import { BoostButton, DisputeForm, OfferForm, ReviewForm } from "./forms";

async function load(id: string) {
  return db.request.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, name: true, city: true, createdAt: true } },
      offers: {
        where: { status: { not: "WITHDRAWN" } },
        orderBy: { createdAt: "asc" },
        include: {
          provider: { select: { id: true, name: true, city: true, strikes: true, plan: true } },
          _count: { select: { messages: true } },
        },
      },
      reviews: { select: { authorId: true } },
      payments: { where: { status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" }, take: 1 },
      disputes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/solicitudes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const r = await db.request.findUnique({ where: { id }, select: { title: true } });
  return { title: r?.title ?? "Solicitud" };
}

export default async function RequestPage({ params, searchParams }: PageProps<"/solicitudes/[id]">) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, getCurrentUser()]);
  const request = await load(id);
  if (!request) notFound();

  const cat = categoryOf(request.category);
  const isAuthor = user?.id === request.author.id;
  const myOffer = user ? request.offers.find((o) => o.providerId === user.id) : undefined;
  const accepted = request.offers.find((o) => o.id === request.acceptedOfferId);
  const isProvider = !!user && accepted?.providerId === user.id;
  const reps = await getReputations([request.author.id, ...request.offers.map((o) => o.providerId)]);
  const alreadyReviewed = !!user && request.reviews.some((r) => r.authorId === user.id);
  const justPublished = sp.publicada === "1" && isAuthor;

  // Ranking de ofertas: la aceptada primero; quienes tienen 3+ advertencias van al final;
  // luego Élite/Pro, mejor calificación y más trabajos completados.
  const rankedOffers = [...request.offers].sort((a, b) => {
    const rank = (o: (typeof request.offers)[number]) => {
      const rep = reps.get(o.providerId);
      return [
        o.status === "ACCEPTED" ? 0 : o.status === "REJECTED" ? 2 : 1,
        o.provider.strikes >= STRIKES_LOSE_PRIORITY ? 1 : 0,
        -planOf(o.provider.plan).priority,
        -(rep?.rating ?? 0),
        -(rep?.completed ?? 0),
        o.createdAt.getTime(),
      ];
    };
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i]! - rb[i]!;
    return 0;
  });

  const viewerPlan = planOf(user?.plan ?? "FREE");
  // El admin supervisa: ve la solicitud pero no oferta.
  const member = user && user.role !== "ADMIN" ? user : null;
  const nowMs = new Date().getTime();
  const earlyLocked = !!request.premiumUntil && request.premiumUntil > new Date() && !viewerPlan.earlyAccess && !isAuthor;
  const earlyMinutesLeft = request.premiumUntil ? Math.max(1, Math.ceil((request.premiumUntil.getTime() - nowMs) / 60_000)) : 0;
  const bumpHoursLeft = Math.ceil(BUMP_COOLDOWN_HOURS - (nowMs - request.bumpedAt.getTime()) / 3600_000);
  const featured = isFeatured(request);
  const expiringSoon = expiresAt(request).getTime() - nowMs < EXPIRY_WARNING_DAYS * 86400_000;
  const payment = request.payments[0];
  const dispute = request.disputes[0];
  const autoReleaseAt = request.deliveredAt ? new Date(request.deliveredAt.getTime() + AUTO_RELEASE_HOURS * 3600_000) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/solicitudes" className="text-sm font-semibold text-zinc-500 hover:text-zinc-800">
        ← Volver a solicitudes
      </Link>

      {justPublished && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="font-display text-lg font-semibold text-emerald-900">🎉 ¡Tu solicitud está publicada!</div>
          <p className="mt-1 text-sm text-emerald-800">
            {request.notifiedCount > 0
              ? `Ya avisamos a ${request.notifiedCount === 1 ? "1 persona que sabe" : `${request.notifiedCount} personas que saben`} de ${cat.label.toLowerCase()}. Te notificaremos en cuanto llegue la primera oferta.`
              : "Aún no hay expertos registrados en esta categoría, pero tu solicitud ya es visible para toda la comunidad."}
          </p>
        </div>
      )}
      {justPublished && request.premiumUntil && request.premiumUntil > new Date() && (
        <p className="mt-2 text-xs text-zinc-500">
          Los expertos Pro y Élite tienen {EARLY_ACCESS_MINUTES} minutos de acceso anticipado; después se abre a todos.
        </p>
      )}
      {justPublished && sp.oculto === "1" && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠️ Ocultamos datos de contacto de tu publicación. Para tu seguridad, el contacto directo se habilita cuando
          aceptas una oferta y el pago queda protegido.
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Columna principal */}
        <div className="space-y-6">
          <article className="card p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={request.status} />
              {featured && <span className="chip bg-amber-400 text-amber-950">⭐ Destacada</span>}
              {request.urgent && <span className="chip bg-sun-100 text-amber-800">⚡ Urgente</span>}
              <span className="chip bg-zinc-100 text-zinc-700">{cat.icon} {cat.label}</span>
              <span className="chip bg-zinc-100 text-zinc-700">{kindLabel(request.kind)}</span>
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight">{request.title}</h1>
            <dl className="mt-5 grid grid-cols-2 gap-4 rounded-xl bg-zinc-50 p-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-zinc-500">Presupuesto</dt>
                <dd className="font-display text-lg font-bold">{budgetLabel(request.budgetMin, request.budgetMax)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Para cuándo</dt>
                <dd className="font-semibold">{request.deadline ? shortDate(request.deadline) : "Flexible"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Modalidad</dt>
                <dd className="font-semibold">{modalityLabel(request.modality)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Ubicación</dt>
                <dd className="font-semibold">{request.city}</dd>
              </div>
            </dl>
            <div className="mt-6 whitespace-pre-line leading-relaxed text-zinc-800">{request.description}</div>
            <div className="mt-6 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
              Publicada {timeAgo(request.createdAt)} · {request.offers.length} oferta{request.offers.length === 1 ? "" : "s"}
            </div>
          </article>

          {/* Ofertas: el autor las ve completas, el resto solo el conteo */}
          {isAuthor && (
            <section>
              <h2 className="font-display text-xl font-bold">Ofertas recibidas ({request.offers.length})</h2>
              {request.status === "OPEN" && request.offers.length > 0 && <ProtectionBox />}
              {request.offers.length === 0 ? (
                <div className="card mt-3 p-6 text-sm text-zinc-600">
                  Aún no hay ofertas. Te enviaremos una notificación en cuanto llegue la primera.
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {rankedOffers.map((o) => (
                    <div
                      key={o.id}
                      id={`oferta-${o.id}`}
                      className={`card scroll-mt-24 p-5 ${o.status === "ACCEPTED" ? "border-emerald-300 ring-2 ring-emerald-100" : o.provider.plan === "ELITE" ? "border-amber-300 bg-gradient-to-b from-sun-100/40 to-white" : ""} ${o.status === "REJECTED" ? "opacity-60" : ""}`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <Link href={`/perfil/${o.provider.id}`}><Avatar name={o.provider.name} /></Link>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <Link href={`/perfil/${o.provider.id}`} className="font-semibold hover:underline">{o.provider.name}</Link>
                            <PlanBadge plan={o.provider.plan} />
                          </div>
                          <div><ReputationLine rep={reps.get(o.providerId)} /></div>
                          <div className="text-xs text-zinc-500">{o.provider.city} · {timeAgo(o.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-display text-2xl font-bold">{money(o.price)}</div>
                          <div className="text-xs text-zinc-500">
                            {o.deliveryDays === 0 ? "Entrega hoy" : `Entrega en ${o.deliveryDays} día${o.deliveryDays === 1 ? "" : "s"}`}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm text-zinc-700">{o.message}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Link href={`/solicitudes/${request.id}/chat/${o.id}`} className="btn-secondary">
                          💬 Chatear{o._count.messages ? ` (${o._count.messages})` : ""}
                        </Link>
                        {request.status === "OPEN" && o.status === "PENDING" && (
                          <form action={selectOffer.bind(null, o.id)}>
                            <SubmitButton pendingText="Preparando pago…">Elegir y pagar {money(o.price)}</SubmitButton>
                          </form>
                        )}
                        {o.status === "ACCEPTED" && (
                          <span className="chip bg-emerald-100 text-emerald-800">
                            {request.status === "AWAITING_PAYMENT" ? "✓ Elegida · esperando tu pago" : "✓ Oferta aceptada"}
                          </span>
                        )}
                        {o.status === "REJECTED" && <span className="chip bg-zinc-100 text-zinc-600">No seleccionada</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Barra lateral */}
        <aside className="space-y-4">
          <div className="card p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Publicado por</div>
            <Link href={`/perfil/${request.author.id}`} className="mt-3 flex items-center gap-3">
              <Avatar name={request.author.name} />
              <div>
                <div className="font-semibold hover:underline">{request.author.name}</div>
                <ReputationLine rep={reps.get(request.author.id)} />
              </div>
            </Link>
          </div>

          {/* Pago protegido */}
          {accepted && request.status === "AWAITING_PAYMENT" && (isAuthor || isProvider) && (
            <div className="card border-amber-200 p-5">
              <div className="font-semibold">💳 Falta el pago</div>
              {isAuthor ? (
                <>
                  <p className="mt-1 text-sm text-zinc-600">
                    {payment?.status === "SUBMITTED"
                      ? "Recibimos tu comprobante; lo estamos verificando."
                      : payment?.status === "REJECTED"
                        ? "No pudimos verificar tu comprobante. Revísalo y vuelve a enviarlo."
                        : `Paga ${money(accepted.price)} por transferencia o DeUna. El proveedor empieza cuando confirmemos el pago.`}
                  </p>
                  {payment && (
                    <Link href={`/pagos/${payment.id}`} className="btn-primary mt-3 w-full">
                      {payment.status === "SUBMITTED" ? "Ver estado del pago" : "Ir a pagar"}
                    </Link>
                  )}
                </>
              ) : (
                <p className="mt-1 text-sm text-zinc-600">
                  🎯 ¡Te eligieron! Esperamos a que el cliente pague. <b>No empieces</b> hasta que el pago quede protegido: te avisaremos.
                </p>
              )}
            </div>
          )}

          {accepted && request.escrow !== "PENDING" && request.escrow !== "NONE" && (
            <div className="card p-5">
              <div className="flex items-center gap-2 font-semibold">🛡️ Pago protegido</div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-zinc-500">Monto pagado</span><b>{money(accepted.price)}</b></div>
                <div className="flex justify-between"><span className="text-zinc-500">Comisión Pídelo ({Math.round(accepted.feeRate * 100)}%)</span><span>−{money(accepted.price * accepted.feeRate)}</span></div>
                <div className="flex justify-between border-t border-zinc-100 pt-1.5"><span className="text-zinc-500">Recibe {accepted.provider.name.split(" ")[0]}</span><b>{money(accepted.price * (1 - accepted.feeRate))}</b></div>
              </div>
              <div
                className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                  request.escrow === "RELEASED"
                    ? "bg-emerald-50 text-emerald-800"
                    : request.escrow === "DISPUTED" || request.escrow === "REFUNDED"
                      ? "bg-rose-50 text-rose-800"
                      : "bg-sky-50 text-sky-800"
                }`}
              >
                {request.escrow === "HELD" &&
                  (isProvider
                    ? "El cliente ya pagó: tu cobro está asegurado. Se libera cuando confirme la entrega."
                    : "Tu dinero está retenido y solo se libera cuando confirmes que recibiste el trabajo.")}
                {request.escrow === "HELD" && request.status === "DELIVERED" && autoReleaseAt && (
                  <span className="mt-1 block text-xs">
                    Se liberará automáticamente el{" "}
                    {autoReleaseAt.toLocaleString("es-EC", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} si
                    nadie reporta un problema.
                  </span>
                )}
                {request.escrow === "DISPUTED" && "⚖️ Pago congelado por una disputa. El equipo de Pídelo está revisando el caso."}
                {request.escrow === "RELEASED" && "✓ Pago liberado al proveedor."}
                {request.escrow === "REFUNDED" && "↩️ El pago se reembolsó al cliente."}
              </div>
              {dispute?.status === "RESOLVED" && (
                <p className="mt-2 text-xs text-zinc-500">
                  Disputa resuelta:{" "}
                  {dispute.resolution === "REFUND"
                    ? "reembolso total"
                    : dispute.resolution === "RELEASE"
                      ? "pago liberado"
                      : `reembolso parcial de ${money(dispute.refundCents / 100)}`}
                  {dispute.adminNote && ` · ${dispute.adminNote}`}
                </p>
              )}

              {(isProvider || isAuthor) && (
                <Link href={`/solicitudes/${request.id}/chat/${accepted.id}`} className="btn-secondary mt-3 w-full">
                  💬 Abrir chat del trabajo
                </Link>
              )}
              {isProvider && request.status === "IN_PROGRESS" && request.escrow === "HELD" && (
                <form action={markDelivered.bind(null, request.id)} className="mt-2">
                  <SubmitButton className="w-full">📦 Marcar como entregado</SubmitButton>
                </form>
              )}
              {isAuthor && request.escrow === "HELD" && (request.status === "IN_PROGRESS" || request.status === "DELIVERED") && (
                <form action={confirmCompletion.bind(null, request.id)} className="mt-2">
                  <SubmitButton className="w-full">
                    {request.status === "DELIVERED" ? "✅ Confirmar y liberar pago" : "✅ Ya recibí el trabajo, liberar pago"}
                  </SubmitButton>
                </form>
              )}
              {(isAuthor || isProvider) && request.escrow === "HELD" && (request.status === "IN_PROGRESS" || request.status === "DELIVERED") && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-center text-zinc-500 hover:text-rose-600">Tengo un problema con este trabajo</summary>
                  <DisputeForm requestId={request.id} />
                </details>
              )}
            </div>
          )}

          {/* Acciones según quién mira */}
          {user?.role === "ADMIN" && (
            <div className="card border-brand-200 bg-brand-50/50 p-5 text-sm">
              <div className="font-semibold">⚙️ Vista de administración</div>
              <p className="mt-1 text-zinc-600">
                Estado: <b>{request.status}</b> · pago: <b>{request.escrow}</b> · {request.offers.length} oferta(s).
              </p>
              <Link href="/admin" className="btn-secondary mt-3 w-full">Ir al panel</Link>
            </div>
          )}
          {!user && request.status === "OPEN" && (
            <div className="card p-5">
              <div className="font-semibold">¿Puedes resolver esto?</div>
              <p className="mt-1 text-sm text-zinc-600">Crea tu cuenta gratis y envía tu oferta en menos de un minuto.</p>
              <Link href={`/ingresar?next=/solicitudes/${request.id}`} className="btn-primary mt-4 w-full">Ingresar para ofertar</Link>
            </div>
          )}

          {member && !isAuthor && request.status === "OPEN" && !myOffer && earlyLocked && (
            <div className="card border-brand-200 bg-brand-50/50 p-5">
              <div className="font-semibold">⏱ Acceso anticipado Pro</div>
              <p className="mt-1 text-sm text-zinc-600">
                Los miembros Pro y Élite pueden ofertar ahora. Tú podrás hacerlo en {earlyMinutesLeft} min.
              </p>
              <Link href="/planes" className="btn-primary mt-4 w-full">Hazte Pro y oferta ya</Link>
            </div>
          )}

          {member && !isAuthor && request.status === "OPEN" && !myOffer && !earlyLocked && (
            <div className="card p-5">
              <div className="font-semibold">Envía tu oferta</div>
              <p className="mt-1 text-sm text-zinc-600">Sé claro con el precio y el tiempo. Las ofertas rápidas y detalladas ganan más.</p>
              <OfferForm
                requestId={request.id}
                suggested={request.budgetMax ?? request.budgetMin ?? undefined}
                cost={offerCost(request.budgetMin, request.budgetMax)}
                credits={member.credits}
                fee={viewerPlan.fee}
                template={viewerPlan.earlyAccess ? member.offerTemplate : null}
              />
            </div>
          )}

          {myOffer && !isProvider && (
            <div className="card p-5">
              <div className="font-semibold">Tu oferta</div>
              <div className="mt-2 font-display text-2xl font-bold">{money(myOffer.price)}</div>
              <div className="text-sm text-zinc-500">
                {myOffer.status === "PENDING" && "Esperando respuesta del cliente"}
                {myOffer.status === "REJECTED" && "El cliente eligió otra oferta"}
              </div>
              <div className="mt-4 flex gap-2">
                <Link href={`/solicitudes/${request.id}/chat/${myOffer.id}`} className="btn-secondary flex-1">💬 Chatear</Link>
                {myOffer.status === "PENDING" && (
                  <form action={withdrawOffer.bind(null, myOffer.id)}>
                    <SubmitButton variant="secondary" pendingText="…">Retirar</SubmitButton>
                  </form>
                )}
              </div>
            </div>
          )}

          {isAuthor && request.status === "OPEN" && (
            <div className="card p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold">🚀 Recibe más ofertas</div>
                <Link href="/creditos" className="text-xs font-semibold text-amber-900">🪙 {user!.credits}</Link>
              </div>
              <div className="mt-3 space-y-2">
                <BoostButton
                  requestId={request.id}
                  kind="FEATURE"
                  label={featured ? `⭐ Extender destacado +${FEATURE_DAYS} días` : `⭐ Destacar ${FEATURE_DAYS} días`}
                  cost={BOOST_COSTS.FEATURE}
                />
                {!request.urgent && <BoostButton requestId={request.id} kind="URGENT" label="⚡ Marcar como urgente" cost={BOOST_COSTS.URGENT} />}
                <BoostButton
                  requestId={request.id}
                  kind="BUMP"
                  label="🔄 Volver a subir"
                  cost={BOOST_COSTS.BUMP}
                  disabledReason={bumpHoursLeft > 0 ? `Disponible en ${bumpHoursLeft} h` : undefined}
                />
              </div>
              {featured && (
                <p className="mt-2 text-xs text-zinc-500">
                  Destacada hasta el {request.featuredUntil!.toLocaleDateString("es-EC", { day: "numeric", month: "short" })}.
                </p>
              )}
              <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${expiringSoon ? "bg-amber-50 text-amber-900" : "bg-zinc-50 text-zinc-600"}`}>
                ⌛ Vence el {expiresAt(request).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" })} si no eliges una oferta.
                Volver a subirla reinicia el plazo de {REQUEST_EXPIRY_DAYS} días.
              </p>
            </div>
          )}

          {isAuthor && request.status === "EXPIRED" && (
            <div className="card p-5">
              <div className="font-semibold">⌛ Esta solicitud venció</div>
              <p className="mt-1 text-sm text-zinc-600">
                Pasaron {REQUEST_EXPIRY_DAYS} días sin elegir una oferta. A quienes ofertaron les devolvimos sus créditos.
              </p>
              <Link href="/publicar" className="btn-primary mt-3 w-full">Publicar de nuevo</Link>
            </div>
          )}

          {isAuthor && (request.status === "OPEN" || (request.status === "AWAITING_PAYMENT" && payment?.status !== "SUBMITTED")) && (
            <form action={cancelRequest.bind(null, request.id)} className="text-center">
              <button className="text-sm text-zinc-500 hover:text-rose-600">Cancelar solicitud</button>
            </form>
          )}

          {request.status === "COMPLETED" && (isAuthor || isProvider) && !alreadyReviewed && (
            <div className="card p-5">
              <div className="font-semibold">Califica a {isAuthor ? accepted!.provider.name : request.author.name}</div>
              <p className="mt-1 text-sm text-zinc-600">Tu calificación ayuda a toda la comunidad.</p>
              <ReviewForm requestId={request.id} />
            </div>
          )}
          {request.status === "COMPLETED" && (isAuthor || isProvider) && alreadyReviewed && (
            <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">⭐ ¡Gracias! Ya calificaste este trabajo.</div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ProtectionBox() {
  return (
    <div className="mt-3 grid gap-2 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm sm:grid-cols-3">
      <div>
        <b className="text-brand-900">🛡️ Tu dinero protegido</b>
        <p className="text-zinc-600">Queda retenido hasta que confirmes que recibiste el trabajo.</p>
      </div>
      <div>
        <b className="text-brand-900">⭐ Reseñas verificadas</b>
        <p className="text-zinc-600">Solo los trabajos pagados en Pídelo cuentan para la reputación.</p>
      </div>
      <div>
        <b className="text-brand-900">🚫 Por fuera no hay garantía</b>
        <p className="text-zinc-600">Si pagas por transferencia directa o en efectivo, no podemos ayudarte.</p>
      </div>
    </div>
  );
}
