"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/actions/auth";
import { CITIES } from "@/lib/constants";
import { SkillsPicker } from "@/components/auth-forms";
import { FormMessage, SubmitButton } from "@/components/form-bits";

type Props = { user: { name: string; city: string; bio: string; skills: string[] } };

export function ProfileForm({ user }: Props) {
  const [state, action] = useActionState(updateProfile, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Nombre</label>
          <input className="input" id="name" name="name" defaultValue={user.name} required />
        </div>
        <div>
          <label className="label" htmlFor="city">Ciudad</label>
          <select className="input" id="city" name="city" defaultValue={user.city}>
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bio">Sobre ti</label>
        <textarea
          className="input min-h-24"
          id="bio"
          name="bio"
          maxLength={500}
          defaultValue={user.bio}
          placeholder="Ej: Contadora CPA con 8 años de experiencia en declaraciones del SRI y auditorías para pymes."
        />
      </div>
      <SkillsPicker selected={user.skills} />
      <FormMessage state={state} />
      <SubmitButton>Guardar cambios</SubmitButton>
    </form>
  );
}
