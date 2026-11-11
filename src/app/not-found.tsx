import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="font-display text-3xl font-bold">No encontramos esto</h1>
      <p className="mt-2 text-zinc-600">Puede que la página no exista o que no tengas acceso.</p>
      <Link href="/solicitudes" className="btn-primary mt-6">Ver solicitudes</Link>
    </div>
  );
}
