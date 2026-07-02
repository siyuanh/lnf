# QE Test Guide — LNF

Manual verification guide for the LNF (Lost & Found) app. Covers every shipped
feature end-to-end. English steps first, Spanish equivalents at the bottom.

- **Production URL:** https://lnf-765895908568.southamerica-west1.run.app
- **Local:** http://localhost:3000 (run `pnpm dev`)
- **Language toggle:** top-right switcher (English / Español), auto-detects browser locale.

## Test accounts (production)

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| Caregiver | `maria.caregiver@example.com` | `TestPass123!` | Has 1 contact + 1 registered tag |
| Caregiver | `john.caregiver@example.com` | `TestPass123!` | Has 1 contact, no tags |

> Partner-portal accounts are seeded manually (no self-serve signup). Ask an
> admin to create a `partner_user` if you need to test `/partner/*`.

---

## 1. Caregiver signup & login

1. Go to `/caregiver/signup`.
2. Enter name (required), email, password (8+ chars), optionally a phone.
   - **Expect:** invalid phone (e.g. `abc`) is rejected client-side.
3. Submit → you land on your caregiver area, already signed in (no email-click needed).
4. Log out (top-right), then `/caregiver/login` with the same credentials → back in.

**Pass:** account created, auto-signed-in, logout + re-login work.

> Note: a verification email is *not* delivered (stubbed to server logs). This is
> expected and non-blocking today.

---

## 2. Contacts CRUD

1. Go to `/caregiver/contacts`.
2. Add a **phone** contact (e.g. `+52 55 1234 5678`) with a label → appears in list.
3. Add an **email** and an **address** contact.
   - **Expect:** invalid email (e.g. `foo`) is rejected.
4. Edit a contact's label/value inline → saves.
5. Delete a contact (confirm prompt) → disappears from list.

**Pass:** create / list / edit / delete all work; validation blocks bad phone & email.

---

## 3. Tag activation (pairing a QR to a contact)

Requires a tag code. Use an existing one or ask an admin to mint a batch in
`/partner/batches`.

1. **Signed out**, open `/f/<code>` for an `inactive`/`active` tag.
   - **Expect:** "Ready to activate this tag?" prompt with Sign in / Create account buttons.
2. Click **Sign in** → after login you're returned to `/f/<code>` (the `?next=` round-trip).
3. Now **signed in**, the page shows the pairing form. Pick a contact, optionally a
   garment label, and activate.
   - **Expect:** "Tag activated." confirmation.
4. Try activating an already-registered tag → **Expect:** conflict message.

**Pass:** activation prompt appears when signed out; pairing succeeds when signed in;
double-activation is blocked.

---

## 4. Registered tags list & detail

1. Go to `/caregiver/tags`.
   - **Expect:** a table of your registered QR codes, each showing the linked contact
     summary (☎/✉/🏠) and a **View** link.
2. Click **View** on a row → `/caregiver/tags/<code>`.
   - **Expect:** a rendered **QR image** (encodes `/f/<code>`), the tag status +
     registered date, and the full linked-contact details.
3. Back-link returns to the list.
4. **Ownership check:** while signed in as John, manually visit María's tag detail URL
   → **Expect:** "Tag not found" (404), not the tag.

**Pass:** list shows only *your* tags; detail renders QR + contact; another caregiver
can't view your tag.

---

## 5. Finder report (the "found it" flow)

1. Open a **registered** tag's `/f/<code>` in a private/incognito window (signed out).
   - **Expect:** "Help reunite this person" form.
2. Either allow **GPS** ("Use my current location") or type an **address/landmark**.
   - **Expect:** you cannot submit with no location.
3. Optionally add a message and a contact, then submit.
   - **Expect:** "Thanks — the caregiver has been alerted."

**Pass:** form submits with GPS or address; empty-location is blocked.

> Note: no notification is actually sent to the caregiver yet (dispatch not built).
> The find is recorded server-side.

---

## 6. Partner portal (requires a partner account)

1. `/partner/login` → sign in.
2. `/partner/batches` → **New batch**, choose a size, mint.
   - **Expect:** codes shown once; download the zip (CSV + QR PNGs).
3. Open a batch → tag table with states; download CSV again (history re-download).
4. Idle ~15 min → next action bounces you to login (sliding session timeout).

**Pass:** mint, download, batch detail, and session timeout all work.

---

## 7. Language switching

1. Use the top-right toggle on any page.
   - **Expect:** all visible copy switches between English and Spanish; no layout break,
     no missing keys (raw `something.key` text).

**Pass:** both languages render fully.

---

## 8. Universal-link manifests (smoke)

- `GET /.well-known/apple-app-site-association` → `200`, JSON `{"applinks":{"apps":[],"details":[]}}`.
- `GET /.well-known/assetlinks.json` → `200`, `[]`.

**Pass:** both return valid JSON (placeholders for the future mobile app).

---

## Regression checklist (quick smoke)

- [ ] Home page loads (`200`)
- [ ] Caregiver signup → auto-signed-in
- [ ] Add a contact
- [ ] Activate a tag against that contact
- [ ] Tag appears in `/caregiver/tags`, detail shows QR + contact
- [ ] Another caregiver gets 404 on that tag detail
- [ ] Finder form submits (GPS + address)
- [ ] Language toggle works

---

# Guía de QE (Español)

## 1. Registro e inicio de sesión del cuidador
1. Ve a `/caregiver/signup`. Ingresa nombre, correo, contraseña (8+), teléfono opcional.
2. Envía → quedas dentro con sesión iniciada (sin necesidad de correo).
3. Cierra sesión y vuelve a entrar en `/caregiver/login`.
**Aprobado:** cuenta creada, sesión automática, cierre y reingreso funcionan.

## 2. Contactos (CRUD)
1. En `/caregiver/contacts`, agrega contactos de teléfono, correo y dirección.
2. Verifica que un correo o teléfono inválido sea rechazado.
3. Edita y elimina un contacto.
**Aprobado:** crear/listar/editar/eliminar funcionan; la validación bloquea datos inválidos.

## 3. Activar una etiqueta
1. Sin sesión, abre `/f/<código>` de una etiqueta activa → aparece "¿Listo para activar?".
2. Inicia sesión → regresas a `/f/<código>`.
3. Con sesión, elige un contacto y activa → "Etiqueta activada."
4. Reactivar una etiqueta ya registrada → mensaje de conflicto.
**Aprobado:** el aviso aparece sin sesión; la vinculación funciona con sesión.

## 4. Lista y detalle de etiquetas
1. En `/caregiver/tags`, verás tus códigos QR registrados y el contacto vinculado.
2. Haz clic en **Ver** → imagen QR, estado, fecha y datos del contacto.
3. Como otro cuidador, la misma URL de detalle debe dar 404.
**Aprobado:** solo ves tus etiquetas; otro cuidador no puede ver la tuya.

## 5. Reporte de hallazgo
1. Abre `/f/<código>` (etiqueta registrada) en ventana privada.
2. Usa GPS o escribe una dirección; no se puede enviar sin ubicación.
3. Envía → "Gracias — se notificó al cuidador."
**Aprobado:** se envía con GPS o dirección; se bloquea sin ubicación.

## 6. Portal de partner (requiere cuenta de partner)
1. `/partner/login`, genera un lote, descarga el zip, revisa el detalle del lote.
2. Tras ~15 min inactivo, la sesión expira.
**Aprobado:** generación, descarga, detalle y expiración funcionan.

## 7. Cambio de idioma
Usa el selector superior derecho; todo el texto cambia entre inglés y español.
**Aprobado:** ambos idiomas se muestran completos.
