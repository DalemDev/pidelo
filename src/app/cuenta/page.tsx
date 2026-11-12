import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/server/auth/session";
import { LEGAL } from "@/server/config/legal";
import { DeleteAccountForm } from "./delete-form";

export const metadata: Metadata = { title: "Mi cuenta" };

export default async function AccountPage() {
  const user = await requireMember("/cuenta");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Mi cuenta</h1>
      <p className="mt-1 text-zinc-600">{user.email}</p>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Perfil</h2>
        <p className="mt-1 text-sm text-zinc-600">Nombre, ciudad, biografía y categorías en las que ayudas.</p>
        <Link href="/perfil/editar" className="btn-secondary mt-4">Editar perfil</Link>
      </section>

      <section className="card mt-4 p-6">
        <h2 className="font-semibold">Descargar mis datos</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Un archivo JSON con tu perfil, solicitudes, ofertas, mensajes, reseñas, pagos y movimientos.
        </p>
        <a href="/api/cuenta/exportar" className="btn-secondary mt-4">Descargar</a>
      </section>

      <section className="card mt-4 border-rose-200 p-6">
        <h2 className="font-semibold text-rose-800">Eliminar mi cuenta</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Anonimizamos tus datos personales y cerramos todas tus sesiones. Esta acción no se puede deshacer. No es posible si tienes
          trabajos en curso, dinero en tu billetera o un retiro pendiente. Los registros contables se conservan sin datos que te
          identifiquen, como exige la ley. Más detalles en la <Link href="/legal/privacidad" className="font-semibold text-brand-600">política de privacidad</Link>.
        </p>
        <DeleteAccountForm />
      </section>

      <p className="mt-6 text-sm text-zinc-500">
        ¿Dudas sobre tus datos? Escríbenos a{" "}
        <a href={`mailto:${LEGAL.privacyEmail}`} className="font-semibold text-brand-600">{LEGAL.privacyEmail}</a>.
      </p>
    </div>
  );
}
