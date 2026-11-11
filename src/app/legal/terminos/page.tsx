import type { Metadata } from "next";
import Link from "next/link";
import { AUTO_RELEASE_HOURS, MIN_PAYOUT_CENTS, fmtCents } from "@/domain/money";
import { PLANS } from "@/domain/plans";
import { PAYMENT_DEADLINE_HOURS, REQUEST_EXPIRY_DAYS, STRIKES_LOSE_PRIORITY, STRIKES_SUSPEND, SUSPENSION_DAYS } from "@/domain/policies";
import { LEGAL } from "@/server/config/legal";

export const metadata: Metadata = { title: "Términos y condiciones" };

const pct = (n: number) => `${Math.round(n * 100)} %`;

export default function TermsPage() {
  return (
    <>
      <h1>Términos y condiciones</h1>
      <p>
        Estos términos regulan el uso de Pídelo, servicio operado por <b>{LEGAL.companyName}</b>, RUC {LEGAL.ruc}, con domicilio en{" "}
        {LEGAL.address}. Al crear una cuenta aceptas estos términos y la <Link href="/legal/privacidad">política de privacidad</Link>.
      </p>

      <h2>1. Qué es Pídelo</h2>
      <p>
        Pídelo es una plataforma que conecta a personas que publican una necesidad (clientes) con personas que ofrecen resolverla
        (proveedores). Pídelo no presta los servicios publicados ni es parte del acuerdo entre cliente y proveedor: actúa como
        intermediario y custodia el pago hasta que el trabajo se confirma.
      </p>

      <h2>2. Cuenta</h2>
      <ul>
        <li>Debes ser mayor de 18 años y dar datos verdaderos.</li>
        <li>Eres responsable de mantener tu contraseña en secreto y de la actividad de tu cuenta.</li>
        <li>Puedes eliminar tu cuenta en cualquier momento desde <Link href="/cuenta">Mi cuenta</Link>, salvo que tengas trabajos o dinero pendientes.</li>
      </ul>

      <h2>3. Publicaciones y ofertas</h2>
      <ul>
        <li>Publicar una necesidad es gratis. Las opciones de visibilidad (urgente, destacar, volver a subir) se pagan con créditos.</li>
        <li>Enviar una oferta cuesta créditos según el presupuesto. Se devuelven si el cliente cancela o si la solicitud vence sin elegir oferta.</li>
        <li>Una solicitud sin actividad vence a los {REQUEST_EXPIRY_DAYS} días.</li>
        <li>
          Los trabajos académicos se ofrecen como tutoría o acompañamiento. No está permitido pedir ni ofrecer que otra persona haga
          tareas, exámenes o trabajos de grado en nombre de quien los presenta.
        </li>
        <li>
          Está prohibido publicar contenido ilegal, engañoso, ofensivo o que infrinja derechos de terceros, así como ofrecer documentos
          falsos, acceso a cuentas ajenas, sustancias o bienes prohibidos.
        </li>
      </ul>

      <h2>4. Pago protegido</h2>
      <ul>
        <li>
          Al elegir una oferta, el cliente tiene {PAYMENT_DEADLINE_HOURS} horas para pagar por transferencia o DeUna y subir el
          comprobante. Si no lo hace, la solicitud vuelve a recibir ofertas.
        </li>
        <li>El dinero queda retenido por Pídelo hasta que el cliente confirma el trabajo.</li>
        <li>
          Si el cliente no confirma ni reporta un problema dentro de {AUTO_RELEASE_HOURS} horas desde la entrega, el pago se libera al
          proveedor.
        </li>
        <li>
          Si hay un problema, cualquiera de las partes puede abrir una disputa: el pago queda congelado y el equipo de Pídelo decide un
          reembolso total, parcial o la liberación, con base en la evidencia de la conversación y la entrega.
        </li>
        <li>Los pagos hechos por fuera de la plataforma no tienen garantía, reseñas ni intervención de Pídelo.</li>
      </ul>

      <h2>5. Comisiones, créditos y planes</h2>
      <ul>
        <li>
          Pídelo cobra al proveedor una comisión sobre cada pago liberado: {pct(PLANS.FREE.fee)} en el plan Gratis, {pct(PLANS.PRO.fee)} en
          Pro y {pct(PLANS.ELITE.fee)} en Élite.
        </li>
        <li>
          Los planes Pro (${PLANS.PRO.price.toFixed(2)}/mes) y Élite (${PLANS.ELITE.price.toFixed(2)}/mes) se renuevan cada 30 días hasta que
          se cancele la renovación. Al subir de plan se cobra la diferencia proporcional; al bajar, el cambio se aplica en la siguiente renovación.
        </li>
        <li>Los créditos no son dinero, no se reembolsan en efectivo y no vencen mientras la cuenta esté activa.</li>
        <li>Los precios mostrados incluyen los impuestos aplicables. Pídelo emite comprobante electrónico por los valores que cobra.</li>
      </ul>

      <h2>6. Billetera y retiros</h2>
      <ul>
        <li>Lo que ganas y los reembolsos que recibes llegan a tu billetera. El retiro mínimo es {fmtCents(MIN_PAYOUT_CENTS)}.</li>
        <li>Solo transferimos a cuentas a nombre del titular de la cuenta de Pídelo.</li>
        <li>
          Por seguridad, los proveedores nuevos esperan unos días antes de retirar lo liberado, y los retiros se suspenden 48 horas después
          de cambiar la cuenta bancaria.
        </li>
      </ul>

      <h2>7. Contacto fuera de la plataforma</h2>
      <p>
        Antes de que el pago quede protegido no se pueden compartir datos de contacto ni acordar pagos por fuera. Los mensajes se
        revisan de forma automática para detectarlo. Cada intento suma una advertencia: con {STRIKES_LOSE_PRIORITY} se pierde la prioridad
        en avisos y con {STRIKES_SUSPEND} la cuenta se suspende {SUSPENSION_DAYS} días.
      </p>

      <h2>8. Responsabilidad</h2>
      <p>
        Cada proveedor es responsable de la calidad, legalidad y cumplimiento de lo que ofrece. Pídelo responde por la custodia del pago
        y por resolver las disputas conforme a estos términos. Nada en estos términos limita los derechos que te reconoce la Ley Orgánica
        de Defensa del Consumidor.
      </p>

      <h2>9. Reclamos y contacto</h2>
      <p>
        Para consultas o reclamos escribe a <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>. Respondemos en un máximo de
        cinco días hábiles. Si no quedas conforme, puedes acudir a la Defensoría del Pueblo o a las autoridades competentes.
      </p>

      <h2>10. Cambios y ley aplicable</h2>
      <p>
        Si cambiamos estos términos te avisaremos con anticipación dentro de la plataforma. Estos términos se rigen por las leyes de la
        República del Ecuador, incluida la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos.
      </p>
    </>
  );
}
