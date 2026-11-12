import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/ingresar">) {
  const { next: rawNext } = await searchParams;
  const next = typeof rawNext === "string" && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : undefined;
  if (await getCurrentUser()) redirect(next ?? "/solicitudes");
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight">Bienvenido de vuelta</h1>
      <p className="mt-1 text-zinc-600">Ingresa para publicar, ofertar y chatear.</p>
      <div className="card mt-6 p-6">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
