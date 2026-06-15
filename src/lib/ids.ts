import { randomBytes } from "crypto";

/**
 * Opaque public IDs with a no-ambiguous-character alphabet (no 0/O/1/I), used
 * for the per-submission customerId and the public result token. 32-char
 * alphabet => `byte & 31` is an unbiased index.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars

export function generateId(length = 8): string {
  let id = "";
  for (const byte of randomBytes(length)) id += ALPHABET.charAt(byte & 31);
  return id;
}

/** 8-char customer id (minted at lead capture, persisted on the submission). */
export const generateCustomerId = (): string => generateId(8);

/** 16-char result token (minted on completion; goes in the destination URL). */
export const generateToken = (): string => generateId(16);
