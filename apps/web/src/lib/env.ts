/**
 * Centralized environment variable validation.
 * Imported by api-auth.ts so it runs when any API route initializes.
 */

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const RECOMMENDED_VARS = [
  "WEBHOOK_SECRET",
  "TASKBOARD_API_KEY",
  "TASKBOARD_ANTHROPIC_KEY",
] as const;

// Only validate at runtime (not during build), and only on server side
const isRuntime =
  typeof window === "undefined" && process.env.NEXT_PHASE !== "phase-production-build";

if (isRuntime) {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `[env] Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in .env.local or your hosting provider. DB calls will fail.`
    );
  }

  const warnings = RECOMMENDED_VARS.filter((key) => !process.env[key]);
  if (warnings.length > 0) {
    console.warn(
      `[env] Recommended vars not set: ${warnings.join(", ")}. ` +
        `Some features (API auth, webhooks, AI parsing) may be unavailable.`
    );
  }
}

export {};
