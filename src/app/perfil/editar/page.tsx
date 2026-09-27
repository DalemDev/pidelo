import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { splitSkills } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Editar perfil" };

export default async function EditProfilePage() {
  const user = await requireUser("/perfil/editar");
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold tracking-tight">Tu perfil</h1>
      <p className="mt-1 text-zinc-600">Tus habilidades definen qué solicitudes te llegan al instante.</p>
      <div className="card mt-6 p-6">
        <ProfileForm user={{ name: user.name, city: user.city, bio: user.bio, skills: splitSkills(user.skills) }} />
      </div>
    </div>
  );
}
