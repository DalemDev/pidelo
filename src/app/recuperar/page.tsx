import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">¿Olvidaste tu contraseña?</h1>
      <p className="mt-1 text-zinc-600">Escribe tu correo y te enviamos un enlace para crear una nueva.</p>
      <div className="card mt-6 p-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
