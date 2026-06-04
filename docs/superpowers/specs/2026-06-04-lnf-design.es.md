# LNF — Documento de Diseño (v1)

**Fecha:** 2026-06-04
**Estado:** Borrador, pendiente de revisión por las partes interesadas
**Autores:** Claude (redacción), Siyuan Hua (aprobador)

> Documento espejo en español del diseño v1. La versión en inglés [`2026-06-04-lnf-design.en.md`](./2026-06-04-lnf-design.en.md) es la fuente de verdad ante cualquier discrepancia. Diagramas, identificadores de código, nombres de tablas, claves SQL y nombres de campos permanecen en inglés.

## 0. Contexto

Este documento describe la arquitectura, el modelo de datos, los flujos de petición, el manejo de errores, las pruebas y los aplazamientos explícitos a Fase 2 para la **v1 de LNF** — un servicio que ayuda a devolver a sus cuidadores a personas vulnerables extraviadas (niños, personas con autismo o discapacidad intelectual, adultos con demencia) mediante ropa con etiquetas QR.

El alcance del producto, los roles de usuario y los criterios de aceptación se definen en:

- [`docs/requirements.en.md`](../../requirements.en.md) (inglés, fuente de verdad del producto)
- [`docs/requirements.es.md`](../../requirements.es.md) (español, paralelo)

Este documento describe **cómo** se construirá la v1. No reformula **qué** se construye ni **por qué**, salvo cuando es necesario para motivar una decisión de diseño.

Región de lanzamiento: LATAM. Línea base de privacidad: la LGPD de Brasil. Idiomas de UI: español (es) y portugués (pt-BR). Forma del equipo: una persona / equipo pequeño, MVP en semanas.

## 1. Arquitectura

### 1.1 Forma del sistema

```
                  ┌──────────────────────────────────────────┐
                  │            Caregivers (auth)             │
                  │   Expo mobile app   ↔   Next.js web      │
                  └──────────────┬───────────────────────────┘
                                 │  Hono RPC over HTTPS (typed)
                                 ▼
┌────────────────────────────────────────────────────────────┐
│                    apps/api (Hono on Node)                 │
│   routes:                                                  │
│     /partner/*    (partner portal + API)                   │
│     /tag/*        (caregiver scan/activate)                │
│     /find/*       (finder report + caregiver view)         │
│     /caregiver/*  (account, channels, history)             │
│     /f/:code      (public finder page, SSR via Next.js)    │
│   ─────────────────────────────────────────────────────    │
│   service modules:                                         │
│     • Auth (Better-Auth) for caregiver and partner users   │
│     • Tag codes (mint / lookup / activate / revoke)        │
│     • Find intake                                          │
│     • Escalation engine (state machine + worker)           │
│     • Notification dispatch (push/email/SMS/voice)         │
└────────┬──────────────────────────────────┬────────────────┘
         │                                  │
         ▼                                  ▼
   ┌──────────────┐                ┌────────────────────┐
   │  Postgres    │                │  Job queue         │
   │  (Drizzle    │◄───records─────│  Graphile Worker   │
   │   + PostGIS) │                │  (Postgres-backed) │
   └──────────────┘                └────────┬───────────┘
                                            │ outbound calls
                                            ▼
                              ┌─────────────────────────────┐
                              │ Expo Push │ Resend │ Twilio │
                              │   (push)  │ (mail) │SMS+voice│
                              └─────────────────────────────┘

                  ┌─────────────────────────────────────────┐
                  │     Finder (no install, no auth)        │
                  │   GET https://lnf.app/f/:code  →  form  │
                  └─────────────────────────────────────────┘

                  ┌─────────────────────────────────────────┐
                  │     Partner (auth)                      │
                  │   Portal (Next.js)  ↔  API (Bearer key) │
                  └─────────────────────────────────────────┘
```

### 1.2 Stack

| Capa | Elección | Justificación |
|---|---|---|
| Backend | **Hono** sobre Node | Pequeño, rápido, RPC tipado sin esfuerzo |
| Base de datos | **PostgreSQL + PostGIS + Drizzle ORM** | Residencia de datos en LATAM disponible; PostGIS para geo; Drizzle es SQL-first y más liviano que Prisma |
| Cola de trabajos | **Graphile Worker** | Respaldado por Postgres → sin infra adicional; misma frontera transaccional que el resto de los datos |
| Web | **Next.js (App Router)** | El SSR de la página del hallador es crítico (superficie pública rápida, render antes de que JS arranque) |
| Móvil | **Expo (React Native) + Expo Router** | Un único código → iOS + Android; OTA updates; mismo modelo mental de React que la web |
| Auth | **Better-Auth** | Auto-hospedable, agnóstico al framework, soporta correo+contraseña, social, magic-link |
| Validación | **Zod** en `packages/schemas` | Los mismos esquemas validan la frontera de la API, los formularios web y los formularios móviles |
| Push | **Expo Push Service** | Gratis; sin gestionar credenciales APNs/FCM por separado en MVP |
| Correo | **Resend** (o SES) | Proveedor detrás de una interfaz `Mailer`, intercambiable |
| SMS + voz | **Twilio** | Mejor cobertura LATAM; detrás de interfaces `Smser` / `Voicer` |
| Mapas (vista del cuidador) | **Por decidir — Google Maps Platform vs. MapLibre + OSM** | Pregunta abierta A2; afecta costos |
| Pruebas | **Vitest** (unitarias + integración), **Playwright** (E2E web), **Maestro** (smoke móvil) | ESM-nativo, rápido, baja flakiness |

### 1.3 Estructura del repositorio

```
apps/
  api/        # Hono server — exports an AppType for RPC
  web/        # Next.js — public finder page + caregiver web fallback + partner portal
  mobile/     # Expo — caregiver app
packages/
  schemas/    # Zod schemas shared across all clients + server
  api-client/ # Hono RPC wrapper, tree-shakeable
  ui/         # Shared React primitives usable by web (and React Native via NativeWind, if needed)
  config/     # eslint/tsconfig/tailwind base configs
docs/         # requirements.en.md, requirements.es.md, this spec
```

Los contratos de la API viven en `packages/schemas`, nunca duplicados por cliente.

### 1.4 Convenciones

- **El servidor es la fuente de verdad de las reglas de negocio.** Los clientes renderizan y envían; no calculan. El cliente móvil es deliberadamente "ligero" — sin lógica de pricing, escalamiento ni máquinas de estado en el dispositivo.
- **Todos los tipos compartidos provienen de Zod.** Sin DTOs escritos a mano.
- **Hono RPC, no fetch wrappers a mano.** `import type { AppType } from '@app/api'` en el cliente entrega rutas tipadas sin codegen.
- **Las migraciones de Drizzle se versionan en git.** Nunca se edita una migración ya mergeada.
- **Los dispatchers de notificación son enchufables.** Cada canal implementa `send(payload) → {messageId, status}`. El motor de escalamiento habla con la interfaz, no con Twilio directamente.

### 1.5 Piezas fuera del proceso (NO en v1)

- Canal WhatsApp
- Etiquetas para objetos / activos
- Señal en tiempo real "el cuidador va en camino"
- UI de operador multi-tenant como producto

Tratadas en §6.

## 2. Modelo de datos

### 2.1 Resumen entidad-relación

```
partner ──┬── 1..N ── partner_user
          ├── 1..N ── partner_api_key
          ├── 1..N ── tag_batch ── 1..N ── tag

caregiver ──┬── 1..N ── protected_person ──┬── 0..N ── tag (after activation)
            │                              └── 0..N ── find ──┬── 1..N ── location_sample
            │                                                 └── 1..N ── notification_attempt
            ├── 1..N ── notification_channel
            └── 1..N ── device

audit_event (caregiver_id, partner_id, find_id — all nullable)
spend_ledger (per caregiver, per day, per kind)
```

### 2.2 Máquinas de estado

**`tag.state`** (monotónica hacia adelante):
```
unactivated  →  active  →  revoked
```
Sin reactivación. Sin transferencia en v1.

**`find.status`**:
```
reported ──► acknowledged ──┬──► claimed ──► resolved
                            ├──► resolved        (skip claimed)
                            └──► false_positive
reported ──► expired       (terminal from reported only)
```
`claimed` es opcional — el cuidador puede ir directamente de `acknowledged` a `resolved`. No existe `unclaim`.

### 2.3 Tablas

#### `partner`
- `id` (uuid, pk), `name`, `billing_email`, `status` (`active` | `suspended`), `settings` (jsonb — reservado para temas en Fase 2), `created_at`, `deleted_at`.

#### `partner_user`
- `id`, `partner_id` (fk), `email` (único), `role` (`admin` | `member`), `created_at`, `deleted_at`.

#### `partner_api_key`
- `id`, `partner_id` (fk), `key_prefix` (visible, indexado), `key_hash` (bcrypt), `label`, `last_used_at`, `created_at`, `revoked_at`.

#### `tag_batch`
- `id`, `partner_id` (fk), `size`, `label`, `created_at`, `csv_token_hash`, `csv_token_expires_at`, `csv_downloaded_at` (nullable).

#### `tag`
- `id`, `code` (único, indexado; ~22 chars base32), `partner_id` (fk, NOT NULL), `batch_id` (fk, NOT NULL), `state` (enum), `protected_person_id` (fk, nullable), `caregiver_id` (fk denormalizado, nullable), `label` (nullable), `activated_at` (nullable), `revoked_at` (nullable).
- `caregiver_id` está denormalizado para acelerar el camino caliente del escaneo; `protected_person.caregiver_id` sigue siendo la fuente de verdad para transferencias (no soportadas en v1).

#### `caregiver`
- `id`, `email` (único, nullable hasta que se promueva desde anónimo), `phone` (nullable), `name`, `preferred_locale` (`es` | `pt-BR` | `en`), `is_anonymous` (bool), `created_at`, `deleted_at` (soft-delete).

#### `device`
- `id`, `caregiver_id` (fk), `platform` (`ios` | `android`), `expo_push_token` (único), `last_seen_at`.

#### `notification_channel`
- `id`, `caregiver_id` (fk), `protected_person_id` (fk, nullable; nullable significa default para la cuenta), `kind` (`push` | `email` | `sms` | `voice`), `target` (token / dirección / e164), `verified_at` (nullable), `priority` (int, 0 = primero), `escalation_delay_seconds` (int), `is_active`.

#### `protected_person`
- `id`, `caregiver_id` (fk), `private_nickname`, `public_note` (≤200 chars), `created_at`, `archived_at` (nullable).
- v1 no carga campos de nombre, foto ni datos médicos. Fase 2.

#### `find`
- `id`, `tag_id` (fk), `status` (enum), `reported_at`, `acknowledged_at` (nullable), `claimed_at` (nullable), `resolved_at` (nullable), `expired_at` (nullable), `finder_fingerprint` (hash de dispositivo/IP — para forensia, no para rate-limiting en v1), `finder_message` (≤500 chars), `finder_contact` (nullable, texto libre), `initial_location_text`, `initial_location_geo` (PostGIS point), `initial_location_accuracy_m`, `is_collapsed_into` (fk a otro `find.id`, nullable; se setea cuando este hallazgo fue un escaneo de seguimiento dentro de la ventana de colapso de 5 min por etiqueta — ver §4.2 #10).

#### `location_sample`
- `id`, `find_id` (fk), `recorded_at`, `geo`, `accuracy_m`, `received_at`.
- Append-only, indexado `(find_id, recorded_at)`. Hard-delete a las 24 h tras la terminación del hallazgo padre.

#### `notification_attempt`
- `id`, `find_id` (fk), `channel_kind`, `channel_target`, `attempted_at`, `provider_message_id`, `delivery_status` (`queued` | `sent` | `delivered` | `failed`), `failure_reason`, `cost_minor_units`, `ack_link_expires_at` (nullable; null para canales `push` / `voice` que no llevan enlace), `ack_link_used_at` (nullable; se setea cuando el enlace de ack de este intento se usa con éxito).

#### `spend_ledger`
- `id`, `caregiver_id`, `day` (date), `kind` (`sms` | `voice`), `cost_minor_units`, `country_code`.
- Agregado diario; verificado just-in-time en el momento del envío.

#### `audit_event`
- `id`, `caregiver_id` (nullable), `partner_id` (nullable), `find_id` (nullable), `kind`, `payload` (jsonb), `at`.
- Kinds: `find.created`, `find.acknowledged`, `find.claimed`, `find.resolved`, `find.false_positive`, `find.expired`, `tag.activated`, `tag.revoked`, `partner.batch.minted`, `partner.batch.csv_downloaded`, `partner.api_key.created`, `partner.api_key.revoked`, `caregiver.exported_data`, `caregiver.deleted_account`.
- **Convención de esquema del payload (S1-5):** `payload` es un blob append-only que lleva un campo de nivel superior `v` (entero, versión del payload). Las formas por kind viven en `packages/schemas/audit/<kind>.v<N>.ts` para que las formas históricas estén versionadas junto al código en lugar de vivir implícitamente en filas viejas. Los lectores (export de acceso del titular LGPD §4.5 #44, dashboards de operador) DEBEN tolerar campos desconocidos y campos antes-requeridos-pero-ahora-faltantes, y DEBEN manejar todo `v` que encuentren (o caer a un dump genérico). Cuando una forma de payload evoluciona, se incrementa `v` y se agrega un nuevo archivo de esquema; nunca se edita una versión publicada.

### 2.4 Índices

- `tag(code)` único — el camino de lectura más caliente (sub-milisegundo).
- `tag(partner_id, batch_id, state)` — analítica de partner.
- `tag(caregiver_id)` parcial `WHERE caregiver_id IS NOT NULL` — vista "mis etiquetas" del cuidador.
- `find(tag_id, reported_at desc)` — vista de historial del cuidador.
- `find(status, reported_at)` — el worker de escalamiento escanea escalamientos pendientes y hallazgos vencidos.
- `location_sample(find_id, recorded_at)` — patrón de lectura de la suscripción de tracking en vivo y el job de limpieza.
- `notification_channel(caregiver_id, protected_person_id, priority)` — búsqueda rápida del próximo canal.
- `partner_api_key(key_prefix)` — ruteo rápido para requests entrantes a la API.

### 2.5 Retención y borrado

- **Historial de hallazgos:** retenido indefinidamente en v1 (sin job de anonimización). El historial visto por el cuidador es permanente hasta el borrado de cuenta.
- **`location_sample`:** hard-delete a las 24 h tras terminación del hallazgo padre (`resolved` / `expired` / `false_positive`). Configurable por operador.
- **`audit_event`:** retenido 24 meses por defecto. Configurable por operador.
- **Soft-delete del cuidador:** `caregiver.deleted_at` se enciende a pedido del usuario. 14 días de gracia (recuperable). El hard-delete en cascada borra todas las filas propiedad del cuidador; `audit_event.caregiver_id` se anonimiza a NULL en lugar de borrarse.
- **`location_sample`** siempre hace hard-delete por su política propia, sin importar el estado del cuidador.

### 2.6 Cosas deliberadamente fuera del modelo

- **Sin tablas de "session" ni "rate-limit".** Las sesiones de auth viven en las tablas de Better-Auth; los rate limits (cuando se agreguen en Fase 2) van en una tabla `rate_limit_bucket` separada o en advisory locks.
- **Sin tabla "finder".** Los halladores son anónimos y efímeros; su huella es una columna en `find`.
- **Sin tabla "garment" separada de `tag`.** Son 1:1 conceptualmente.
- **Sin tablas de `payment` / `subscription`.** El cobro a partners es pregunta abierta y módulo de Fase 2.
- **Sin tabla SKU / product.** Los partners corren su propio comercio; LNF solo ve el código.

## 3. Flujo de datos

Cinco flujos: el partner genera lote, el cuidador escanea, el cuidador activa, el hallador reporta, escalamiento, tracking en vivo.

### 3.1 Flujo 0 — El partner genera un lote

```
[Partner portal session]   OR   [Partner backend, with API key]
        │                                │
        └────────► POST /partner/batches ◄──┘
                   body: { size, label? }
                   auth: portal session  OR  Authorization: Bearer <api_key>
                                              + HMAC of body for replay protection
                          │
                          ▼
              [apps/api: POST /partner/batches]
                  1. authn → partner_id
                  2. validate (size ≤ MAX_BATCH = 100k)
                  3. INSERT tag_batch
                  4. generate `size` CSPRNG codes (base32, 22 chars,
                     uniqueness retry up to 8 attempts per code)
                  5. INSERT tag rows (state=unactivated) ×size in chunked txns
                  6. mint single-use csv_token; INSERT csv_token_hash on tag_batch
                  7. emit audit_event(partner.batch.minted)
                  8. respond 201 with: { batchId, downloadUrl, expiresAt }
                          │
                          ▼
              [Partner downloads CSV — separate request]
                   GET /partner/batches/:id/codes.csv?token=<one-shot>
                          │
                          ▼
                   server validates token (constant-time hash compare)
                   marks tag_batch.csv_downloaded_at
                   streams CSV: code (one per line, no headers)
                   emit audit_event(partner.batch.csv_downloaded)
```

El CSV es de un solo uso por defecto; la re-emisión requiere acción del operador (auditada), no es un botón self-serve para el partner.

### 3.2 Flujo A — El teléfono escanea `https://lnf.app/f/<code>`

```
[Phone scans QR]
        │
        ├─ App installed (universal link / Android App Link)?
        │
        ├── yes → mobile app receives the URL
        │           │
        │           ▼
        │      app calls GET /tag/:code (caregiver-authed)
        │      response: { state, ownership ∈ {unowned, self, other} }
        │           │
        │           ┌───────────────┬──────────────┬──────────────┐
        │           ▼               ▼              ▼              ▼
        │     state=unactivated   state=active   state=active   state=revoked
        │     ownership=unowned   ownership=self ownership=other (any ownership)
        │           │               │              │              │
        │           ▼               ▼              ▼              ▼
        │     activation flow    info screen    finder flow    "tag is no
        │     (see 3.3)         (revoke /      (in-app surface  longer active"
        │                        relabel)      using finder
        │                                      web semantics)
        │
        └── no → Next.js public route /f/[code] (SSR)
                   │
              GET /api/tag/:code/public
              response: { state }   (NO ownership info to public)
                   │
              ┌────┴───────────────┬────────────────────┐
              ▼                    ▼                    ▼
            unactivated          active                revoked
              │                    │                    │
              ▼                    ▼                    ▼
        "Install the app   render finder form    "tag is no longer
         to activate"     (see 3.4)               active"
         + store links
```

Los caminos `unactivated` y `revoked` registran un `audit_event` ligero para analítica del lado partner (señales de robo / pérdida en tránsito), pero no crean hallazgos.

### 3.3 Flujo B — El cuidador activa una etiqueta

```
[Mobile app, after scan, sees state=unactivated, ownership=unowned]
        │
        ▼
   "Activate this tag" screen:
     • pick existing protected_person   OR   create one
     • optional public note (≤200 chars)
     • garment label
     • notification channels (with verification gates for SMS/voice)
        │
        ▼
   POST /tag/:code/activate
     body: { protectedPersonId, label }
     auth: caregiver session
        │
        ▼
   Server (single transaction):
     1. SELECT tag FOR UPDATE WHERE code=:code AND state='unactivated'
     2. assert protected_person.caregiver_id == session.caregiver_id
     3. assert ≥ 1 active+verified notification_channel resolves for this
        protected_person (per-person channel OR account-default channel
        with verified_at IS NOT NULL); 422 otherwise
     4. UPDATE tag SET state='active',
                       protected_person_id=:pid,
                       caregiver_id=session.caregiver_id,
                       label=:label,
                       activated_at=now()
     5. emit audit_event(tag.activated)
     6. respond { tag }
```

`SELECT … FOR UPDATE` previene carreras de activación entre dos cuidadores; el perdedor recibe 409.

> **Invariante "al menos un canal" (S1-2):** la activación es rechazada con 422 si no se resuelve ningún canal de notificación verificado para la persona protegida. Sin esta puerta, un hallazgo sobre una etiqueta sin canales tendría una lista de canales vacía en el paso 0, avanzaría inmediatamente por la cadena `escalate_find` con cero intentos y terminaría como `expired` — falla silenciosa sin señal al cuidador. La UI de activación lo presenta como "Agregue al menos un canal de notificación antes de activar esta etiqueta" y enlaza a la configuración de canales.

### 3.4 Flujo C — El hallador reporta

```
[Finder fills form on /f/[code], submits POST /api/find]
     body: { code, locationGeo? , locationText?, message?, contact? }
     ▼
[apps/api: POST /find]
     1. validate Zod schema
     2. resolve code → tag (state must be 'active')
     3. INSERT find (status=reported)
     4. INSERT audit_event(find.created)
     5. enqueue job: escalate_find(find.id, 0)
     ▼
[Respond 200 with find_token (signed JWT, find_id-scoped, 60-min ttl)]
     ▼
[Page renders confirmation + "Share live location" opt-in]
```

La creación del hallazgo y el encolado del escalamiento están en **una sola transacción de Postgres** (Graphile Worker está respaldado por Postgres). No existe un camino donde el hallazgo quede commiteado y el job no.

> **Nota de implementación (S1-1):** esta garantía de atomicidad solo se sostiene si `addJob` se invoca con el mismo cliente que el INSERT del hallazgo, p. ej.
> `await workerUtils.addJob('escalate_find', { findId, step: 0 }, { withPgClient: tx })`.
> Usar el pool por defecto de Graphile Worker commitea el job fuera de banda y rompe la garantía silenciosamente. La prueba de integración en §5.1 L3 ("Find creation atomicity") asserta esto inyectando una falla de encolado y verificando que la fila del hallazgo se haga rollback.

El `find_token` es la única credencial que tiene el hallador — usada para autorizar muestras de ubicación en vivo solo para este hallazgo.

### 3.5 Flujo D — Máquina de estado del escalamiento

```
                    ┌─────────────────────────────────────┐
                    │  job: escalate_find(find_id, step)  │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
                    Re-read find. Is status still 'reported'?
                          ack'd     │     still reported
                          ┌─────────┴────────┐
                          ▼                  ▼
                    [ STOP, no-op ]    Load active channels
                                       for protected_person
                                       ordered by priority
                                            │
                                            ▼
                                  Channel at index `step` exists?
                                       │  yes              │  no
                                       ▼                   ▼
                              Spend cap OK?        status=expired
                                  │  yes  │  no    audit_event
                                  ▼       ▼        surface in app
                              dispatch    log notification_attempt
                              via         (failure_reason='spend_cap')
                              provider          │
                                  │             ▼
                                  ▼      re-enqueue at step+1, delay=0
                              insert notification_attempt(sent)
                                  │
                                  ▼
                              enqueue escalate_find(find_id, step+1)
                              with delay = channel.escalation_delay_seconds
```

Propiedades:
- **Idempotente:** cada invocación del job re-lee `find.status`; un ack entre pasos → el siguiente job no hace nada.
- **El acuse de recibo es una escritura, no un callback:** toque de push, enlace de correo, enlace de SMS y tecla de voz, todos pegan a `POST /find/:id/ack` con un HMAC firmado contra el `notification_attempt.id` específico. Para correo y SMS específicamente (enlaces enviados por canales que no controlamos), el enlace es de un solo uso y expira a las 24 horas (S1-4): el endpoint de ack rechaza cuando `ack_link_used_at IS NOT NULL` o `now() > ack_link_expires_at`. Push y voz no llevan enlaces compartibles y no están sujetos a esta verificación.
- **Los retrasos son por canal y por cuenta:** `notification_channel.escalation_delay_seconds` en el canal `N` significa "esperar este tiempo *después* de despachar el canal N antes de invocar al canal N+1." El primer canal siempre dispara inmediatamente. Propuesta por defecto (alineada con los 2 / 5 / 5 minutos del documento de requerimientos): `push.delay=120` (push dispara inmediato, luego 2 min de espera para correo), `email.delay=300` (5 min de espera para SMS), `sms.delay=300` (5 min de espera para voz), `voice.delay=0` (último canal, ignorado). Configurable por operador.
- **El tope de gasto se verifica just-in-time** en el envío, no al programar.
- **Sin reintentos por canal ante 5xx del proveedor:** el worker procede al siguiente paso inmediatamente. Ahorra dinero en envíos duplicados.
- **Condiciones de parada:** `find.status` ≠ `reported`; o no quedan más canales (→ `expired`).

### 3.6 Flujo E — Tracking en vivo

```
[Finder confirmation page]
     │ taps "Share live location"
     │ browser geolocation prompt
     ▼
[Service Worker registered]
     │ watchPosition() callback fires every ~5–15 s
     ▼
[POST /find/:id/location  with bearer find_token]
     │ body: { recordedAt, lat, lng, accuracyM }
     │ keepalive: true
     ▼
[apps/api]
     │ verify find_token, scope to find_id
     │ guard: find.status ∈ {reported, acknowledged, claimed}
     │       AND now() - cap_anchor < 60 min
     │       (cap_anchor = claimed_at if claimed_at, else reported_at)
     │ INSERT location_sample
     │ broadcast to caregiver SSE subscribers
     ▼
[Caregiver app]
     │ subscribed via SSE: GET /find/:id/stream  (caregiver-authed)
     │ receives newline-delimited JSON of new samples
     │ renders moving pin + trail on map view
```

Fuentes de parada: el hallador toca Detener, el cuidador marca como resuelto, vence el tope de 60 min (se reinicia con `claimed`). Las tres cierran el stream SSE desde el lado del servidor.

SSE elegido sobre WebSocket: solo servidor → cliente, sin upgrade de protocolo, se lleva bien con HTTP/2, fácil de pasar por reverse-proxy.

EventSource reconecta automáticamente con `Last-Event-ID`; reproducimos las muestras perdidas desde ese ID, o enviamos solo la última más un evento "reconnected" si la brecha es > 60 s.

### 3.7 Transversal: rate limits y analítica

- **Rate limits por partner** sobre `POST /partner/batches`: pequeños (p. ej., 10/hora) por clave. Almacenados en advisory locks o una pequeña tabla `rate_limit_bucket`.
- **Sin rate limits del lado del hallador en v1.** Aplazado a Fase 2 (§6 A9).
- **Analítica de escaneos sobre etiquetas no activadas:** los escaneos a etiquetas `unactivated` registran solo `finder_fingerprint` (sin IP), retención acotada a una ventana corta. Se exponen al partner como señal de robo.

## 4. Manejo de errores y casos borde

Manejo concreto de modos de falla. Agrupados por superficie.

### 4.1 Generación y activación de etiquetas

| # | Escenario | Manejo |
|---|---|---|
| 1 | Colisión de código durante el mint | Reintento ante violación de unicidad hasta 8 veces por código; al agotarse, abortar el lote con 500. Falla ruidosamente si la fuente de entropía está rota. |
| 2 | El partner pierde el CSV | Descarga de un solo uso por defecto. Re-emisión solo por acción del operador (auditada). Ventana de re-emisión por defecto: 7 días. |
| 3 | La URL de descarga del CSV se filtra públicamente | El token es de un solo uso y expira a 24 h. Tras la descarga, el token queda invalidado. Aún si la URL se filtra, no le da nada al atacante. Los códigos están sin activar hasta que una cuenta de cuidador los reclama. |
| 4 | Dos cuidadores compiten por el mismo código | `SELECT … FOR UPDATE`. El perdedor → 409 con mensaje claro. |
| 5 | Cuidador escanea la etiqueta de un amigo | La app obtiene `state=active, ownership=other` → enruta al flujo del hallador. Conducta correcta, sin diálogo especial. |
| 6 | Cuidador intenta activar una etiqueta `revoked` | 410. UI: "Esta etiqueta fue revocada y no se puede reactivar." Reactivación deliberadamente no soportada. |
| 7 | Cuidador activa contra una `protected_person` que pertenece a otra cuenta | 403. El endpoint asserta `protected_person.caregiver_id == session.caregiver_id`. |
| 8 | Escaneo masivo de códigos no activados (robo en bodega) | Contador por lote sobre escaneos no activados; alerta al operador si > 5 en 24 h en un solo lote. No se autorrevoca. |
| 8a | El cuidador revoca por error su propia etiqueta activa y quiere deshacer (S1-3) | v1: no auto-recuperable. La máquina `tag.state` es monotónica hacia adelante (`unactivated → active → revoked`) por elección deliberada, así que no hay undo en la app. La acción de revocar muestra un diálogo de confirmación ("Esto no se puede deshacer. Compre una etiqueta nueva para la misma prenda si es necesario.") para hacer explícita la irreversibilidad. El operador puede cambiar manualmente a `state='active'` para casos de soporte (auditado). Fase 2: ventana corta de undo (p. ej., 60 s) sobre la acción de revocar. |

### 4.2 Reporte del hallador

| # | Escenario | Manejo |
|---|---|---|
| 9 | El hallador hace spam-scan sobre la misma etiqueta activa | **Sin rate-limiting del lado cliente en v1** (§6 A9). La ventana de colapso de escalamiento por etiqueta (#10) previene N pushes. |
| 10 | Ráfaga de halladores con huellas distintas sobre la misma etiqueta | Colapso global por `tag`: cuando hay un `find` para la etiqueta en estado `reported`/`acknowledged`/`claimed` y < 5 min de antigüedad, los envíos adicionales crean nuevas filas `find` pero se marcan con `is_collapsed_into = <find_id existente>` y NO encolan una nueva cadena de escalamiento. La UI del cuidador los presenta bajo el hallazgo abierto como "3 personas reportaron esto en los últimos 4 minutos". |
| 11 | El hallador envía sin GPS *y* sin ubicación escrita | 400 del lado servidor; el cliente además bloquea el submit hasta que al menos uno se complete. |
| 12 | Hallador malicioso reporta una ubicación falsa | Confiamos en la señal; la marca de `false_positive` del cuidador registra la huella para forensia. |
| 13 | El GPS del navegador devuelve precisión muy baja | Se almacena tal cual; la UI muestra el radio de precisión. No descartamos en silencio. |
| 14 | El hallador cierra el navegador a mitad del envío | Una sola transacción; o el hallazgo existe y la cadena arranca, o no. Sin medio-hallazgos. |
| 15 | `POST /find` exitoso pero falla el encolado | Atómico — ambas escrituras en la misma tx de Postgres. Camino imposible. |

### 4.3 Escalamiento y notificación

| # | Escenario | Manejo |
|---|---|---|
| 16 | El cuidador acusa por push mientras el SMS está en envío | Worker idempotente; el SMS en vuelo al proveedor no se puede cancelar pero un SMS redundante es aceptable. |
| 17 | Token de push viejo (`DeviceNotRegistered`) | Marcar `device.expo_push_token` inválido; avanzar al siguiente canal **sin retraso**. |
| 18 | Hard-bounce de correo (webhook de Resend) | `notification_attempt.delivery_status='failed'` actualizado post-hoc. Canal **no se autodeshabilita**; en su lugar se muestra una advertencia en la app del cuidador. |
| 19 | 5xx del proveedor SMS | Logueado como failed; avanza inmediatamente. Sin reintento al proveedor. |
| 20 | Tope de gasto alcanzado a mitad de cadena | Canal saltado, intento logueado con `failure_reason='spend_cap'`, la cadena procede sin retraso. |
| 21 | Llamada de voz contestada, sin tecla presionada | TTS termina, cuelga, `delivery_status=delivered`, sin ack. La cadena continúa. |
| 22 | El cuidador hace clic al enlace "Acuse de recibo" del correo desde un navegador de escritorio | Ruta pública firmada con HMAC sobre `notification_attempt.id`. Setea `find.acknowledged_at`, muestra una página mínima "Listo". No hace falta deep-link. |
| 23 | Enlace de correo reenviado / clickeado dos veces | De un solo uso por `notification_attempt`: el primer clic setea `ack_link_used_at` y `find.acknowledged_at`. El segundo clic ve `ack_link_used_at IS NOT NULL` → 410 con una página amable de "Ya fue confirmado desde otro canal/clic". (Antes documentado como respuesta idempotente; ajustado por S1-4 para reducir la superficie de ataque por replay.) |
| 23a | Enlace de ack de correo/SMS filtrado a un tercero (S1-4) | El `ack_link_expires_at` del enlace es por defecto 24 h tras el intento. Tras la expiración, el endpoint de ack devuelve 410 sin importar la validez del HMAC. Combinado con `ack_link_used_at` (#23), un enlace interceptado-pero-no-usado muere en 24 h; un enlace interceptado-y-usado no puede acusar un hallazgo futuro. |
| 24 | Ack de voz: tecla equivocada presionada | TTS permite hasta 3 intentos; al fallar, la llamada termina sin ack y la cadena continúa. |
| 25 | Webhook de Twilio llega 30 min tras la entrega | Solo actualización de observabilidad. No influye en el escalamiento. |
| 26 | Dos hallazgos concurrentes sobre la misma etiqueta | Dos cadenas paralelas; el cuidador puede recibir dos pushes (halladores distintos, ambos relevantes). El colapso de 5 min (#10) solo suprime hallazgos *adicionales* dentro de la ventana, no concurrentes independientes. |
| 27 | El proceso del worker muere a mitad del paso | Graphile Worker mantiene un row-level lock; al crashear, el lock se libera tras un timeout y otro worker lo retoma. La idempotencia hace seguro re-ejecutar. |
| 28 | Skew de reloj entre worker y DB | Los retrasos se programan relativos al tiempo de la DB (`run_at`), no al wall-clock del worker. |

### 4.4 Tracking en vivo

| # | Escenario | Manejo |
|---|---|---|
| 29 | El hallador pierde la red durante el stream | `keepalive: true` + retry-on-failure (backoff pequeño, máx 3). Las muestras fallidas se descartan (sin cola local). UI: "Última actualización hace 47s"; el pin se opaca tras un umbral de 60 s. |
| 30 | iOS Safari pone la pestaña en segundo plano | `watchPosition` con throttle / pausado. UX: "Compartición pausada — vuelva a esta página para reanudar." |
| 31 | El hallador revoca el permiso de geolocalización del navegador | Callback de error de `watchPosition` → mensaje en UI → `DELETE /find/:id/location` invalida el lado de streaming del `find_token`. |
| 32 | `find_token` expirado pero la página sigue abierta | Cada POST de muestra verifica; en 401/403 el cliente detiene limpiamente. |
| 33 | El cuidador marca como resuelto mientras el hallador transmite | El servidor rechaza la siguiente muestra con 410. UI cliente: "El cuidador marcó esto como resuelto." |
| 34 | Vence el tope del stream (60 min) | El servidor deja de aceptar muestras; misma UX que #33. |
| 35 | El hallador comparte pero no se mueve | Pin estable. Sin caso especial. |
| 36 | El cuidador abre el hallazgo antes de cualquier muestra | "Ubicación en vivo aún no disponible." o "Ubicación en vivo no compartida." |
| 37 | Dos halladores transmitiendo para hallazgos separados sobre la misma etiqueta | Cada hallazgo tiene su propio stream; el cuidador los ve como pantallas de detalle separadas (Fase 2: fusión sobre un mapa). |
| 38 | Reconexión SSE del cuidador | Auto-reconnect de EventSource con `Last-Event-ID`; replay o evento "reconnected". |

### 4.5 Autenticación y sesiones

| # | Escenario | Manejo |
|---|---|---|
| 39 | El cuidador anónimo pierde el teléfono | Los datos se perdieron. El onboarding advierte: "Agregue un correo o perderá acceso si cambia de teléfono." El opt-in a SMS/voz fuerza creación de cuenta. |
| 40 | El cuidador inicia sesión en un segundo dispositivo | Better-Auth emite una sesión nueva; nueva fila de device; ambos dispositivos reciben push. |
| 41 | API key del partner comprometida | El operador revoca (`partner_api_key.revoked_at`). Todos los requests en vuelo son rechazados en la siguiente verificación (hash verify por request, no cacheado). Auditoría de qué etiquetas se generaron con esa clave; el operador decide si revocar el lote completo. |
| 42 | Cuenta del portal de partner comprometida | Recuperación estándar por reset por correo. Soporte de revocación por lote. |
| 43 | El cuidador quiere borrar su cuenta (derecho de supresión LGPD) | Soft-delete + 14 días de gracia; hard-delete en cascada. `audit_event.caregiver_id → NULL` para retener historial operativo sin retener a la persona. |
| 44 | El cuidador solicita exportación de datos (acceso del titular LGPD) | Job asíncrono ensambla un bundle JSON, envía un enlace firmado por correo. Mismo patrón de un solo uso y expirable que el CSV de partner. |

### 4.6 Retención y limpieza de datos

| # | Escenario | Manejo |
|---|---|---|
| 45 | Retención de `location_sample` | Limpieza diaria: borrar donde el hallazgo padre terminó hace > 24 h. Configurable por operador. |
| 46 | Filas `find` por encima de la retención | **Retenidas indefinidamente en v1** (por decisión de producto). El historial visto por el cuidador es permanente hasta el borrado de cuenta. |
| 47 | Retención de `audit_event` | 24 meses por defecto. Configurable por operador. |
| 48 | Etiquetas `unactivated` rancias de lotes que nunca se enviaron | Sin auto-expiración. El operador puede revocar un lote completo a pedido del partner. |
| 49 | El job de limpieza falla a mitad | Idempotente; la corrida del día siguiente continúa. Métrica sobre filas borradas; alerta cuando es cero y se esperaban > 0. |

### 4.7 Cosas que aceptamos explícitamente

Estos modos de falla *no* se ingenierian alrededor en v1:

- Cuidador en modo avión que pierde todos los intentos de push — correo/SMS/voz lo alcanzan al reconectarse.
- Hallador falsificando una ubicación — el cuidador decide qué hacer; verificaciones de geofence aplazadas.
- Atacante determinado scrapeando páginas del hallador — los códigos son no-adivinables; cada escaneo solo revela el estado de la etiqueta, sin información de la persona protegida.
- Partner que mintea intencionalmente y nunca imprime — quema su propia cuota; el rate-limit de mint previene fan-out.
- Throttling de geolocalización en iOS Safari — restricción documentada, UX "Tocar para reanudar". Una app nativa para hallador es conversación de Fase 2.

## 5. Pruebas

### 5.1 Capas

**L1 — Snapshots de esquema Zod.** `packages/schemas/__tests__/contracts.snapshot.test.ts`. Cada tipo de frontera pública tiene snapshot de su serialización JSON-schema. Las fronteras de privacidad (`find.public.schema.json` vs. `find.private.schema.json`) son snapshots explícitos para que cualquier filtración sea ruidosa en revisión.

**L2 — Pruebas unitarias (Vitest).** Las máquinas de estado (`tag.state`, `find.status`) se prueban directamente. Los dispatchers de notificación se prueban vía proveedores fake. El worker de escalamiento se prueba con un reloj mockeado — sin esperas reales.

Casos concretos:
- Acuse antes del paso 2 → el paso 2 no hace nada.
- Todos los canales se agotan → `find.status='expired'`.
- Tope de gasto en SMS → intento de SMS logueado como failed, voz se intenta inmediatamente.
- Token de push `DeviceNotRegistered` → correo se intenta sin retraso.

**L3 — Pruebas de integración (Vitest + testcontainers).** Postgres real por archivo de test, migraciones reales, Drizzle real, cliente de tests de Hono (sin HTTP).

Casos críticos:
- Carrera de activación: dos `POST /tag/:code/activate` concurrentes → exactamente un 200, el otro 409, estado de la fila consistente.
- Atomicidad de creación del hallazgo: inyectar falla del encolado → `find` con rollback.
- Idempotencia del acuse de recibo: mismo enlace de ack por correo dos veces → seteado una vez, segundo retorna la misma respuesta.
- Acceso entre cuentas: cuidador A pide hallazgo del cuidador B → 404 (no 403 — no revelar existencia).
- Etiqueta revocada: `POST /find` contra revocada → 410, sin fila, sin encolado.
- Auth de muestra en vivo: `POST /find/:id/location` con token de un hallazgo *distinto* → 403.

**L4 — E2E web (Playwright).** Una sola prueba: camino feliz completo de escaneo a acuse de recibo en la página pública del hallador, contra backend real con fakes de Twilio/Resend/Expo Push.

**L5 — Smoke móvil (Maestro).** Dos flujos: activación de etiqueta, acuse de push.

### 5.2 Qué se fakea vs. real

| Capa | DB | Twilio | Resend | Expo Push | Tiles de mapa |
|---|---|---|---|---|---|
| L1 schema | — | — | — | — | — |
| L2 unit | stub | fake | fake | fake | — |
| L3 integration | **real** | fake | fake | fake | — |
| L4 web E2E | real | fake | fake | fake | — |
| L5 mobile smoke | real (staging) | fake | fake | **fake** | real |

### 5.3 CI

- **Pipeline de PR (debe pasar, < 3 min):** typecheck, lint, snapshots de esquema, todas las pruebas unitarias, todas las pruebas de integración, camino feliz E2E web. Smoke móvil excluido (demasiado lento / flaky para PRs).
- **Nocturno:** pipeline de PR + smoke móvil con Maestro contra un dev client de Expo publicado.

### 5.4 Lo que NO probamos en v1

- Pruebas de carga — no estamos a la escala donde importe.
- Fuzz / property-based — exagerado para este dominio.
- Regresión visual — los design tokens + revisión de PR alcanzan.
- Integración real con Twilio / Resend / Expo Push — los sandboxes mienten sobre delivery; la abstracción permite swap de proveedor por cambio de config.
- Formas del `audit_event.payload` — logs append-only; sobre-probar genera churn.

## 6. Fase 2 — lo que NO está en v1

### 6.1 Producto

| # | Ítem | Razón del aplazamiento | Puerta dejada abierta |
|---|---|---|---|
| A1 | Canal WhatsApp | Onboarding del Meta Business API | `notification_channel.kind` es enum abierto |
| A2 | Chat in-app cuidador↔hallador | Tiempo real + storage + moderación | Ninguna; tabla nueva al agregarse |
| A3 | Etiquetas para objetos / activos | UX distinta, diluye la historia v1 | Discriminador `tag.kind` puede separar persona/objeto luego |
| A4 | Señal "el cuidador va en camino" al hallador | Comunicación bidireccional; rompe el modelo unidireccional | Ninguna — aditivo |
| A5 | Opt-in por etiqueta para info más rica al hallador | Revisión LGPD + complejidad de UI | `protected_person.public_note` existe; columnas más ricas se agregan limpias |
| A6 | Prendas fabricadas por LNF | Movimiento de empresa aparte | El modelo de partner es la abstracción |
| A7 | Auto-registro de partner | Antifraude + cobro + KYC | Enum `partner.status` existe |
| A8 | Páginas de hallador con marca del partner | Theming por tenant, complejidad de cache | `partner.settings` jsonb reservado |
| A9 | **Rate-limiting del hallador** (por decisión de producto) | Lanzamiento más rápido, código más simple | `finder_fingerprint` ya está en cada fila de find |
| A10 | Anonimización de historial de hallazgos | Por decisión de producto: retener indefinidamente en v1 | El derecho de supresión LGPD por borrado de cuenta sigue haciendo hard-delete |
| A11 | Lanzamiento multi-región | El alcance de cumplimiento explota | Código locale-aware; residencia de datos es preocupación de despliegue |
| A12 | Transferencia de etiqueta entre cuidadores | Caso borde (regalos, segunda mano) | Activación monotónica; transferencia requiere `tag.transfer_log` |
| A13 | App web del cuidador más allá de "gestionar cuenta" | La mayoría de las acciones del cuidador son móvil-nativas | El proyecto Next.js existe; agregar rutas luego es solo más archivos |
| A14 | Tracking en vivo multi-stream sobre un mapa | Nicho; complejidad UI vs. frecuencia real | Cada hallazgo tiene sus propias muestras; la fusión es solo UI al agregarse |
| A15 | Solución al throttling de geo en iOS Safari más allá de "tocar para reanudar" | El fix real es una app nativa para hallador | Restricción documentada |

### 6.2 Ingeniería / operaciones

| # | Ítem | Razón del aplazamiento |
|---|---|---|
| B1 | Pruebas de carga y autoescalado | No estamos a la escala donde importe |
| B2 | Pruebas de integración con proveedor real | Semánticas de sandbox ≠ producción; QA manual + observabilidad |
| B3 | Pruebas de regresión visual | Design tokens + revisión de PR |
| B4 | DB multi-región / réplicas de lectura | Una sola región São Paulo es aceptable para v1 |
| B5 | Cambio de sistema de jobs (Redis / BullMQ) | Graphile Worker es suficiente |
| B6 | UI de operador como producto | Los operadores v1 usan Postgres + scripts |

### 6.3 Cumplimiento — manejado en v1, no aplazado

- Flujos de consentimiento alineados con LGPD.
- Exportación por acceso del titular LGPD (JSON, URL de descarga firmada).
- Supresión por solicitud del titular sobre el borrado de cuenta (14 días de gracia, hard-delete en cascada).
- Residencia de datos en São Paulo.
- Localización es / pt-BR al lanzamiento.

### 6.4 Regla forzosa

Cualquier cosa en §6 es decisión de "no para v1". Reincluir un ítem en el alcance v1 requiere un delta de un párrafo en el spec + aprobación — no expansión silenciosa a mitad de tarea.

## 7. Preguntas abiertas

- **A2 — Proveedor de mapas:** Google Maps Platform (familiar, costos por carga de mapa + por solicitud de direcciones) vs. MapLibre + tiles de OpenStreetMap (gratis, menos pulido). La decisión afecta el modelo de costos.
- **Modelo de cobro a partners:** por código generado, por etiqueta activada, por hallazgo, cuota mensual, híbrido. Determina si se necesita módulo de cobro en v1 o queda Fase 2.
- **Política por defecto de descarga del CSV:** un solo uso vs. N veces dentro de una ventana vs. operador en cualquier momento. Propuesta por defecto: un solo uso con re-emisión por operador a los 7 días.
- **Tope diario de gasto por defecto por cuenta:** requiere una tabla de precios por país antes de fijar un valor.
- **Retrasos por defecto del escalamiento:** push dispara inmediato; 2 min de espera → correo; 5 min de espera → SMS; 5 min de espera → voz. Confirmar o revisar.
- **UX del acuse-vía-SMS:** toque de enlace (recomendado) vs. responder con código. El manejo de respuestas agrega complejidad de inbound de Twilio.
- **¿App web del cuidador al lanzamiento?** El plan v1 es móvil primero; quizás se sume una vista web mínima de "gestionar cuenta" si la revisión del App Store demora el lanzamiento móvil.

## 8. Referencias

- [Requerimientos (inglés)](../../requirements.en.md)
- [Requerimientos (español)](../../requirements.es.md)
- [Diseño v1 (inglés, fuente de verdad)](./2026-06-04-lnf-design.en.md)
- [README del repo (bilingüe)](../../../README.md)
- [Guía de agentes (CLAUDE.md)](../../../CLAUDE.md)
