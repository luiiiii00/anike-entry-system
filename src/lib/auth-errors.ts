/**
 * Traduce errores técnicos de autenticación / base de datos a mensajes
 * comprensibles. Nunca exponemos textos como "JWT expired" o "RLS violation".
 */
export function friendlyAuthError(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  if (raw.includes("invalid login credentials") || raw.includes("invalid credentials"))
    return "Email o contraseña incorrectos.";
  if (raw.includes("email not confirmed"))
    return "Debes confirmar tu email antes de entrar. Revisa tu bandeja de entrada.";
  if (raw.includes("already registered") || raw.includes("already been registered"))
    return "Ya existe una cuenta con este email. Inicia sesión.";
  if (raw.includes("known to be weak") || raw.includes("pwned"))
    return "Esa contraseña aparece en filtraciones públicas y no es segura. Elige otra combinación única (evita palabras como 'trader' o secuencias de números).";
  if (
    raw.includes("password should be") ||
    raw.includes("weak password") ||
    raw.includes("weak_password")
  )
    return "La contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.";
  if (raw.includes("rate limit") || raw.includes("too many"))
    return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (
    raw.includes("jwt") ||
    raw.includes("session") ||
    raw.includes("token") ||
    raw.includes("401")
  )
    return "Tu sesión ha expirado. Inicia sesión nuevamente.";
  if (
    raw.includes("row-level security") ||
    raw.includes("row level security") ||
    raw.includes("permission denied") ||
    raw.includes("policy") ||
    raw.includes("42501") ||
    raw.includes("403")
  )
    return "No tienes permiso para acceder a este contenido.";
  if (raw.includes("failed to fetch") || raw.includes("network"))
    return "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  if (raw.includes("provider is not enabled") || raw.includes("unsupported provider"))
    return "Este método de acceso todavía no está disponible.";

  return "No fue posible completar la operación. Inténtalo de nuevo.";
}

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "Escribe tu email.";
  if (value.length > 255) return "El email es demasiado largo.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "Escribe un email válido.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (password.length > 72) return "La contraseña es demasiado larga.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    return "La contraseña debe incluir letras y números.";
  return null;
}

export function validateName(name: string): string | null {
  const value = name.trim();
  if (!value) return "Escribe tu nombre.";
  if (value.length > 100) return "El nombre es demasiado largo.";
  return null;
}
