# LNF — Requerimientos del Producto (Español)

**Estado:** Borrador — derivado de la sesión de brainstorming del 2026-06-03. Pendiente de revisión por las partes interesadas.

## 1. Propósito

LNF es un servicio que ayuda a devolver a sus cuidadores a personas vulnerables extraviadas (niños, personas con autismo o discapacidad intelectual, adultos con demencia). El cuidador registra a la persona protegida en una aplicación móvil e imprime etiquetas QR duraderas que se adhieren a su ropa. Si la persona es encontrada deambulando o desorientada, cualquier extraño puede escanear el QR con la cámara de su teléfono, abrir una página web pública e informar la ubicación. El cuidador es notificado a través de los canales que haya elegido (push, correo electrónico, SMS y llamada de voz), manteniendo en privado la identidad de la persona protegida y los datos de contacto del cuidador.

## 2. Objetivos

1. Entregar al cuidador una alerta accionable lo más rápido posible después de que un extraño escanee un QR.
2. Permitir que cualquier hallador reporte una ubicación **sin instalar una aplicación, sin crear una cuenta y con un mínimo de escritura**.
3. Mantener privados por defecto el nombre, la fotografía y los detalles médicos de la persona protegida.
4. Mantener oculta del hallador la información de contacto del cuidador; la coordinación fluye en un solo sentido (cuidador → hallador).
5. Operar como un sistema pequeño y mantenible que pueda ser administrado por un único desarrollador o un equipo reducido.

## 3. No-objetivos (v1)

- Recuperación de objetos (billeteras, bolsos, llaves). Podría agregarse en una fase posterior usando el mismo modelo de etiqueta.
- Chat en la aplicación entre cuidador y hallador.
- WhatsApp como canal de notificación. Probablemente Fase 2.
- Indicador de presencia en tiempo real del tipo "el cuidador va en camino".
- Distribución física de etiquetas pre-impresas (en v1 los cuidadores imprimen sus propios QRs).
- Lanzamiento multi-región. El lanzamiento inicial es exclusivamente LATAM.

## 4. Usuarios y roles

| Rol | Descripción | ¿Autenticado? |
|---|---|---|
| **Cuidador** | Tutor, padre o madre, familiar o profesional de cuidado que registra a las personas protegidas y recibe las alertas. | Sí |
| **Persona protegida** | El individuo vulnerable cuya ropa lleva el QR. No es usuario del sistema. | n/c |
| **Hallador** | Un extraño que escanea el QR tras encontrar a la persona protegida. | No |
| **Operador** (interno) | Personal del proyecto que monitorea entrega, abuso y costos. Fuera del alcance de la UI del producto en v1; usa dashboards / base de datos. | n/c |

## 5. Requerimientos funcionales

### 5.1 Alta del cuidador

- El cuidador PUEDE registrarse y agregar a su primera persona protegida sin crear una cuenta completa (modo anónimo, vinculado al dispositivo).
- El cuidador DEBE ser invitado a crear una cuenta real (correo electrónico + contraseña, con inicio de sesión opcional con Google / Apple) antes de poder activar cualquier canal de notificación, ya que perder la cuenta equivale a perder la notificación.
- El cuidador DEBE poder gestionar varias personas protegidas bajo una misma cuenta.
- Cada persona protegida PUEDE tener varias etiquetas QR (varias prendas).

### 5.2 Generación e impresión de etiquetas

- El cuidador genera un código QR único por prenda desde dentro de la aplicación.
- El QR codifica una URL de la forma `https://<dominio>/f/<código-opaco>`. El código DEBE ser no adivinable.
- La aplicación DEBE proveer una vista lista para impresión, dimensionada para etiquetas de tela o etiquetas termoadhesivas.
- El cuidador DEBE poder revocar una etiqueta (por ejemplo, prenda descartada). Las etiquetas revocadas muestran al hallador una página genérica de "esta etiqueta ya no está activa" y no generan ninguna notificación.

### 5.3 Flujo del hallador

- Escanear el QR con la cámara de cualquier teléfono moderno DEBE abrir directamente la página del hallador en el navegador. Sin instalación, sin inicio de sesión y sin captcha por defecto (en su lugar se aplica rate-limiting).
- La página del hallador DEBE mostrar:
  - Un encabezado breve y amigable en el idioma principal del país (español o portugués), explicando que esta persona puede necesitar ayuda para volver a casa.
  - Una nota pública opcional escrita por el cuidador (texto libre, ≤200 caracteres).
  - Un formulario para enviar la ubicación y un mensaje opcional.
- El campo de ubicación DEBE aceptar:
  - Las coordenadas GPS del teléfono (con solicitud de permiso explícita), o
  - Una dirección o referencia escrita.
- El hallador PUEDE proporcionar opcionalmente un canal de contacto (teléfono o correo) para que el cuidador pueda comunicarse con él, pero no es obligatorio.
- Tras el envío, la página DEBE mostrar una confirmación de que el cuidador fue alertado.

### 5.4 Notificación y escalamiento

- El cuidador DEBE poder configurar, por persona protegida, cuáles de los canales {push, correo, SMS, llamada de voz} están habilitados y en qué orden.
- Los cuatro canales DEBEN estar disponibles en el lanzamiento.
- Cuando se reporta un hallazgo, el sistema DEBE intentar los canales configurados en orden, con un retraso configurable entre intentos, y detener la cadena en cuanto el cuidador acuse recibo de la alerta.
- La acción de acuse de recibo DEBE estar disponible desde cualquier canal (toque sobre la notificación push, enlace en el correo, "código de confirmación" por SMS, tecla durante la llamada de voz).
- Si todos los canales configurados fallan en obtener un acuse dentro de la ventana definida, el sistema DEBE registrar la falla y mostrarla al cuidador la próxima vez que abra la aplicación.

### 5.5 Privacidad

- El hallador NO DEBE ver el nombre, la fotografía ni los detalles médicos de la persona protegida por defecto. (La opción por etiqueta de mostrar información adicional queda como mejora de Fase 2, no para v1.)
- El hallador NO DEBE ver, en ningún momento, la información de contacto del cuidador.
- El cuidador, después de acusar recibo, DEBE ver el reporte del hallazgo (ubicación, contacto opcional del hallador, marca de tiempo) y PUEDE elegir contactar al hallador directamente.
- Todos los datos personales DEBEN ser procesados en cumplimiento con la LGPD de Brasil como referencia regional más estricta; los flujos de consentimiento DEBEN ser explícitos y revocables. Los titulares de los datos (cuidadores) DEBEN poder exportar y eliminar sus datos.

### 5.6 Manejo de alertas por parte del cuidador

- El cuidador DEBE poder ver un historial de hallazgos por persona protegida.
- El cuidador DEBE poder marcar un hallazgo como resuelto (persona recuperada) o como falso positivo (por ejemplo, escaneo de prueba o escaneo malicioso).
- Marcar como falso positivo DEBE rate-limitar temporalmente futuros hallazgos sobre la misma etiqueta provenientes de la misma huella de hallador.

### 5.7 Internacionalización

- Toda la UI dirigida al cuidador DEBE estar disponible en español (es) y portugués (pt-BR) al lanzamiento.
- La página pública del hallador DEBE servirse en el idioma indicado por `Accept-Language`, con español como valor por defecto.
- Inglés PUEDE estar disponible como tercer idioma, pero no es obligatorio para el lanzamiento.

## 6. Requerimientos no-funcionales

- **Latencia:** Desde "el hallador presiona Enviar" hasta "primera notificación despachada" DEBERÍA ser inferior a 5 segundos en la mediana.
- **Disponibilidad:** La página del hallador DEBE permanecer accesible incluso cuando el backend móvil esté degradado; un fallback estático que capture el reporte para procesamiento posterior es aceptable.
- **Control de costos:** Los SMS y las llamadas de voz tienen un costo real por entrega. El sistema DEBE imponer un tope de gasto diario por cuenta; el operador DEBE poder consultar los costos de envío por país.
- **Resistencia al abuso:** Un mismo dispositivo NO DEBE poder enviar más que un número reducido de hallazgos por minuto contra cualquier etiqueta; el abuso reiterado DEBE ser detectable en los registros.
- **Residencia de datos:** Los datos personales DEBERÍAN almacenarse, en la medida de lo posible, en una región LATAM.

## 7. Casos de uso

### CU-1: El cuidador registra a una persona protegida e imprime etiquetas

1. El cuidador abre la aplicación móvil por primera vez.
2. La aplicación ofrece agregar una persona protegida sin crear una cuenta (modo anónimo).
3. El cuidador ingresa: alias privado de la persona protegida, nota pública opcional escrita por el cuidador (por ejemplo, "Tengo autismo, por favor llame a mi mamá") y canales de notificación preferidos.
4. La aplicación invita al cuidador a crear una cuenta real y verificar su correo / teléfono antes de activar SMS o voz.
5. El cuidador genera un QR para la primera prenda y lo imprime.
6. El cuidador adhiere el QR (termoadhesivo o etiqueta cosida) a la prenda.

**Éxito:** La persona protegida tiene al menos una prenda activa con un QR vinculado a una cadena de alertas configurada.

### CU-2: Un extraño encuentra a la persona protegida y reporta una ubicación

1. La persona protegida es encontrada por un extraño (el hallador) en un parque.
2. El hallador nota el QR en la prenda y lo escanea con la cámara de su teléfono.
3. El teléfono abre la página del hallador en el navegador (sin instalación ni inicio de sesión).
4. El hallador lee el encabezado y la nota pública del cuidador.
5. El hallador presiona "Usar mi ubicación actual" (otorgando permiso de GPS) y agrega un mensaje breve ("ella está sentada en una banca junto a la fuente").
6. El hallador opcionalmente provee su número de teléfono y presiona Enviar.
7. La página confirma que el cuidador ha sido alertado.

**Éxito:** Se crea un registro de hallazgo y la cadena de escalamiento comienza en segundos.

### CU-3: El cuidador recibe y acusa recibo de una alerta

1. El primer canal configurado (push) se dispara de inmediato.
2. El cuidador toca la notificación push, lo cual abre la aplicación en el reporte del hallazgo.
3. El cuidador ve: ubicación (pin en mapa o dirección escrita), mensaje opcional del hallador, contacto opcional del hallador, hora del reporte.
4. El cuidador presiona Confirmar. La cadena de escalamiento se detiene.
5. El cuidador, si lo necesita, toca el número del hallador para llamarlo directamente.
6. Tras recuperar a la persona, el cuidador marca el hallazgo como Resuelto.

**Éxito:** El cuidador recibió la alerta, contactó al hallador, recuperó a la persona protegida y el sistema cuenta con un registro de auditoría limpio.

### CU-4: El cuidador no responde a push ni a correo

1. Push se dispara. Tras el retraso configurado (por ejemplo, 2 minutos) sin acuse, se envía un correo electrónico.
2. Se envía el correo. Tras el retraso configurado (por ejemplo, 5 minutos) sin acuse, se envía un SMS.
3. Se envía el SMS. Tras el retraso configurado (por ejemplo, 5 minutos) sin acuse, se realiza una llamada de voz; la llamada reproduce un mensaje TTS y solicita al cuidador presionar una tecla para confirmar.
4. Si el cuidador confirma durante la llamada de voz, la cadena se detiene.
5. Si no llega ninguna confirmación por ningún canal dentro de la ventana total, el sistema registra la falla y la muestra la próxima vez que el cuidador abra la aplicación.

**Éxito:** Se realizó el mejor esfuerzo posible a través de cada canal configurado, el cuidador eventualmente se entera del hallazgo y la falla queda auditable.

### CU-5: El cuidador retira una prenda

1. El cuidador abre la aplicación y va a las etiquetas de la persona protegida.
2. El cuidador selecciona la etiqueta de la prenda gastada y presiona Revocar.
3. A partir de ese momento, los escaneos de ese QR muestran una página de "esta etiqueta ya no está activa" y no disparan ninguna alerta.

**Éxito:** No se generan más notificaciones para la etiqueta retirada.

## 8. Preguntas abiertas

- Tiempos exactos de escalamiento (push → correo → SMS → voz). Propuesta por defecto: 2 / 5 / 5 minutos; configurable por el operador.
- UX de acuse-vía-SMS (responder con código vs. tocar un enlace). Se recomienda toque de enlace; manejar respuestas inbound de Twilio agrega complejidad.
- Tope de gasto diario por defecto por cuenta. Requiere una tabla de precios país por país antes de fijar un valor.
- Si se debe ofrecer una aplicación web para el cuidador en el lanzamiento o si basta con móvil más una vista web mínima de "gestión de cuenta".
