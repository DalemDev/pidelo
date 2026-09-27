import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegisterForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage({ searchParams }: PageProps<"/registro">) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/solicitudes");
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">Crea tu cuenta gratis</h1>
      <p className="mt-1 text-zinc-600">Una sola cuenta para pedir ayuda y para ganar dinero ayudando.</p>
      <div className="card mt-6 p-6">
        <RegisterForm next={typeof next === "string" ? next : undefined} />
      </div>
    </div>
  );
}
