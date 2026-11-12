# Seguridad y cumplimiento

Este documento resume cómo el código aborda los riesgos de OWASP, qué controles de ISO/IEC 27001 respalda y qué exige la normativa ecuatoriana. **Alcance honesto:** ningún código "cumple ISO" por sí solo. ISO/IEC 27001 certifica un sistema de gestión (políticas, riesgos, personas, proveedores, auditorías). Lo que sigue son los controles técnicos que la aplicación ya implementa y que ese sistema puede citar como evidencia.

## OWASP Top 10 (2021)

| Riesgo | Cómo se mitiga | Dónde |
|---|---|---|
| A01 Control de acceso | Cada servicio verifica dueño o participante; guardas de rol y de suspensión; el admin no publica ni oferta; 404 idéntico para "no existe" y "no es tuyo" | `server/auth/guards.ts`, `server/services/*` |
| A02 Fallos criptográficos | HTTPS con HSTS; bcrypt (12 rondas); número de cuenta y cédula cifrados con AES-256-GCM; tokens de recuperación guardados como hash | `server/infra/crypto.ts`, `services/accounts.ts` |
| A03 Inyección | Prisma parametrizado (el único SQL crudo usa parámetros); React escapa la salida; CSP con nonce; HTML de correos escapado; texto del usuario delimitado en los prompts de IA | `proxy.ts`, `infra/ai/*` |
| A04 Diseño inseguro | Transiciones de dinero condicionadas al estado, bloqueos de cuenta, libro contable que siempre suma cero; pruebas de concurrencia | `services/escrow.ts`, `tests/integration` |
| A05 Configuración | La app no arranca en producción sin la configuración segura; cabeceras de seguridad; sin `X-Powered-By`; seed bloqueado en producción | `server/config/env.ts`, `next.config.ts` |
| A06 Componentes vulnerables | `npm audit --omit=dev` en CI (0 vulnerabilidades a la fecha); versiones fijadas | `.github/workflows/ci.yml` |
| A07 Autenticación | Límite de intentos por cuenta e IP; respuesta igual y en tiempo constante exista o no el correo; sesiones revocables; recuperación con enlace de un solo uso (1 h); reautenticación para cambiar la cuenta bancaria; política de contraseñas (ASVS 2.1) | `services/accounts.ts`, `services/password-reset.ts` |
| A08 Integridad | Libro inmutable (correcciones con asientos inversos); comprobantes verificados por contenido, no por extensión; migraciones versionadas | `services/ledger.ts`, `infra/storage.ts` |
| A09 Registro y monitoreo | `AuditLog` de acciones de administración, dinero y cuenta (quién, qué, IP); logs JSON con datos sensibles redactados; `/api/health` | `services/audit.ts`, `infra/logger.ts` |
| A10 SSRF | El servidor no descarga URLs proporcionadas por usuarios | — |

Además:
- **Abuso y costos:** límites para publicar, ofertar, chatear, registrarse y usar el asistente con IA; aviso a proveedores acotado por solicitud.
- **Archivos:** lista blanca de tipos, firma de bytes, 5 MB, nombre generado por el servidor, bucket privado y descarga con `Content-Disposition: attachment` y CSP sandbox.
- **Robo de sesión:** cambio de cuenta bancaria con contraseña, aviso al usuario y retiros bloqueados 48 h.

## ISO/IEC 27001:2022, controles del Anexo A que el código respalda

| Control | Implementación |
|---|---|
| 5.15 Control de acceso | Roles USER/ADMIN, verificación de propiedad en cada servicio |
| 5.17 Información de autenticación | Hash bcrypt, política de contraseñas, recuperación segura |
| 5.34 Privacidad y protección de datos personales | Minimización, cifrado, exportación y eliminación (LOPDP) |
| 8.5 Autenticación segura | Límite de intentos, sesiones revocables, cookie httpOnly/Secure/SameSite |
| 8.8 Gestión de vulnerabilidades técnicas | Auditoría de dependencias en CI |
| 8.9 Gestión de la configuración | Validación de entorno al arrancar; secretos fuera del repositorio |
| 8.10 Eliminación de información | Anonimización al eliminar la cuenta; purga programada de registros |
| 8.12 Prevención de fuga de datos | Filtro de contactos; datos bancarios enmascarados; exportación sin datos bancarios completos |
| 8.15 Registro | `AuditLog` y logs estructurados |
| 8.24 Uso de criptografía | AES-256-GCM con clave dedicada y versión de formato para rotación |
| 8.25 / 8.28 Desarrollo y codificación seguros | Capas, validación centralizada, errores tipados, revisión OWASP |
| 8.29 Pruebas de seguridad | Pruebas de concurrencia y de reglas de negocio en CI |
| 8.31 Separación de entornos | Base de pruebas dedicada; pagos simulados y seed bloqueados en producción |
| 8.32 Gestión de cambios | Git, CI obligatoria, migraciones versionadas |

**Pendiente para una certificación** (organizacional, fuera del código): análisis de riesgos, políticas de seguridad, gestión de proveedores (Vercel, base de datos, R2, Resend, Anthropic), plan de respuesta a incidentes, copias de seguridad probadas, gestión y rotación de secretos, formación del personal y auditoría interna.

## ISO/IEC 25010 (calidad del producto)

- **Seguridad:** ver arriba.
- **Fiabilidad:** operaciones de dinero atómicas e idempotentes; trabajos programados que registran fallos sin detener la app.
- **Mantenibilidad:** arquitectura por capas, módulos pequeños con una responsabilidad, pruebas automatizadas.
- **Eficiencia:** índices en las consultas frecuentes, lotes acotados, trabajos fuera del render.
- **Portabilidad:** configuración por variables de entorno; PostgreSQL estándar; almacenamiento compatible con S3.

## Normativa ecuatoriana

| Norma | Cómo se atiende | Estado |
|---|---|---|
| **LOPDP** (Ley Orgánica de Protección de Datos Personales) | Política de privacidad con responsable, finalidades, bases legales, encargados, transferencias internacionales, conservación y derechos; consentimiento registrado (versión y fecha); descarga de datos; eliminación de cuenta; cifrado y control de acceso | Implementado. Pendiente: revisión legal, registro ante la autoridad y delegado de protección de datos si aplica |
| **Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos** | Identificación del proveedor (razón social, RUC, domicilio, contacto) en el pie y en los términos; aceptación expresa de los términos | Implementado; requiere los datos reales en las variables `LEGAL_*` |
| **Ley Orgánica de Defensa del Consumidor** | Precios y comisiones visibles antes de pagar; condiciones de reembolso y disputas; canal de reclamos | Implementado. Pendiente: revisión legal y confirmar el tratamiento del IVA en los precios |
| **SRI (facturación electrónica)** | — | **No implementado:** se requiere emitir comprobantes electrónicos por comisiones, créditos y planes |

Los textos legales están en `src/app/legal/*` y toman montos y plazos del código (comisiones, plazos de pago, sanciones), por lo que no se desactualizan si cambian esas reglas. **Deben ser revisados por un abogado antes de publicarse.**

## Reporte de vulnerabilidades

Escribe a la dirección configurada en `SUPPORT_EMAIL` con el asunto "Seguridad". No publiques el detalle hasta recibir respuesta.
