# Arquitectura

Pídelo es un monolito modular en Next.js 16: una sola aplicación desplegable, organizada en capas con dependencias en un solo sentido. Es la forma más simple de operar al volumen inicial, y deja cada módulo listo para separarse si alguno lo necesita.

## Capas

```
src/
  app/                    Presentación: páginas (Server Components) y server actions
    actions/              Adaptadores: leen el formulario → validan → llaman un servicio → traducen el resultado
  components/             Componentes de interfaz reutilizables
  domain/                 Reglas de negocio puras, sin acceso a datos ni a Next.js
    catalog.ts            Categorías, tipos, modalidades, ciudades, estados
    plans.ts              Planes, paquetes de créditos y cotización de cambios de plan
    policies.ts           Plazos, costos y umbrales (vencimientos, strikes, impulsos)
    money.ts              Centavos, comisión, cuentas del libro contable
    schemas.ts            Validación de toda entrada del usuario (zod)
    errors.ts             Errores de negocio tipados (mensaje seguro para el usuario)
    contact-filter.ts     Detección determinista de datos de contacto
  server/                 Solo servidor ("server-only")
    config/               Variables de entorno validadas, datos legales y de cobro
    db/                   Cliente Prisma y tipo de transacción
    auth/                 Sesión (cookie + tabla Session) y guardas de autorización
    http/                 Adaptador común de acciones (errores, validación)
    infra/                Correo, almacenamiento, IA, cifrado, límites de uso, logger
    services/             Casos de uso por área: pagos, escrow, retiros, solicitudes, ofertas,
                          chat, reseñas, cuentas, facturación, moderación, notificaciones, auditoría
    queries/              Lecturas compuestas para páginas (billetera, reputación, feed)
    jobs/                 Trabajos programados (cron)
  proxy.ts                CSP con nonce por request
```

Regla de dependencias: `app → server/services → server/infra, server/db → domain`. `domain` no importa nada del resto. Las páginas pueden leer directamente con Prisma para vistas simples; la lógica que escribe vive siempre en un servicio.

## Principios aplicados

- **Responsabilidad única:** cada servicio cubre un área del negocio; las acciones no contienen reglas, solo adaptan.
- **Abierto/cerrado:** canales de notificación (`NotificationChannel`), drivers de almacenamiento (local/S3) y límites de uso (`consume`) se extienden sin modificar a quien los usa.
- **Inversión de dependencias:** los servicios reciben el `Actor` (usuario autenticado) y datos ya validados; no leen cookies ni formularios, lo que permite probarlos sin Next.js.
- **Errores explícitos:** los servicios lanzan `AppError` con mensajes seguros; `runAction` los muestra y registra cualquier otro error sin exponer detalles.
- **Dinero:** centavos enteros, libro de doble entrada inmutable, transiciones de estado condicionadas (`updateMany` con el estado esperado) y bloqueos de cuenta (`pg_advisory_xact_lock`) para que ninguna operación se aplique dos veces.

## Escalabilidad

| Componente | Hoy | Cuando crezca |
|---|---|---|
| Aplicación | Sin estado, en serverless (Vercel): escala horizontalmente | Igual |
| Base de datos | PostgreSQL gestionado con pooler; índices para las consultas frecuentes | Réplicas de lectura para `queries/` |
| Sesiones | Tabla `Session` (una consulta indexada por request) | Caché en Redis si la latencia lo pide |
| Límites de uso | Tabla `RateLimitEvent` | Mismo contrato (`consume`) sobre Redis |
| Trabajos programados | Cron cada hora, en lotes acotados | Cola de trabajos (p. ej. Inngest, SQS) |
| Notificaciones | Bandeja interna, fan-out acotado a 200 por solicitud | Canales externos asíncronos por cola |
| Chat | Refresco periódico, últimos 200 mensajes | SSE/WebSockets (Pusher, Ably) |
| Archivos | Bucket privado S3/R2 | Igual |
| Pagos | Verificación manual de comprobantes | Webhook de pasarela → `confirmPayment` |

## Calidad

- TypeScript estricto, ESLint, pruebas unitarias e integración (Vitest) y CI en cada cambio.
- Logs estructurados en JSON con datos sensibles redactados (`server/infra/logger.ts`).
- Migraciones versionadas (`prisma/migrations`), nunca cambios manuales en producción.
