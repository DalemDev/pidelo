"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register } from "@/app/actions/auth";
import { requestPasswordReset, resetPassword } from "@/app/actions/password";
import { CATEGORIES, CITIES } from "@/domain/catalog";
import { FormMessage, SubmitButton } from "./form-bits";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Contraseña</label>
          <Link href="/recuperar" className="text-xs font-semibold text-brand-600">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Ingresar</SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        ¿No tienes cuenta?{" "}
        <Link href={`/registro${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600">
          Regístrate gratis
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(register, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="name">Nombre</label>
          <input className="input" id="name" name="name" required autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="city">Ciudad</label>
          <select className="input" id="city" name="city" defaultValue="Quito">
            {CITIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="email">Correo</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Contraseña</label>
        <input className="input" id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <SkillsPicker />
      <FormMessage state={state} />
      <SubmitButton className="w-full">Crear cuenta</SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        ¿Ya tienes cuenta?{" "}
        <Link href={`/ingresar${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-600">
          Ingresa
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">Correo de tu cuenta</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Enviarme el enlace</SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        <Link href="/ingresar" className="font-semibold text-brand-600">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="password">Nueva contraseña</label>
        <input className="input" id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Repítela</label>
        <input className="input" id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full">Guardar y entrar</SubmitButton>
    </form>
  );
}

export function SkillsPicker({ selected = [] }: { selected?: string[] }) {
  return (
    <fieldset>
      <legend className="label">¿En qué puedes ayudar a otros? <span className="font-normal text-zinc-500">(opcional)</span></legend>
      <p className="-mt-1 mb-2 text-xs text-zinc-500">Te avisaremos al instante cuando alguien publique algo de estas categorías.</p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <label key={c.slug} className="cursor-pointer">
            <input type="checkbox" name="skills" value={c.slug} defaultChecked={selected.includes(c.slug)} className="peer sr-only" />
            <span className="chip border border-zinc-300 bg-white py-1.5 text-zinc-700 transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-200">
              {c.icon} {c.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
