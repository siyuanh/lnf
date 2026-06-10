export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lnf_locale";

export const dict = {
  en: {
    "common.appName": "LNF",
    "common.languageEnglish": "English",
    "common.languageSpanish": "Español",
    "common.switchTo": "Switch language",

    "home.title": "LNF",

    "login.title": "Partner login",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",
    "login.failed": "sign in failed",
    "login.expired": "Your session expired. Please sign in again.",

    "header.logout": "Log out",

    "batches.title": "Batches",
    "batches.newBatch": "New batch",
    "batches.loading": "Loading…",
    "batches.empty": "No batches yet.",
    "batches.colCreated": "Created",
    "batches.colLabel": "Label",
    "batches.colSize": "Size",
    "batches.colCsv": "CSV",
    "batches.csvDownloaded": "downloaded",
    "batches.csvPending": "pending",
    "batches.dash": "—",
    "batches.view": "View",

    "batchDetail.title": "Batch detail",
    "batchDetail.loading": "Loading…",
    "batchDetail.empty": "No tags in this batch.",
    "batchDetail.download": "Download CSV",
    "batchDetail.colCode": "Code",
    "batchDetail.colState": "Status",
    "batchDetail.colActivated": "Activated",
    "batchDetail.loadMore": "Load more",
    "batchDetail.back": "Back to batches",
    "batchDetail.size": "Size",
    "batchDetail.created": "Created",

    "tagState.inactive": "INACTIVE",
    "tagState.active": "ACTIVE",
    "tagState.registered": "REGISTERED",
    "tagState.deprecated": "DEPRECATED",

    "newBatch.title": "New batch",
    "newBatch.size": "Size",
    "newBatch.label": "Label (optional)",
    "newBatch.submit": "Mint batch",
    "newBatch.submitting": "Minting…",
    "newBatch.statusError": "status",
    "newBatch.created": "Batch created",
    "newBatch.batchId": "Batch ID",
    "newBatch.codeCount": "{{n}} codes",
    "newBatch.warning": "These codes are shown once. Download the zip now and store it safely.",
    "newBatch.downloadZip": "Download zip (CSV + PNGs)",
    "newBatch.buildingZip": "Building zip…",
    "newBatch.csvOnly": "CSV only (single-use link)",
    "newBatch.preview": "Preview",
    "newBatch.previewSubset": "(first {{shown}} of {{total}})",
    "newBatch.overflow": "…and {{n}} more in the zip download.",
    "newBatch.back": "Back to list",

    "finder.title": "This tag is new.",
    "finder.body": "Install the LNF app to activate it and link it to a person you care for.",
    "finder.titleActive": "This tag is active.",
    "finder.bodyActive": "Install the LNF app to link it to a person you care for.",
    "finder.titleRegistered": "Found a lost item?",
    "finder.bodyRegistered": "Open the LNF app to report this find and help reunite it with its caregiver.",
    "finder.titleDeprecated": "This tag is no longer in use.",
    "finder.bodyDeprecated": "If you have questions, contact the partner that issued it.",
    "finder.tag": "tag",
  },
  es: {
    "common.appName": "LNF",
    "common.languageEnglish": "English",
    "common.languageSpanish": "Español",
    "common.switchTo": "Cambiar idioma",

    "home.title": "LNF",

    "login.title": "Acceso de partner",
    "login.email": "Correo electrónico",
    "login.password": "Contraseña",
    "login.submit": "Iniciar sesión",
    "login.submitting": "Iniciando sesión…",
    "login.failed": "no se pudo iniciar sesión",
    "login.expired": "Tu sesión expiró. Inicia sesión de nuevo.",

    "header.logout": "Cerrar sesión",

    "batches.title": "Lotes",
    "batches.newBatch": "Nuevo lote",
    "batches.loading": "Cargando…",
    "batches.empty": "Aún no hay lotes.",
    "batches.colCreated": "Creado",
    "batches.colLabel": "Etiqueta",
    "batches.colSize": "Tamaño",
    "batches.colCsv": "CSV",
    "batches.csvDownloaded": "descargado",
    "batches.csvPending": "pendiente",
    "batches.dash": "—",
    "batches.view": "Ver",

    "batchDetail.title": "Detalle del lote",
    "batchDetail.loading": "Cargando…",
    "batchDetail.empty": "Este lote no tiene etiquetas.",
    "batchDetail.download": "Descargar CSV",
    "batchDetail.colCode": "Código",
    "batchDetail.colState": "Estado",
    "batchDetail.colActivated": "Activado",
    "batchDetail.loadMore": "Cargar más",
    "batchDetail.back": "Volver a lotes",
    "batchDetail.size": "Tamaño",
    "batchDetail.created": "Creado",

    "tagState.inactive": "INACTIVO",
    "tagState.active": "ACTIVO",
    "tagState.registered": "REGISTRADO",
    "tagState.deprecated": "DESACTIVADO",

    "newBatch.title": "Nuevo lote",
    "newBatch.size": "Tamaño",
    "newBatch.label": "Etiqueta (opcional)",
    "newBatch.submit": "Generar lote",
    "newBatch.submitting": "Generando…",
    "newBatch.statusError": "código",
    "newBatch.created": "Lote creado",
    "newBatch.batchId": "ID del lote",
    "newBatch.codeCount": "{{n}} códigos",
    "newBatch.warning": "Estos códigos se muestran una sola vez. Descarga el zip ahora y guárdalo en lugar seguro.",
    "newBatch.downloadZip": "Descargar zip (CSV + PNG)",
    "newBatch.buildingZip": "Generando zip…",
    "newBatch.csvOnly": "Solo CSV (enlace de un único uso)",
    "newBatch.preview": "Vista previa",
    "newBatch.previewSubset": "(primeros {{shown}} de {{total}})",
    "newBatch.overflow": "…y {{n}} más en la descarga zip.",
    "newBatch.back": "Volver a la lista",

    "finder.title": "Esta etiqueta es nueva.",
    "finder.body": "Instala la app de LNF para activarla y vincularla a una persona a tu cargo.",
    "finder.titleActive": "Esta etiqueta está activa.",
    "finder.bodyActive": "Instala la app de LNF para vincularla a una persona a tu cargo.",
    "finder.titleRegistered": "¿Encontraste un objeto perdido?",
    "finder.bodyRegistered": "Abre la app de LNF para reportar este hallazgo y ayudar a devolverlo a quien lo cuida.",
    "finder.titleDeprecated": "Esta etiqueta ya no está en uso.",
    "finder.bodyDeprecated": "Si tienes dudas, contacta al partner que la emitió.",
    "finder.tag": "etiqueta",
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type DictKey = keyof typeof dict.en;

export function tFor(locale: Locale): (key: DictKey, vars?: Record<string, string | number>) => string {
  const table = dict[locale];
  return (key, vars) => {
    let s: string = table[key] ?? dict.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{{${k}}}`, String(v));
    return s;
  };
}
