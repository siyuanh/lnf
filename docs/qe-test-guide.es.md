# Guía de pruebas de QE — LNF (Español)

Guía de verificación manual para la app LNF (Objetos Perdidos). Cubre cada
funcionalidad publicada de principio a fin. Versión en inglés: [`qe-test-guide.en.md`](./qe-test-guide.en.md).

- **URL de producción:** https://lnf-765895908568.southamerica-west1.run.app
- **Local:** http://localhost:3000 (ejecuta `pnpm dev`)
- **Selector de idioma:** conmutador superior derecho (English / Español); detecta el idioma del navegador.

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

> Nota: todavía no se envía ninguna notificación al cuidador (el envío no está construido).
> El hallazgo queda registrado en el servidor.

---

## 6. Portal de partner (requiere una cuenta de partner)

1. `/partner/login` → inicia sesión.
2. `/partner/batches` → **Nuevo lote**, elige un tamaño, genera.
   - **Se espera:** los códigos se muestran una sola vez; descarga el zip (CSV + PNG de QR).
3. Abre un lote → tabla de etiquetas con estados; descarga el CSV de nuevo (re-descarga del historial).
4. Inactivo ~15 min → la siguiente acción te devuelve al inicio de sesión (expiración de sesión deslizante).

**Aprobado:** generar, descargar, detalle del lote y expiración de sesión funcionan.

---

## 7. Cambio de idioma

1. Usa el conmutador superior derecho en cualquier página.
   - **Se espera:** todo el texto visible cambia entre inglés y español; sin romper el diseño,
     sin claves faltantes (texto crudo tipo `algo.clave`).

**Aprobado:** ambos idiomas se muestran completos.

---

## 8. Manifiestos de enlaces universales (smoke)

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
- [ ] El cambio de idioma funciona
