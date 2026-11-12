import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "@/server/config/legal";

export const metadata: Metadata = { title: "Política de privacidad" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p>
        Esta política explica cómo <b>{LEGAL.companyName}</b> (RUC {LEGAL.ruc}, {LEGAL.address}), responsable del tratamiento, trata tus
        datos personales en Pídelo, conforme a la Ley Orgánica de Protección de Datos Personales del Ecuador (LOPDP).
      </p>

      <h2>1. Datos que tratamos</h2>
      <ul>
        <li><b>Cuenta:</b> nombre, correo, ciudad, contraseña (guardada solo como hash), habilidades y biografía.</li>
        <li><b>Actividad:</b> solicitudes, ofertas, mensajes, reseñas y notificaciones.</li>
        <li><b>Pagos:</b> montos, comprobantes de transferencia y movimientos de tu billetera.</li>
        <li><b>Retiros:</b> banco, tipo y número de cuenta, nombre y cédula o RUC del titular (cifrados en nuestra base de datos).</li>
        <li><b>Seguridad:</b> dirección IP en intentos de ingreso y en acciones sensibles, y registros de moderación.</li>
      </ul>

      <h2>2. Para qué los usamos y con qué base legal</h2>
      <ul>
        <li><b>Prestar el servicio</b> (publicar, ofertar, chatear, custodiar y liberar pagos): ejecución del contrato que aceptas al registrarte.</li>
        <li><b>Cumplir obligaciones legales y tributarias</b> (registros contables, facturación): obligación legal.</li>
        <li><b>Prevenir fraude y proteger la plataforma</b> (límites de intentos, moderación, auditoría): interés legítimo.</li>
        <li><b>Avisarte de solicitudes de tus categorías</b>: consentimiento, que puedes retirar quitando tus habilidades del perfil.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>

      <h2>3. Revisión automática y asistente</h2>
      <p>
        Los textos que publicas y los mensajes del chat se revisan de forma automática para detectar datos de contacto o pagos por fuera
        antes del pago protegido. En casos dudosos, y cuando usas el asistente para redactar una solicitud, el texto se envía a un
        proveedor de inteligencia artificial que lo procesa solo para devolver el resultado. Puedes pedir que una persona revise una
        advertencia escribiendo a {LEGAL.supportEmail}.
      </p>

      <h2>4. Con quién los compartimos</h2>
      <p>Compartimos datos solo con encargados que nos prestan servicios, bajo contrato y con las garantías que exige la LOPDP:</p>
      <ul>
        <li>Alojamiento de la aplicación y base de datos.</li>
        <li>Almacenamiento privado de comprobantes de pago.</li>
        <li>Envío de correos transaccionales (por ejemplo, recuperación de contraseña).</li>
        <li>Proveedor de inteligencia artificial para el asistente y la moderación.</li>
      </ul>
      <p>
        Algunos de estos proveedores procesan datos fuera del Ecuador (por ejemplo, en Estados Unidos). Estas transferencias se hacen
        con cláusulas contractuales y medidas de seguridad adecuadas. Con la otra parte de un trabajo compartimos solo lo necesario:
        tu nombre, reputación y, una vez protegido el pago, lo que tú decidas compartir en el chat.
      </p>

      <h2>5. Cuánto tiempo los guardamos</h2>
      <ul>
        <li>Mientras tu cuenta esté activa.</li>
        <li>
          Al eliminar tu cuenta anonimizamos tus datos personales. Conservamos los registros contables y de pagos, sin datos que te
          identifiquen, el tiempo que exige la normativa tributaria.
        </li>
        <li>Los registros de seguridad se conservan hasta 12 meses.</li>
      </ul>

      <h2>6. Tus derechos</h2>
      <p>
        Tienes derecho a acceder, rectificar y actualizar, eliminar, oponerte, pedir la portabilidad y la suspensión del tratamiento de
        tus datos. Puedes ejercerlos así:
      </p>
      <ul>
        <li><b>Acceso y portabilidad:</b> descarga todos tus datos en formato JSON desde <Link href="/cuenta">Mi cuenta</Link>.</li>
        <li><b>Rectificación:</b> edita tu perfil o escríbenos.</li>
        <li><b>Eliminación:</b> elimina tu cuenta desde <Link href="/cuenta">Mi cuenta</Link>.</li>
        <li>
          <b>Otros derechos o dudas:</b> escribe a <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>. Respondemos en los
          plazos que establece la LOPDP.
        </li>
      </ul>
      <p>
        Si consideras que no atendimos tu solicitud, puedes presentar un reclamo ante la Superintendencia de Protección de Datos Personales.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Usamos conexiones cifradas (HTTPS), contraseñas con hash, cifrado de los datos bancarios, almacenamiento privado de comprobantes,
        control de acceso por rol, límites de intentos y registros de auditoría. Si detectamos una vulneración que afecte tus datos, te
        avisaremos y notificaremos a la autoridad conforme a la ley.
      </p>

      <h2>8. Menores de edad</h2>
      <p>Pídelo es solo para mayores de 18 años. Si detectamos una cuenta de un menor, la eliminamos.</p>

      <h2>9. Cookies</h2>
      <p>
        Usamos solo una cookie necesaria para mantener tu sesión. Detalles en la <Link href="/legal/cookies">política de cookies</Link>.
      </p>
    </>
  );
}
