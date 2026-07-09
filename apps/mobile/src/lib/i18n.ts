import { getLocales } from "expo-localization";

// Compact mobile dictionary. Mirrors the web keys we actually use on mobile.
// Kept local (not imported from the web app) because the web dict pulls in
// browser-only concerns; the shared source of truth for *data* is @app/schemas.
const dict = {
  en: {
    "login.title": "Caregiver sign in",
    "login.email": "Email",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",
    "login.failed": "Sign in failed",
    "login.toSignup": "No account? Create one",
    "signup.title": "Create account",
    "signup.name": "Your name",
    "signup.phone": "Phone (optional)",
    "signup.submit": "Create account",
    "signup.submitting": "Creating…",
    "signup.failed": "Could not create account",
    "signup.toLogin": "Already have an account? Sign in",
    "tags.title": "Your tags",
    "tags.loading": "Loading…",
    "tags.empty": "No registered tags yet.",
    "tags.error": "Could not load tags.",
    "tags.person": "Person",
    "tags.retry": "Retry",
    "tagDetail.loading": "Loading…",
    "tagDetail.notFound": "Tag not found.",
    "tagDetail.person": "Person",
    "tagDetail.noPerson": "No person details.",
    "tagDetail.details": "Details",
    "tagDetail.contact": "Contact finders reach",
    "tagDetail.noContact": "No contact linked.",
    "tagDetail.state": "Status",
    "tagDetail.back": "Back",
    "common.signOut": "Sign out",
  },
  es: {
    "login.title": "Acceso de cuidador",
    "login.email": "Correo",
    "login.password": "Contraseña",
    "login.submit": "Iniciar sesión",
    "login.submitting": "Iniciando…",
    "login.failed": "No se pudo iniciar sesión",
    "login.toSignup": "¿Sin cuenta? Crea una",
    "signup.title": "Crear cuenta",
    "signup.name": "Tu nombre",
    "signup.phone": "Teléfono (opcional)",
    "signup.submit": "Crear cuenta",
    "signup.submitting": "Creando…",
    "signup.failed": "No se pudo crear la cuenta",
    "signup.toLogin": "¿Ya tienes cuenta? Inicia sesión",
    "tags.title": "Tus etiquetas",
    "tags.loading": "Cargando…",
    "tags.empty": "Aún no hay etiquetas registradas.",
    "tags.error": "No se pudieron cargar las etiquetas.",
    "tags.person": "Persona",
    "tags.retry": "Reintentar",
    "tagDetail.loading": "Cargando…",
    "tagDetail.notFound": "Etiqueta no encontrada.",
    "tagDetail.person": "Persona",
    "tagDetail.noPerson": "Sin datos de la persona.",
    "tagDetail.details": "Detalles",
    "tagDetail.contact": "Contacto para quien la encuentre",
    "tagDetail.noContact": "Sin contacto vinculado.",
    "tagDetail.state": "Estado",
    "tagDetail.back": "Atrás",
    "common.signOut": "Cerrar sesión",
  },
} as const;

type Key = keyof (typeof dict)["en"];

const locale = (getLocales()[0]?.languageCode ?? "en").toLowerCase() === "es" ? "es" : "en";

export function t(key: Key): string {
  return dict[locale][key] ?? dict.en[key] ?? key;
}
