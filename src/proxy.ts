import { NextResponse, type NextRequest } from "next/server";

// Content Security Policy con nonce por request (OWASP A03/A05): solo se ejecutan los scripts que
// Next.js marca con el nonce; scripts inyectados por un atacante quedan bloqueados.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Hojas y <style> con nonce; los atributos style (los usan React y Next) no ejecutan código.
    // En desarrollo la recarga en caliente inyecta <style> sin nonce (con nonce presente, el navegador
    // ignora 'unsafe-inline', por eso la excepción va solo en style-src-elem).
    `style-src 'self' 'nonce-${nonce}'`,
    `style-src-elem 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // En localhost (http) forzar https rompería los recursos del entorno de desarrollo.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Todo excepto API, archivos estáticos y prefetch de next/link (no necesitan CSP).
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
