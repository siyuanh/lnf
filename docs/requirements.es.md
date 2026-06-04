# LNF — Requerimientos del Producto (Español)

**Estado:** Borrador — derivado de la sesión de brainstorming del 2026-06-03. Pendiente de revisión por las partes interesadas.

## 1. Propósito

LNF es un servicio que ayuda a devolver a sus cuidadores a personas vulnerables extraviadas (niños, personas con autismo o discapacidad intelectual, adultos con demencia). Marcas asociadas (partners) fabrican prendas y accesorios que llevan QR únicos no adivinables, generados por LNF y pre-impresos antes de la venta. El cuidador adquiere una de estas prendas, escanea el QR con la aplicación móvil de LNF y activa la etiqueta vinculándola a una persona protegida bajo su cuenta. Si más adelante la persona es encontrada deambulando o desorientada, cualquier extraño puede escanear ese mismo QR con la cámara de su teléfono, abrir una página web pública e informar la ubicación. El cuidador es notificado a través de los canales que haya elegido (push, correo electrónico, SMS y llamada de voz), manteniendo en privado la identidad de la persona protegida y los datos de contacto del cuidador. El hallador también puede optar por compartir su ubicación en vivo de forma continua para que el cuidador pueda rastrearlo y llegar hasta él, sin perder el anonimato.

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
- Fabricación de prendas por parte de LNF. LNF genera los códigos y provee la plataforma de partners; la fabricación física la realizan los partners.
- Páginas del hallador con marca del partner y temas personalizados por partner. Fase 2.
- Auto-registro (signup) de partners. v1 incorpora partners por invitación; el portal soporta inicio de sesión pero no registro.
- Lanzamiento multi-región. El lanzamiento inicial es exclusivamente LATAM.

## 4. Usuarios y roles

| Rol | Descripción | ¿Autenticado? |
|---|---|---|
| **Cuidador** | Tutor, padre o madre, familiar o profesional de cuidado que activa etiquetas, registra a las personas protegidas y recibe las alertas. | Sí |
| **Persona protegida** | El individuo vulnerable cuya ropa lleva el QR. No es usuario del sistema. | n/c |
| **Hallador** | Un extraño que escanea el QR tras encontrar a la persona protegida. | No |
| **Partner** | Marca de indumentaria o tienda que genera lotes de códigos QR a través de la API o el portal de partners de LNF y los imprime sobre sus productos antes de la venta. | Sí |
| **Operador** (interno) | Personal de LNF que monitorea entrega, abuso, costos e incorporación de partners. Fuera del alcance de la UI del producto en v1; usa dashboards / base de datos. | n/c |

## 5. Requerimientos funcionales

### 5.1 Alta del cuidador

- El cuidador PUEDE registrarse y agregar a su primera persona protegida sin crear una cuenta completa (modo anónimo, vinculado al dispositivo).
- El cuidador DEBE ser invitado a crear una cuenta real (correo electrónico + contraseña, con inicio de sesión opcional con Google / Apple) antes de poder activar cualquier canal de notificación, ya que perder la cuenta equivale a perder la notificación.
- El cuidador DEBE poder gestionar varias personas protegidas bajo una misma cuenta.
- Cada persona protegida PUEDE tener varias etiquetas QR (varias prendas).

### 5.2 Generación de etiquetas (partner)

- Un partner DEBE poder generar un lote de códigos QR ya sea a través del portal de partners (UI web) o de una API programática.
- Cada código generado DEBE ser no adivinable (derivado de CSPRNG) y único en todo el sistema.
- Un código recién generado se crea en estado **`unactivated`**. Existe en la base de datos pero aún no está vinculado a ningún cuidador ni persona protegida.
- Tras la generación, el partner DEBE recibir un artefacto descargable (CSV o equivalente) con todos los códigos del lote, apto para ser ingresado en su pipeline de impresión o etiquetado.
- El artefacto de descarga DEBE estar disponible únicamente mediante un enlace firmado y con expiración, atado al partner solicitante; el enlace NO DEBE ser adivinable.
- LNF DEBE llevar totales por partner: códigos generados, códigos activados, códigos revocados y hallazgos reportados por código.
- v1 incorpora partners únicamente por invitación. El auto-registro de partners está fuera de alcance.

### 5.3 Activación de la etiqueta (cuidador)

- El QR codifica una URL de la forma `https://<dominio>/f/<código-opaco>`. Tanto cuidadores como halladores escanean la misma URL; el sistema decide qué renderizar en función del estado de la etiqueta y de si el visitante tiene la app móvil de LNF instalada.
- Cuando un cuidador escanea un QR con la app de LNF instalada, los universal links / Android App Links del dispositivo DEBEN encaminar la URL hacia la app en lugar del navegador.
- Cuando la app recibe un código `unactivated`, DEBE guiar al cuidador autenticado por el flujo de activación: elegir una persona protegida existente o crear una nueva, etiquetar la prenda (ej. "campera azul") y confirmar.
- Cuando la app recibe un código `active` que ya pertenece al mismo cuidador, DEBE mostrar detalles informativos (qué persona protegida, qué prenda, fecha de activación) y ofrecer las acciones de revocar / re-etiquetar. NO DEBE crear un hallazgo.
- Cuando la app recibe un código `active` que pertenece a un cuidador distinto, DEBE tratar el escaneo como acción de hallador y presentar el flujo del hallador (ver §5.4).
- Cuando un hallador sin la app escanea el QR (caída a navegador) y el código está `unactivated`, la página DEBE mostrar "Esta etiqueta es nueva. Instale la app de LNF para activarla." con enlaces a las tiendas. No se crea ningún hallazgo.
- Cuando un hallador sin la app escanea el QR y el código está `revoked`, la página DEBE mostrar un mensaje genérico "Esta etiqueta ya no está activa" y no crear ningún hallazgo.
- El cuidador DEBE poder revocar una etiqueta en cualquier momento (por ejemplo, prenda descartada o vendida). Las etiquetas revocadas siguen la regla anterior.
- Una activación exitosa DEBE emitir un evento de auditoría y vincular el `partner_id` de la etiqueta (asignado en la generación) al `caregiver_id` ahora conocido, para fines de analítica del partner.

### 5.4 Flujo del hallador

- Escanear el QR con la cámara de cualquier teléfono moderno DEBE abrir directamente la página del hallador en el navegador cuando la app de LNF no esté instalada (o cuando el escáner no sea el cuidador dueño de la etiqueta). Sin instalación, sin inicio de sesión y sin captcha por defecto (en su lugar se aplica rate-limiting). Cuando la app de LNF está instalada, ver §5.3 para las reglas de ruteo.
- La página del hallador DEBE mostrar:
  - Un encabezado breve y amigable en el idioma principal del país (español o portugués), explicando que esta persona puede necesitar ayuda para volver a casa.
  - Una nota pública opcional escrita por el cuidador (texto libre, ≤200 caracteres).
  - Un formulario para enviar la ubicación y un mensaje opcional.
- El campo de ubicación DEBE aceptar:
  - Las coordenadas GPS del teléfono (con solicitud de permiso explícita), o
  - Una dirección o referencia escrita.
- El hallador PUEDE proporcionar opcionalmente un canal de contacto (teléfono o correo) para que el cuidador pueda comunicarse con él, pero no es obligatorio.
- Tras el envío, la página DEBE mostrar una confirmación de que el cuidador fue alertado.
- La página DEBE ofrecer al hallador la opción de compartir su ubicación en vivo de manera continua hasta que el cuidador llegue (ver §5.7).

### 5.5 Notificación y escalamiento

- El cuidador DEBE poder configurar, por persona protegida, cuáles de los canales {push, correo, SMS, llamada de voz} están habilitados y en qué orden.
- Los cuatro canales DEBEN estar disponibles en el lanzamiento.
- Cuando se reporta un hallazgo, el sistema DEBE intentar los canales configurados en orden, con un retraso configurable entre intentos, y detener la cadena en cuanto el cuidador acuse recibo de la alerta.
- La acción de acuse de recibo DEBE estar disponible desde cualquier canal (toque sobre la notificación push, enlace en el correo, "código de confirmación" por SMS, tecla durante la llamada de voz).
- Si todos los canales configurados fallan en obtener un acuse dentro de la ventana definida, el sistema DEBE registrar la falla y mostrarla al cuidador la próxima vez que abra la aplicación.

### 5.6 Privacidad

- El hallador NO DEBE ver el nombre, la fotografía ni los detalles médicos de la persona protegida por defecto. (La opción por etiqueta de mostrar información adicional queda como mejora de Fase 2, no para v1.)
- El hallador NO DEBE ver, en ningún momento, la información de contacto del cuidador.
- El cuidador, después de acusar recibo, DEBE ver el reporte del hallazgo (ubicación, contacto opcional del hallador, marca de tiempo) y PUEDE elegir contactar al hallador directamente.
- Todos los datos personales DEBEN ser procesados en cumplimiento con la LGPD de Brasil como referencia regional más estricta; los flujos de consentimiento DEBEN ser explícitos y revocables. Los titulares de los datos (cuidadores) DEBEN poder exportar y eliminar sus datos.

### 5.7 Manejo de alertas por parte del cuidador

- El cuidador DEBE poder ver un historial de hallazgos por persona protegida.
- El cuidador DEBE poder marcar un hallazgo como resuelto (persona recuperada) o como falso positivo (por ejemplo, escaneo de prueba o escaneo malicioso).
- Marcar como falso positivo DEBE rate-limitar temporalmente futuros hallazgos sobre la misma etiqueta provenientes de la misma huella de hallador.

### 5.8 Compartición de ubicación en vivo (hallador → cuidador)

- Tras enviar el reporte inicial del hallazgo, al hallador se le DEBE ofrecer en la misma página web una opción de un toque para compartir su ubicación en vivo de manera continua. La opción es opt-in; el hallazgo ya es accionable sin ella.
- Mientras la compartición esté activa, el navegador DEBE transmitir las coordenadas GPS (con marca de tiempo y precisión) al backend en un intervalo razonable (objetivo: cada 5 a 15 segundos), usando un mecanismo tolerante a la app en segundo plano (por ejemplo, `watchPosition` de la Geolocation API combinado con un Service Worker o POST con `keepalive`, para que un breve cambio de pestaña no corte el flujo).
- La aplicación del cuidador DEBE renderizar la posición en vivo sobre una vista de mapa (Google Maps embebido o equivalente) con el último pin y un breve trazado de los puntos recientes; las actualizaciones DEBERÍAN aparecer en tiempo casi-real (≤10 s de latencia extremo a extremo).
- La compartición DEBE detenerse automáticamente cuando ocurra cualquiera de los siguientes eventos: el hallador presiona "Detener", el hallador cierra la página o cierra el navegador, el cuidador marca el hallazgo como Resuelto, o se cumple un tope máximo (por defecto: 60 minutos).
- El hallador DEBE poder ver, en su propia página, un indicador de que la ubicación se está compartiendo y un control claro para detenerla en cualquier momento.
- La identidad del hallador permanece privada para el cuidador. El cuidador ve únicamente: el pin en vivo, el trazado, la marca de tiempo de la última actualización y (si el hallador eligió compartirlo previamente) el contacto opcional.
- El cuidador NO DEBE poder enviar mensajes ni iniciar contacto con el hallador *desde la superficie de seguimiento en vivo*; el modelo de un solo sentido se mantiene (el cuidador puede llamar o enviar correo al hallador usando el contacto opcional de §5.3).
- Las coordenadas en vivo DEBEN conservarse únicamente lo necesario para el hallazgo activo, más una breve ventana de auditoría (por defecto: 24 horas tras Resuelto o expirado), y luego eliminarse, en línea con §5.5 / LGPD y minimización de datos.
- Antes del primer envío de GPS, al hallador DEBE mostrársele un aviso de consentimiento claro y en lenguaje sencillo, explicando qué se comparte, con quién, por cuánto tiempo y cómo detenerlo.

### 5.9 Internacionalización

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

### CU-0: Un partner genera un lote de códigos QR

1. Una marca partner inicia sesión en el portal de partners (o llama directamente a la API de LNF).
2. El partner solicita un lote de `N` códigos QR para una próxima producción, opcionalmente etiquetando el lote (ej. "campaña otoño-invierno 26").
3. LNF genera `N` códigos únicos no adivinables y los crea en estado `unactivated`, atribuidos al partner.
4. El partner descarga un CSV firmado con los códigos a través de una URL de un solo uso y con expiración.
5. El partner ingresa el CSV en su pipeline de impresión o etiquetado; los códigos son impresos sobre las prendas antes de la venta.

**Éxito:** Un nuevo lote de códigos `unactivated` existe en el sistema, el partner cuenta con el CSV necesario para imprimirlos y la analítica del lote arranca en cero.

### CU-1: El cuidador activa una etiqueta adquirida

1. El cuidador compra una prenda con QR pre-impreso a un partner.
2. El cuidador abre la aplicación móvil de LNF (creando una cuenta si es la primera vez, o iniciando sesión si ya estaba registrado) y escanea el QR con la cámara dentro de la app, o escanea con la cámara del teléfono y el universal link enruta a la app de LNF.
3. La app llama al backend con el código; el backend reporta que la etiqueta está `unactivated` y pertenece a un lote del partner.
4. La app guía al cuidador a seleccionar una persona protegida existente o agregar una nueva (alias privado, nota pública opcional, canales de notificación preferidos). Correo y/o teléfono son verificados antes de habilitar los canales SMS o voz.
5. El cuidador etiqueta la prenda (ej. "campera azul") y confirma.
6. El backend marca la etiqueta como `active`, la vincula a la persona protegida y emite un evento de auditoría.

**Éxito:** La etiqueta queda vinculada a una cadena de alertas configurada. Los próximos escaneos por extraños generarán hallazgos; los próximos escaneos por el mismo cuidador mostrarán detalles informativos.

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

### CU-5: El hallador comparte ubicación en vivo mientras espera al cuidador

1. El hallador acaba de enviar el reporte inicial del hallazgo (CU-2).
2. La página de confirmación ofrece la opción "Compartir mi ubicación en vivo con el cuidador hasta que llegue", con una explicación clara y en lenguaje sencillo.
3. El hallador presiona la opción y otorga el permiso de GPS del navegador (puede ser un permiso distinto al de CU-2 si el navegador exige re-consentimiento para acceso continuo).
4. La página comienza a transmitir muestras de GPS al backend; un indicador en la página muestra "Compartiendo ubicación en vivo" junto a un botón Detener.
5. El cuidador, una vez confirmado el alerta (CU-3), abre el detalle del hallazgo y ve un mapa en vivo con un pin que se mueve en tiempo casi-real, junto con la hora de la última actualización.
6. El cuidador se desplaza hacia la ubicación. Al llegar (o cuando el hallador se retira), el hallador presiona Detener, o el cuidador marca el hallazgo como Resuelto, o se cumplen los 60 minutos.
7. La compartición en vivo termina; el trazado se conserva durante la ventana de auditoría (24 h tras Resuelto) y luego se elimina.

**Éxito:** El cuidador pudo seguir la posición del hallador / persona protegida en tiempo real sin ver jamás la identidad del hallador, y el seguimiento terminó limpiamente mediante cualquiera de las cuatro condiciones de detención.

### CU-6: El cuidador retira una prenda

1. El cuidador abre la aplicación y va a las etiquetas de la persona protegida.
2. El cuidador selecciona la etiqueta de la prenda gastada y presiona Revocar.
3. A partir de ese momento, los escaneos de ese QR muestran una página de "esta etiqueta ya no está activa" y no disparan ninguna alerta.

**Éxito:** No se generan más notificaciones para la etiqueta retirada.

## 8. Preguntas abiertas

- Tiempos exactos de escalamiento (push → correo → SMS → voz). Propuesta por defecto: 2 / 5 / 5 minutos; configurable por el operador.
- UX de acuse-vía-SMS (responder con código vs. tocar un enlace). Se recomienda toque de enlace; manejar respuestas inbound de Twilio agrega complejidad.
- Tope de gasto diario por defecto por cuenta. Requiere una tabla de precios país por país antes de fijar un valor.
- Si se debe ofrecer una aplicación web para el cuidador en el lanzamiento o si basta con móvil más una vista web mínima de "gestión de cuenta".
- Si usar Google Maps Platform para la vista en vivo del cuidador (UX familiar, costo por carga de mapa y por solicitud de direcciones) o una alternativa libre (MapLibre + tiles de OpenStreetMap, algo menos pulida pero sin tarifa por carga). La decisión afecta el modelo de costos.
- El soporte de los navegadores para geolocalización continua en segundo plano varía (especialmente iOS Safari, que aplica un throttling agresivo cuando la pestaña no está en primer plano). La página debe manejar con elegancia cuando el flujo se cae — definir la UX (por ejemplo, "Toque para reanudar la compartición").
- Modelo de cobro a partners: por código generado, por etiqueta activada, por hallazgo, cuota mensual o un híbrido. Determina si se necesita un módulo de facturación / suscripción en v1.
- Política de descarga del CSV de códigos para partners: un solo uso (más seguro), N veces dentro de una ventana (más tolerante), o accesible cuando el partner lo pida (más cómodo, más débil). Propuesta por defecto: un solo uso, con re-emisión a 7 días previa solicitud del partner.
- Páginas del hallador con marca del partner y temas por partner (logo, contacto de soporte). Fuera de alcance para v1, pero el modelo de datos debe dejar espacio — registrarlo al diseñar la tabla `partner`.
