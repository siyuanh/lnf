# Guía de pruebas de QE — LNF (Español)

Guía de verificación manual para la app LNF (Objetos Perdidos). Cubre cada
funcionalidad publicada de principio a fin. Versión en inglés: [`qe-test-guide.en.md`](./qe-test-guide.en.md).

- **URL de producción:** https://lnf-765895908568.southamerica-west1.run.app
- **Local:** http://localhost:3000 (ejecuta `pnpm dev`)
- **Selector de idioma:** el conmutador superior derecho alterna English / Español / Português; detecta el idioma del navegador (pt/pt-BR/pt-PT se mapean a Português; idiomas no soportados caen a Español).

## Cuentas de prueba (producción)

| Rol | Correo | Contraseña | Notas |
|------|-------|----------|-------|
| Cuidador | `maria.caregiver@example.com` | `TestPass123!` | Tiene 1 contacto + 1 etiqueta registrada |
| Cuidador | `john.caregiver@example.com` | `TestPass123!` | Tiene 1 contacto, sin etiquetas |

> Las cuentas del portal de partner se crean manualmente (no hay registro
> autoservicio). Pide a un administrador que cree un `partner_user` si necesitas
> probar `/partner/*`.

---

## 1. Registro e inicio de sesión del cuidador

1. Ve a `/caregiver/signup`.
2. Ingresa nombre (obligatorio), correo, contraseña (8+ caracteres) y, opcionalmente, un teléfono.
   - **Se espera:** un teléfono inválido (p. ej. `abc`) se rechaza en el cliente.
3. Envía → llegas a tu área de cuidador, ya con sesión iniciada (sin necesidad de hacer clic en un correo).
4. Cierra sesión (arriba a la derecha), luego entra en `/caregiver/login` con las mismas credenciales → vuelves a entrar.

**Aprobado:** cuenta creada, sesión automática, cierre y reingreso funcionan.

> Nota: el correo de verificación *no* se entrega (queda registrado solo en los logs del servidor).
> Esto es esperado y no bloquea nada hoy.

---

## 2. Contactos (CRUD)

1. Ve a `/caregiver/contacts`.
2. Agrega un contacto de **teléfono** (p. ej. `+52 55 1234 5678`) con una etiqueta → aparece en la lista.
3. Agrega un contacto de **correo** y uno de **dirección**.
   - **Se espera:** un correo inválido (p. ej. `foo`) se rechaza.
4. Edita la etiqueta/valor de un contacto en línea → se guarda.
5. Elimina un contacto (con confirmación) → desaparece de la lista.

**Aprobado:** crear / listar / editar / eliminar funcionan; la validación bloquea teléfono y correo inválidos.

---

## 3. Activación de etiqueta (vincular un QR a un contacto)

Requiere un código de etiqueta. Usa uno existente o pide a un administrador que
genere un lote en `/partner/batches`.

1. **Sin sesión**, abre `/f/<código>` de una etiqueta `inactive`/`active`.
   - **Se espera:** el aviso "¿Listo para activar esta etiqueta?" con botones de Iniciar sesión / Crear cuenta.
2. Haz clic en **Iniciar sesión** → tras entrar, regresas a `/f/<código>` (el viaje de ida y vuelta con `?next=`).
3. Ya **con sesión**, la página muestra el formulario de vinculación. Elige un contacto, opcionalmente
   una etiqueta de prenda, y activa.
   - **Se espera:** confirmación "Etiqueta activada."
4. Intenta activar una etiqueta ya registrada → **Se espera:** mensaje de conflicto.

**Aprobado:** el aviso de activación aparece sin sesión; la vinculación funciona con sesión;
la doble activación se bloquea.

---

## 4. Lista y detalle de etiquetas registradas

1. Ve a `/caregiver/tags`.
   - **Se espera:** una tabla de tus códigos QR registrados, cada uno mostrando el resumen
     del contacto vinculado (☎/✉/🏠) y un enlace **Ver**.
2. Haz clic en **Ver** en una fila → `/caregiver/tags/<código>`.
   - **Se espera:** una **imagen QR** renderizada (codifica `/f/<código>`), el estado de la etiqueta +
     la fecha de registro, y los datos completos del contacto vinculado.
3. El enlace de regreso vuelve a la lista.
4. **Verificación de propiedad:** con sesión de John, visita manualmente la URL de detalle de la
   etiqueta de María → **Se espera:** "Etiqueta no encontrada" (404), no la etiqueta.

**Aprobado:** la lista muestra solo *tus* etiquetas; el detalle renderiza QR + contacto; otro
cuidador no puede ver tu etiqueta.

---

## 5. Reporte de hallazgo (el flujo de "lo encontré")

1. Abre `/f/<código>` de una etiqueta **registrada** en una ventana privada/incógnito (sin sesión).
   - **Se espera:** el formulario "Ayuda a esta persona a volver a casa".
2. Permite el **GPS** ("Usar mi ubicación actual") o escribe una **dirección/referencia**.
   - **Se espera:** no puedes enviar sin una ubicación.
3. Opcionalmente agrega un mensaje y un contacto, luego envía.
   - **Se espera:** "Gracias — se notificó al cuidador."

**Aprobado:** el formulario se envía con GPS o dirección; se bloquea sin ubicación.

> Nota: el envío inicia la escalada de notificaciones (§6). En dev, los envíos van a
> **proveedores falsos** — nada llega a correos/teléfonos reales; los mensajes
> "enviados" (con sus enlaces de confirmación) se imprimen en el log del servidor API.

---

## 6. Notificaciones y escalada (UC-3 confirma, UC-4 expira)

Prerequisito: un cuidador con una etiqueta registrada (§3). Al activarla se crea la
cadena por defecto: **correo primero, SMS 5 min después, llamada de voz 5 min
después** — hasta que el cuidador confirme o la cadena se agote.

**UC-3 — el cuidador confirma:**

1. Envía un reporte de hallazgo (§5). En unos segundos el log de la API muestra
   `[fake-email] → …` con un enlace de confirmación (`/api/public/ack/<attemptId>?token=…`).
2. Confírmalo (el endpoint es POST, usa curl en lugar del navegador):
   `curl -X POST 'http://localhost:3001/api/public/ack/<attemptId>?token=<token>'`
   - **Se espera:** la página HTML "Recibido".
3. `GET /api/caregiver/finds` (cuidador con sesión) muestra el hallazgo `acknowledged`.
   - **Se espera:** no llega SMS ni llamada — la cadena se detuvo.
4. Repite el mismo curl → **Se espera:** una página 410 "Ya confirmada" (enlace de un solo uso).

**UC-4 — sin respuesta:**

1. Envía un reporte e ignora todos los enlaces.
2. **Se espera (≈10 min total en dev):** correo falso a los ~0 s, SMS falso a los
   +5 min, voz falsa a los +10 min, luego nada.
3. Después el hallazgo aparece como `expired` en `GET /api/caregiver/finds`, y la
   tabla `notification_attempt` tiene una fila por canal, todas `sent`.

**Aprobado:** confirmar detiene la cadena (solo correo); ignorar todo escala
correo → SMS → voz y termina en `expired`.

---

## 7. Portal de partner (requiere una cuenta de partner)

1. `/partner/login` → inicia sesión.
2. `/partner/batches` → **Nuevo lote**, elige un tamaño, genera.
   - **Se espera:** los códigos se muestran una sola vez; descarga el zip (CSV + PNG de QR).
3. Abre un lote → tabla de etiquetas con estados; descarga el CSV de nuevo (re-descarga del historial).
4. Inactivo ~15 min → la siguiente acción te devuelve al inicio de sesión (expiración de sesión deslizante).

**Aprobado:** generar, descargar, detalle del lote y expiración de sesión funcionan.

---

## 8. Cambio de idioma

1. Usa el conmutador superior derecho en cualquier página — alterna **English → Español → Português**.
   - **Se espera:** todo el texto visible cambia de idioma en cada clic; sin romper el diseño,
     sin claves faltantes (texto crudo tipo `algo.clave`).
2. Con el navegador en portugués (pt-BR), abre el sitio sin sesión en una ventana
   privada (sin cookie de idioma).
   - **Se espera:** las páginas se muestran en portugués por defecto; igual para
     español (es) e inglés (en). Cualquier otro idioma del navegador cae a español (§5.9).

**Aprobado:** los tres idiomas se muestran completos; la detección por encabezado funciona según el idioma del navegador.

---

## 9. Manifiestos de enlaces universales (smoke)

- `GET /.well-known/apple-app-site-association` → `200`, JSON `{"applinks":{"apps":[],"details":[]}}`.
- `GET /.well-known/assetlinks.json` → `200`, `[]`.

**Aprobado:** ambos devuelven JSON válido (marcadores de posición para la futura app móvil).

---

## Lista de regresión (smoke rápido)

- [ ] La página de inicio carga (`200`)
- [ ] Registro de cuidador → sesión automática
- [ ] Agregar un contacto
- [ ] Activar una etiqueta con ese contacto
- [ ] La etiqueta aparece en `/caregiver/tags`, el detalle muestra QR + contacto
- [ ] Otro cuidador recibe 404 en ese detalle de etiqueta
- [ ] El formulario de hallazgo se envía (GPS + dirección)
- [ ] El correo falso con enlace de confirmación aparece en el log de la API; al hacer POST el enlace muestra "Recibido"
- [ ] Repetir el POST del mismo enlace → 410
- [ ] Sin respuesta: llegan SMS (~+5 min) y voz (~+10 min), el hallazgo termina `expired`
- [ ] El conmutador de idioma alterna English / Español / Português
