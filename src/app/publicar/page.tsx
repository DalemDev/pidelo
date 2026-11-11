import type { Metadata } from "next";
import { requireMember } from "@/server/auth/session";
import { Composer } from "./composer";

export const metadata: Metadata = { title: "Publicar necesidad" };

export default async function PublishPage() {
  const user = await requireMember("/publicar");
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">¿Qué necesitas, {user.name.split(" ")[0]}?</h1>
      <p className="mt-1 text-zinc-600">
        Escríbelo como se lo contarías a un amigo. Nosotros lo ordenamos y avisamos a quienes pueden ayudarte.
      </p>
      <Composer defaultCity={user.city} aiEnabled={aiEnabled} credits={user.credits} />
    </div>
  );
}
