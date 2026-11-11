# Pídelo (nombre provisional)

**Publica lo que necesitas. Alguien lo resuelve.**

Es un mercado inverso para Ecuador: la persona publica su necesidad (tutoría, trámite, auditoría, reparación, "busco quien me venda…") y quienes pueden resolverla envían ofertas. Nace de los grupos de Facebook donde la gente pide ayuda y paga por ella, pero sin las esperas ni las estafas.

## Qué incluye el MVP

| Función | Dónde |
|---|---|
| Registro/login (JWT en cookie httpOnly, bcrypt) | `src/lib/auth.ts`, `src/app/actions/auth.ts` |
| **Asistente de publicación con IA**: texto libre → solicitud estructurada (categoría, tipo, ciudad, presupuesto sugerido, urgencia, preguntas faltantes, aviso de políticas) | `src/lib/ai.ts`, `src/app/publicar/` |
| **Match instantáneo**: al publicar se notifica a quienes tienen esa habilidad (y misma ciudad si es presencial) | `src/lib/matching.ts` |
| Feed con filtros (texto, categoría, tipo, ciudad, urgentes) y pestaña "Para ti" | `src/app/solicitudes/page.tsx` |
| Ofertas (precio, días, mensaje) con cálculo de comisión | `src/app/solicitudes/[id]/` |
| Chat privado por oferta (refresco cada 4 s) | `src/app/solicitudes/[id]/chat/[offerId]/` |
| Ciclo completo: aceptar → pago protegido (simulado) → entregado → confirmar y liberar | `src/app/actions/requests.ts` |
| Reseñas mutuas y reputación (promedio, trabajos completados) | `src/app/perfil/[id]/` |
| Notificaciones in-app, panel "Mi actividad" con lo ganado | `src/app/notificaciones/`, `src/app/actividad/` |

### Anti-fuga (evitar que el pago se haga por fuera)

- **Filtro de contacto** (`src/lib/contact-filter.ts`): oculta teléfonos (09…, +593, dígitos separados o en palabras), correos (incluso "arroba … punto com"), enlaces, wa.me y @usuarios. Bloquea frases como "por fuera", "sin comisión", "págame directo" o "te paso mi WhatsApp".
- **IA para casos ambiguos** (`src/lib/moderation.ts`): si hay señales débiles ("búscame en Facebook", "mi número está en mi perfil"), Claude decide. Solo se llama en esos casos, para no gastar en cada mensaje.
- Se aplica al **chat, a las ofertas y a las publicaciones**. En el chat, el contacto se desbloquea cuando la oferta es aceptada y el pago queda protegido.
- **Strikes**: cada intento suma una advertencia y una notificación. Con 3 se pierde el match instantáneo y las ofertas van al final del ranking; con 5 la cuenta se suspende 7 días. Todo queda en la tabla `Violation` para moderación.
- **Textos de valor**: cobro asegurado para quien ofrece, dinero retenido para quien pide, y "por fuera no hay garantía ni reseñas".

### Modelo de negocio

**Publicar es gratis.** Se cobra donde no frena la demanda:

| Fuente | Detalle | Código |
|---|---|---|
| **Comisión** sobre el pago protegido | 10 % Gratis · 7 % Pro · 5 % Élite. Se congela al aceptar la oferta (`Offer.feeRate`). | `acceptOffer` |
| **Créditos** (1 ≈ $0.20) | Paquetes: 10/$2, 30/$5, 75/$10. Ofertar cuesta 1 a 3 según el presupuesto (se devuelven si el cliente cancela). Quien pide los usa para ⚡ urgente (5), ⭐ destacar 3 días (3) o 🔄 volver a subir (2, una vez al día). | `src/lib/credits.ts`, `src/app/actions/billing.ts` |
| **Suscripciones** para quienes ofrecen | Pro $4.99 (30 créditos/mes) · Élite $12.99 (80 créditos/mes). **Acceso anticipado de 10 min** a solicitudes nuevas (solo si hay algún Pro/Élite que coincida; si no, se abre a todos de inmediato), ofertas primero en el ranking, insignias, plantilla de oferta y estadísticas (Élite). | `src/lib/constants.ts` (`PLANS`), `src/lib/matching.ts`, `src/lib/feed.ts` |

- **Sin cron:** `refreshAccount()` corre al renderizar el navbar. Entrega los 5 créditos mensuales del plan gratis y renueva o vence los planes pagados (una sola vez aunque lleguen visitas simultáneas).
- **Cambios de plan** (`src/lib/plans.ts`):
  - **Subir de plan** a mitad de ciclo: se cobra solo la diferencia por los días restantes y se entregan los créditos proporcionales; la fecha de renovación no cambia.
  - **Bajar de plan:** no hay reembolso; el cambio queda programado (`nextPlan`) y se aplica en la próxima renovación. Se puede anular con "Mantener mi plan".
  - El cobro con saldo y la activación del plan ocurren en una sola transacción.
- **Vencimiento de solicitudes** (`src/lib/lifecycle.ts`): una solicitud abierta vence a los 14 días sin actividad (publicarla o volver a subirla) y **devuelve los créditos** a quienes ofertaron. El día 12 el cliente recibe un recordatorio. Si el cliente elige otra oferta, los créditos no se devuelven: pagan la oportunidad de competir.
- **Gasto atómico:** `spendCredits` usa `updateMany … where credits >= n`, así que el saldo nunca queda negativo aunque haya requests simultáneos. Cada movimiento queda en `CreditTransaction`.
- **Pagos simulados:** "pagar con tarjeta" no cobra nada hasta integrar la pasarela. En producción está **bloqueado** (salvo `ALLOW_SIMULATED_PAYMENTS=1`, solo para demos): créditos y planes se pagan con el saldo de la billetera, y la renovación mensual también se cobra del saldo; si no alcanza, el plan termina. Al integrar la pasarela (PayPhone/Kushki), la compra con tarjeta debe ejecutarse desde su **webhook** al confirmarse el pago, nunca directo desde el cliente.
- **Débitos de saldo serializados:** los cobros con saldo y los retiros bloquean la cuenta (`lockAccount`, advisory lock de Postgres) antes de leer el saldo, para que dos operaciones simultáneas no sobregiren.

### Pago retenido real (Fase 1: transferencia o DeUna + verificación manual)

```
Cliente elige oferta → AWAITING_PAYMENT → paga con código PID-XXXXXX y sube comprobante
   → Admin verifica en el banco y confirma → HELD (el proveedor empieza)
   → Proveedor entrega → el cliente confirma, o pasan 72 h → RELEASED → billetera del proveedor
   → "Tengo un problema" → DISPUTED (congelado) → el admin resuelve: reembolso, liberación o reparto
   → El proveedor retira a su cuenta → el admin transfiere y marca como pagado
```

- **Libro contable de doble entrada** (`LedgerEntry`, `src/lib/ledger.ts`): cada transacción suma cero y los saldos se calculan desde los asientos, en centavos enteros. Cuentas: `WORLD`, `ESCROW:<solicitud>`, `AVAILABLE:<usuario>`, `PAYOUT_PENDING:<usuario>` y `REVENUE`. Los asientos no se editan; se corrigen con transacciones inversas.
- **Operaciones** en `src/lib/escrow.ts`: confirmar pago, liberar (con guarda contra doble liberación), reembolsar, resolver disputas, liberación automática y resumen de billetera.
- **Billetera** (`/billetera`): saldo disponible, retenido, retiros en proceso y total retirado, más la cuenta bancaria. Mínimo de retiro: $10. Los proveedores con menos de 3 trabajos esperan 7 días antes de retirar lo liberado (protección ante fraude). Los reembolsos van al saldo del cliente, que puede retirarlos o **usarlos para créditos y planes**.
- **Panel `/admin`** (usuario `admin@demo.ec`): pagos por verificar con visor de comprobante, disputas, retiros (con alerta si el titular no coincide), **conciliación** (verifica que el libro cuadre y que no queden escrows con saldo en solicitudes cerradas) e intentos de fuga.
- **Comprobantes**: en desarrollo se guardan en `storage/receipts/`; en producción, en un bucket privado S3/R2 (`STORAGE_DRIVER=s3`). Solo los ven quien pagó o un admin (`/api/comprobantes/[id]`).
- **Datos bancarios de la empresa**: variables `PAY_BANK_NAME`, `PAY_ACCOUNT_TYPE`, `PAY_ACCOUNT_NUMBER`, `PAY_HOLDER`, `PAY_RUC` y `PAY_DEUNA` en `.env`.
- **Liberación a las 72 h y vencimiento de solicitudes**: ocurren al navegar y, en producción, también con `GET /api/cron/liberar` y el header `Authorization: Bearer $CRON_SECRET` (por ejemplo, Vercel Cron cada hora).

Para publicar y para lo que falta antes de cobrar dinero real, ver [Publicar en producción](#publicar-en-producción).

Stack: **Next.js 16** (App Router, Server Actions) · **Prisma 7** + PostgreSQL · Tailwind 4 · Claude API (`@anthropic-ai/sdk`) · almacenamiento S3/R2.

## Cómo correrlo (desarrollo)

Requisitos: Node.js 20+ y Docker Desktop (para PostgreSQL local).

```bash
npm install
cp .env.example .env        # y define SESSION_SECRET
npm run db:up               # PostgreSQL 17 en Docker (localhost:5432)
npx prisma migrate dev      # crea las tablas
npm run db:seed             # datos demo
npm run dev                 # http://localhost:3000
```

Usuarios demo (clave `demo1234`): `ana@demo.ec` (quien pide), `carlos@demo.ec` (tutor/tecnología, Quito), `maria@demo.ec` (contadora, Guayaquil), `jose@demo.ec` (hogar/mandados), `lucia@demo.ec` (diseño/marketing, Cuenca) y `admin@demo.ec` (panel de administración).

Comprobación rápida: `GET /api/health` responde `{"ok":true,"db":"ok"}` si la app y la base de datos están bien.

### Asistente de IA

- **Sin `ANTHROPIC_API_KEY`** se usa un clasificador local por palabras clave. Funciona, pero es básico.
- **Con `ANTHROPIC_API_KEY`** se usa Claude Opus 5 con salida estructurada (esquema Zod), `effort: "low"` y `fallbacks: "default"`: si el modelo rechaza la solicitud, se reintenta en otro modelo del lado del servidor. Si la API falla, vuelve al clasificador local.
- Regla de negocio incluida: si piden "hazme la tarea", la IA lo reformula como tutoría y lo avisa en pantalla.

## Publicar en producción

La app está preparada para **Vercel + PostgreSQL gestionado + Cloudflare R2** (u otros equivalentes). Al arrancar en producción, `src/instrumentation.ts` verifica la configuración y **se niega a arrancar** si falta algo: secretos, cron, almacenamiento en la nube o datos bancarios reales. El error lista exactamente qué variable falta.

### 1. Base de datos (Neon, Supabase o Prisma Postgres)
1. Crea un proyecto PostgreSQL, idealmente en una región cercana a la de Vercel (por ejemplo, `us-east`).
2. Copia **dos** cadenas de conexión:
   - **Pooled** (con pooler, p. ej. host `...-pooler...` en Neon) → `DATABASE_URL`. La usa la app.
   - **Directa** → `DIRECT_URL`. La usan las migraciones.

### 2. Almacenamiento de comprobantes (Cloudflare R2)
1. En Cloudflare → R2, crea un bucket **privado** (por ejemplo, `pidelo-comprobantes`). No actives el acceso público.
2. Crea un token de API de R2 con permiso de lectura y escritura sobre ese bucket.
3. Anota el Account ID, el Access Key ID y el Secret Access Key.

Con AWS S3 funciona igual: deja `S3_ENDPOINT` vacío y usa la región del bucket.

### 3. Vercel
1. Importa el repositorio en Vercel (framework: Next.js). El build usa `npm run vercel-build`, que **aplica las migraciones** (`prisma migrate deploy`) y luego compila.
2. En *Settings → Environment Variables* define:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | URL pooled de Postgres |
| `DIRECT_URL` | URL directa de Postgres |
| `SESSION_SECRET` | 64 caracteres aleatorios (ver `.env.example`) |
| `CRON_SECRET` | Otro valor aleatorio |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Datos de R2 |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `PAY_BANK_NAME`, `PAY_ACCOUNT_TYPE`, `PAY_ACCOUNT_NUMBER`, `PAY_HOLDER`, `PAY_RUC`, `PAY_DEUNA` | Cuenta real de la empresa |
| `ANTHROPIC_API_KEY` | Opcional: activa el asistente con IA |

3. **Cron:** `vercel.json` programa `/api/cron/liberar` cada hora (liberación a las 72 h y vencimiento de solicitudes). Vercel envía `CRON_SECRET` automáticamente. El plan gratuito de Vercel solo permite crons diarios; con él, cambia el horario a `0 6 * * *`. La app igual ejecuta estas tareas cuando alguien navega.
4. Publica. Luego verifica `https://<tu-dominio>/api/health`.

### 4. Después de publicar
- **Crear el administrador:** regístrate normalmente y, en la base de datos, cambia el `role` de tu usuario a `ADMIN`. No uses el seed en producción: crea cuentas demo con clave conocida.
- **Dominio propio:** en Vercel → Domains.
- **Monitoreo:** apunta un servicio como UptimeRobot a `/api/health`.
- **Respaldos:** activa los backups automáticos del proveedor de Postgres.

### 5. Antes de cobrar dinero real
- Valida el esquema legal y tributario con abogado y contador: comerciante de registro, facturación SRI y retenciones.
- **Fase 2:** integra la pasarela (PayPhone o Kushki). Su webhook debe llamar a `confirmPayment(paymentId)` en `src/lib/escrow.ts`; el resto del flujo ya está listo.

**Seguridad incluida:**
- **Cabeceras:** HSTS, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy.
- **Comprobantes:** se verifica el contenido real del archivo, no solo el tipo que declara el navegador.
- **Bucket privado:** los comprobantes solo se sirven con control de acceso.

## Hoja de ruta sugerida

- [ ] Notificaciones por **WhatsApp** (WhatsApp Business API) y push web: es la clave del "respuesta en minutos".
- [ ] Chat en tiempo real (SSE/WebSockets o Pusher/Ably) en lugar del refresco periódico.
- [ ] Verificación de identidad (cédula) e insignia de "verificado".
- [ ] Adjuntar archivos a solicitudes y entregas (S3/R2).
- [ ] Moderación con IA al publicar y reportes de usuarios.
- [ ] Solicitudes destacadas o urgentes de pago (monetización extra).
- [ ] Disputas: botón "tengo un problema" antes de liberar el pago.
- [ ] Recuperación de contraseña y verificación de correo.
- [ ] App móvil (PWA primero).
