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
