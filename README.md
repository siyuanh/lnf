# LNF

> **English** · [Español ↓](#lnf-es)

A service that helps return lost vulnerable persons to their caregivers using QR-tagged clothing. Apparel partners mint unique QR codes via LNF and pre-print them onto their products. A caregiver buys such a garment, scans the QR with the LNF mobile app to activate it against a protected person, and from that moment on the tag is live. If the person is later found, any stranger can scan the same QR with a phone camera, open a public web page, and report the location — no app install required. The caregiver is notified through their chosen channels (push, email, SMS, voice call) while the protected person's identity and the caregiver's contact details remain private. The finder can also opt in to share their live location continuously, which the caregiver follows on a map until they arrive — all without the finder ever revealing who they are.

**Status:** Pre-alpha. Requirements drafted; design and implementation not yet started.

**Region:** Launch is LATAM. UI in Spanish (es) and Portuguese (pt-BR). Privacy designed against Brazil's LGPD as the regional baseline.

**For whom:** Families and caregivers of children, people with autism or intellectual disability, and adults with dementia.

## What's in this repo

- [`docs/requirements.en.md`](docs/requirements.en.md) — full product requirements, user roles, functional and non-functional requirements, use cases.
- [`docs/requirements.es.md`](docs/requirements.es.md) — same document in Spanish.
- `CLAUDE.md` — guidance for Claude Code agents working in this repo.

Design specs, architecture documents, and code will follow.

## How it works (one paragraph)

Partners use the LNF API or partner portal to mint batches of unique unguessable codes, which they print onto garments before sale. A caregiver who buys one of those garments scans the QR with the LNF mobile app: a universal link routes to the app, which guides them through activation (pick or create a protected person, label the garment, confirm). Once active, every QR encodes an unguessable URL that any stranger's phone can open without installing anything. The finder page asks for a location (GPS or typed) and an optional contact; submitting it creates a *find* record on the backend, which fans out to the caregiver via the channels they configured: push first, then email, SMS, and voice call, escalating only until the caregiver acknowledges. After submitting, the finder may opt in to stream their live GPS to the caregiver, who sees a moving pin on a map view; sharing stops as soon as the finder taps stop, the caregiver marks the find resolved, or a hard time cap elapses. The caregiver sees the finder's location and (if provided) contact; the finder never sees the caregiver's information.

## Non-goals for v1

Lost-object recovery, in-app chat, WhatsApp delivery, real-time presence, and pre-printed tag fulfillment are deliberately out of scope for the first release. See the requirements docs for the full list.

## Building locally

See [`docs/dev/getting-started.md`](docs/dev/getting-started.md). Requires Node 20+, pnpm 9+, Docker.

---

<a id="lnf-es"></a>

# LNF (Español)

> [English ↑](#lnf) · **Español**

Un servicio que ayuda a devolver a sus cuidadores a personas vulnerables extraviadas, utilizando ropa con etiquetas QR. Marcas asociadas (partners) generan códigos QR únicos a través de LNF y los imprimen sobre sus productos antes de la venta. El cuidador compra una de esas prendas, escanea el QR con la app móvil de LNF para activarla contra una persona protegida y, desde ese momento, la etiqueta queda viva. Si más adelante la persona es encontrada, cualquier extraño puede escanear el mismo QR con la cámara de su teléfono, abrir una página web pública e informar la ubicación — sin instalar ninguna aplicación. El cuidador es notificado a través de los canales que haya elegido (push, correo electrónico, SMS, llamada de voz), mientras que la identidad de la persona protegida y los datos de contacto del cuidador permanecen privados. El hallador también puede optar por compartir su ubicación en vivo de forma continua, que el cuidador sigue sobre un mapa hasta llegar — todo ello sin que el hallador revele jamás quién es.

**Estado:** Pre-alfa. Requerimientos redactados; diseño e implementación aún por iniciar.

**Región:** Lanzamiento en LATAM. UI en español (es) y portugués (pt-BR). Privacidad diseñada según la LGPD de Brasil como referencia regional.

**Para quién:** Familias y cuidadores de niños, personas con autismo o discapacidad intelectual y adultos con demencia.

## Contenido de este repositorio

- [`docs/requirements.es.md`](docs/requirements.es.md) — requerimientos del producto, roles de usuario, requerimientos funcionales y no-funcionales, y casos de uso.
- [`docs/requirements.en.md`](docs/requirements.en.md) — mismo documento en inglés.
- `CLAUDE.md` — guía para agentes de Claude Code que trabajen en este repositorio.

Los documentos de diseño y arquitectura, así como el código, vendrán a continuación.

## Cómo funciona (en un párrafo)

Los partners usan la API o el portal de partners de LNF para generar lotes de códigos únicos no adivinables, que imprimen sobre prendas antes de la venta. El cuidador que compra una de esas prendas escanea el QR con la app móvil de LNF: un universal link enruta a la app, que lo guía por la activación (elegir o crear una persona protegida, etiquetar la prenda, confirmar). Una vez activa, cada QR codifica una URL no adivinable que cualquier teléfono puede abrir sin instalar nada. La página del hallador pide una ubicación (GPS o escrita) y un contacto opcional; al enviarla se crea un registro de *hallazgo* en el backend, que distribuye la alerta al cuidador a través de los canales configurados: primero push, luego correo, SMS y llamada de voz, escalando solo hasta que el cuidador acuse recibo. Tras el envío, el hallador puede optar por transmitir su GPS en vivo al cuidador, quien ve un pin en movimiento sobre un mapa; la compartición se detiene en cuanto el hallador presiona Detener, el cuidador marca el hallazgo como Resuelto o se cumple el tope de tiempo. El cuidador ve la ubicación y (si fue provisto) el contacto del hallador; el hallador nunca ve la información del cuidador.

## No-objetivos para v1

La recuperación de objetos extraviados, el chat dentro de la aplicación, la entrega por WhatsApp, la presencia en tiempo real y la distribución de etiquetas pre-impresas están deliberadamente fuera del alcance del primer lanzamiento. La lista completa se encuentra en los documentos de requerimientos.

## Construir localmente

Ver [`docs/dev/getting-started.md`](docs/dev/getting-started.md). Requiere Node 20+, pnpm 9+, Docker.
