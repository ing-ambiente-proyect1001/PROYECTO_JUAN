/**
 * Configuración PÚBLICA del cliente Angular para Web Push y Supabase.
 *
 * SEGURIDAD (repositorio público):
 * - NUNCA pongas aquí la VAPID_PRIVATE_KEY ni la clave sb_secret_ de Supabase.
 * - Solo van la clave pública VAPID, la URL pública del proyecto Supabase
 *   y la clave pública sb_publishable_ protegida por Row Level Security (RLS).
 */
export const PUSH_PUBLIC_CONFIG = {
  /** Clave pública VAPID en formato Base64 URL-safe (generada con pywebpush/vapid). */
  vapidPublicKey: "BEkjd6hqx28RC9KlXJLMqqGHnMDyyu-HSAMd4CE0lRLKHdipyr3zsUSHfLVUtEsIItXwKcwM6LNwFh3s9KuotR0",

  /** URL pública de tu proyecto Supabase (ej. "https://abcdefghijklmno.supabase.co"). */
  supabaseUrl: "https://wxifycmlstbzzcbatdks.supabase.co",

  /** Clave pública sb_publishable_... de Supabase (NUNCA sb_secret_). */
  supabasePublishableKey: "sb_publishable_PG8e-vJEtgmXmpG6SuPoGA_Toai-GSR",
} as const;

export function isPushPublicConfigReady(): boolean {
  const { vapidPublicKey, supabaseUrl, supabasePublishableKey } =
    PUSH_PUBLIC_CONFIG;
  return (
    vapidPublicKey.length > 20 &&
    !vapidPublicKey.includes("BEkjd6hqx28RC9KlXJLMqqGHnMDyyu-HSAMd4CE0lRLKHdipyr3zsUSHfLVUtEsIItXwKcwM6LNwFh3s9KuotR0") &&
    supabaseUrl.startsWith("https://wxifycmlstbzzcbatdks.supabase.co") &&
    !supabaseUrl.includes("https://wxifycmlstbzzcbatdks.supabase.co") &&
    supabasePublishableKey.startsWith("sb_publishable_")
  );
}
