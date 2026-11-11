import type { Metadata } from "next";

export const metadata: Metadata = { title: "Política de cookies" };

export default function CookiesPage() {
  return (
    <>
      <h1>Política de cookies</h1>
      <p>
        Pídelo usa una sola cookie, estrictamente necesaria para que el servicio funcione. No usamos cookies de publicidad, analítica ni
        de terceros, por eso no te pedimos que aceptes un aviso de cookies.
      </p>

      <h2>Cookie que usamos</h2>
      <ul>
        <li>
          <b>pidelo_session</b>: mantiene tu sesión iniciada. Es propia, no es accesible desde JavaScript (httpOnly), solo viaja por
          conexiones seguras y dura hasta 30 días o hasta que cierres sesión.
        </li>
      </ul>

      <h2>Almacenamiento del navegador</h2>
      <p>No guardamos datos personales en el almacenamiento local del navegador.</p>

      <h2>Cómo eliminarla</h2>
      <p>
        Al cerrar sesión la cookie se borra y la sesión se invalida en nuestros servidores. También puedes borrarla desde la configuración
        de tu navegador; tendrás que volver a ingresar.
      </p>
    </>
  );
}
