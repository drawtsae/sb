import { hash, verify } from "@node-rs/argon2";

// argon2id with the library's default cost parameters.
const opts = { algorithm: 2 as const }; // Algorithm.Argon2id (const enum, not importable under isolatedModules)

export function hashPassword(pw: string): Promise<string> {
  return hash(pw, opts);
}

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}

export const MIN_PASSWORD = 8;
/** The ADMIN_PASSWORD value shipped in .env.production.example. */
export const ENV_PLACEHOLDER_PASSWORD = "change-me-to-a-long-random-password";

/** Why a password must not be used for an account, or null when it is acceptable. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `must be at least ${MIN_PASSWORD} characters`;
  if (pw === ENV_PLACEHOLDER_PASSWORD || pw.toLowerCase().includes("change-me")) {
    return "is still the example placeholder (contains \"change-me\")";
  }
  return null;
}
