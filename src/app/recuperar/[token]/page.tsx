import type { Metadata } from "next";
import Link from "next/link";
import { findValidReset } from "@/lib/password-reset";
import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPasswordPage({ params }: PageProps<"/recuperar/[token]">) {
  const { token } = await params;
  const reset = await findValidReset(token);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      {reset ? (
        <>
          <h1 className="font-display text-3xl font-bold tracking-tight">Crea una nueva contraseña</h1>
          <p className="mt-1 text-zinc-600">
            Para <b>{reset.user.email}</b>. Al guardarla se cerrará la sesión en tus otros dispositivos.
          </p>
          <div className="card mt-6 p-6">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <>
          <h1 className="font-display text-3xl font-bold tracking-tight">Este enlace ya no sirve</h1>
          <p className="mt-1 text-zinc-600">Venció o ya se usó. Los enlaces duran una hora y sirven una sola vez.</p>
          <Link href="/recuperar" className="btn-primary mt-6">
            Pedir un enlace nuevo
          </Link>
        </>
      )}
    </div>
  );
}
