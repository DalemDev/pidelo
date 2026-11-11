# Pídelo

**Publica lo que necesitas. Alguien lo resuelve.**

Mercado inverso de servicios: la persona publica su necesidad (tutoría, trámite, auditoría, reparación, "busco quien me venda…") y quienes pueden resolverla envían ofertas. El pago queda retenido por la plataforma hasta que el cliente confirma el trabajo.

- **Arquitectura y decisiones de diseño:** [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- **Seguridad, OWASP y cumplimiento legal:** [docs/SEGURIDAD.md](docs/SEGURIDAD.md)

## Funcionalidades

| Área | Qué hace |
|---|---|
| Publicar | Texto libre → solicitud estructurada con un asistente (Claude; sin clave de API, clasificador local). Publicar es gratis; "urgente", "destacar" y "volver a subir" se pagan con créditos. |
| Match | Al publicar se avisa a quienes tienen esa habilidad (y la ciudad, si es presencial), con acceso anticipado para planes Pro/Élite. |
| Ofertas y chat | Ofertas con precio y plazo, chat privado por oferta. Antes del pago protegido se ocultan teléfonos, correos y enlaces, y se bloquean propuestas de pagar por fuera (reglas + IA en casos dudosos, con advertencias y suspensión). |
| Pago protegido | Transferencia o DeUna con comprobante que verifica un administrador; plazo de 48 h para pagar; liberación al confirmar o a las 72 h; disputas con reembolso total, parcial o liberación. |
| Billetera | Libro contable de doble entrada en centavos; retiros a cuenta bancaria propia (cifrada); retenciones antifraude. |
| Monetización | Comisión 10/7/5 % según plan, créditos y planes Pro/Élite con prorrateo. |
| Cuenta | Registro con aceptación de términos, recuperación de contraseña por correo, sesiones revocables, descarga de datos y eliminación de la cuenta. |
| Administración | Pagos por verificar, disputas, retiros, conciliación del libro e intentos de fuga; cada acción queda en el registro de auditoría. |

Stack: Next.js 16 (App Router, Server Actions) · Prisma 7 + PostgreSQL · Tailwind 4 · Claude API · S3/R2 · Resend.

## Desarrollo

Requisitos: Node.js 20+ y Docker.

```bash
npm install
cp .env.example .env        # y define SESSION_SECRET
npm run db:up               # PostgreSQL 17 en Docker (localhost:5432)
npx prisma migrate dev      # crea las tablas
npm run db:seed             # datos de prueba (BORRA la base; bloqueado en producción)
npm run dev                 # http://localhost:3000
```

Los datos de prueba crean usuarios con la clave `demo1234`: `ana@demo.ec` (cliente), `carlos@demo.ec`, `maria@demo.ec`, `jose@demo.ec`, `lucia@demo.ec` (proveedores) y `admin@demo.ec` (administración).

En desarrollo, sin `RESEND_API_KEY`, los correos (p. ej. recuperación de contraseña) se imprimen en la consola del servidor, y los trabajos programados corren al navegar (como mucho una vez por minuto).

### Pruebas y calidad

```bash
npm run db:test:create      # una sola vez: crea la base pidelo_test en el contenedor
TEST_DATABASE_URL="postgresql://pidelo:pidelo@localhost:5432/pidelo_test" npm test
npm run check               # lint + tipos + pruebas
```

- `tests/unit`: reglas de dominio puras (dinero, planes, políticas, filtro de contacto, validación, cifrado).
- `tests/integration`: servicios contra PostgreSQL, incluidas las carreras de condición con dinero (cobros y retiros simultáneos, confirmaciones duplicadas, cancelaciones concurrentes, disputas). Sin `TEST_DATABASE_URL` se omiten.
- CI (`.github/workflows/ci.yml`): auditoría de dependencias, lint, tipos, pruebas con PostgreSQL y build en cada push y pull request.

## Producción

La app está preparada para **Vercel + PostgreSQL gestionado (Neon/Supabase) + Cloudflare R2 + Resend**. Al arrancar en producción, `src/instrumentation.ts` valida la configuración y **se niega a arrancar** si falta algo, indicando qué variable.

1. **Base de datos:** URL *pooled* en `DATABASE_URL` y directa en `DIRECT_URL`. Activa backups automáticos.
2. **Comprobantes:** bucket **privado** en R2 o S3 con un token de lectura/escritura solo para ese bucket.
3. **Correo:** dominio verificado en Resend (SPF/DKIM) para `MAIL_FROM`.
4. **Variables:** todas las de `.env.example` marcadas como obligatorias, en especial `SESSION_SECRET`, `CRON_SECRET`, `DATA_ENCRYPTION_KEY` (guárdala también en un gestor de secretos: sin ella no se pueden leer los datos bancarios), datos `LEGAL_*` y `PAY_*`.
5. **Despliegue:** `npm run vercel-build` aplica migraciones y compila. `vercel.json` programa el cron cada hora (liberación a 72 h, plazo de pago, vencimientos y purga de registros).
6. **Después de publicar:** crea tu usuario y cambia su `role` a `ADMIN` en la base; si migras datos anteriores, ejecuta `npm run data:encrypt-bank`; apunta un monitor a `/api/health`.

### Antes de cobrar dinero real

- Revisión de **términos, privacidad y cookies** (`src/app/legal/*`) por un abogado.
- Esquema tributario con contador: comerciante de registro, **facturación electrónica SRI** de comisiones, créditos y planes (no implementada en el código) y retenciones.
- Registro como responsable de tratamiento y designación de delegado de protección de datos si corresponde (LOPDP).
- Integrar la pasarela (PayPhone o Kushki): su webhook debe llamar a `confirmPayment` en `src/server/services/escrow.ts` y la compra de créditos/planes debe confirmarse desde el webhook.

## Hoja de ruta

- [ ] Notificaciones por WhatsApp y correo (implementar `NotificationChannel` en `src/server/services/notifications.ts`).
- [ ] Chat en tiempo real (SSE/WebSockets) en lugar del refresco periódico.
- [ ] Verificación de identidad (cédula) e insignia de verificado.
- [ ] Verificación del correo al registrarse.
- [ ] Adjuntos en solicitudes y entregas.
- [ ] Facturación electrónica SRI.
- [ ] App móvil (PWA primero).
