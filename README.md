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

- **Sin cron:** `refreshAccount()` corre al renderizar el navbar. Entrega los 5 créditos mensuales del plan gratis y renueva o vence los planes pagados.
- **Gasto atómico:** `spendCredits` usa `updateMany … where credits >= n`, así que el saldo nunca queda negativo aunque haya requests simultáneos. Cada movimiento queda en `CreditTransaction`.
- **Pagos simulados:** para producción, `buyCredits` y `subscribePlan` deben ejecutarse desde el **webhook** de la pasarela (PayPhone/Kushki) al confirmarse el pago, nunca directo desde el cliente.

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
- **Comprobantes**: se guardan en `storage/receipts/` (fuera de `/public`) y solo los ven quien pagó o un admin (`/api/comprobantes/[id]`).
- **Datos bancarios de la empresa**: variables `PAY_BANK_NAME`, `PAY_ACCOUNT_TYPE`, `PAY_ACCOUNT_NUMBER`, `PAY_HOLDER`, `PAY_RUC` y `PAY_DEUNA` en `.env`.
- **Liberación a las 72 h**: ocurre al navegar y, en producción, también con `GET /api/cron/liberar` y el header `Authorization: Bearer $CRON_SECRET` (por ejemplo, Vercel Cron cada hora).

**Antes de producción:**
1. Validar el esquema legal y tributario (comerciante de registro, facturación SRI, retenciones) con un abogado y un contador.
2. Mover los comprobantes a S3 o Cloudflare R2, porque el disco de un servidor serverless no persiste.
3. Fase 2: reemplazar la confirmación manual por el webhook de la pasarela, que llamaría a `confirmPayment(paymentId)`.

Stack: **Next.js 16** (App Router, Server Actions) · **Prisma 7** + SQLite (libSQL) · Tailwind 4 · Claude API (`@anthropic-ai/sdk`).

## Cómo correrlo

```bash
npm install
cp .env.example .env        # y define SESSION_SECRET
npx prisma migrate dev      # crea dev.db
npm run db:seed             # datos demo
npm run dev                 # http://localhost:3000
```

Usuarios demo (clave `demo1234`): `ana@demo.ec` (quien pide), `carlos@demo.ec` (tutor/tecnología, Quito), `maria@demo.ec` (contadora, Guayaquil), `jose@demo.ec` (hogar/mandados), `lucia@demo.ec` (diseño/marketing, Cuenca).

### Asistente de IA

- **Sin `ANTHROPIC_API_KEY`** se usa un clasificador local por palabras clave. Funciona, pero es básico.
- **Con `ANTHROPIC_API_KEY`** se usa Claude Opus 5 con salida estructurada (esquema Zod), `effort: "low"` y `fallbacks: "default"`: si el modelo rechaza la solicitud, se reintenta en otro modelo del lado del servidor. Si la API falla, vuelve al clasificador local.
- Regla de negocio incluida: si piden "hazme la tarea", la IA lo reformula como tutoría y lo avisa en pantalla.

## Llevarlo a producción

1. **Base de datos**: en `prisma/schema.prisma` cambia el provider a `postgresql`. Instala `@prisma/adapter-pg` y `pg`, reemplaza `PrismaLibSql` por `PrismaPg` en `src/lib/db.ts` y `prisma/seed.ts`, y regenera las migraciones. Otra opción es mantener SQLite con Turso usando el mismo adapter libSQL.
2. **Deploy**: Vercel, Railway o Render. Define `DATABASE_URL`, `SESSION_SECRET` y `ANTHROPIC_API_KEY`.
3. **Pagos reales (Ecuador)**: reemplaza el escrow simulado en `acceptOffer` / `confirmCompletion` por una pasarela local: **PayPhone**, **Kushki**, **Datafast** o **PlacetoPay**. El patrón es cobrar al aceptar, retener y pagar al proveedor al confirmar (o usar split payments si la pasarela los soporta). Revisa con un contador la facturación electrónica del SRI por la comisión.

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
