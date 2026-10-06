// Unambiguous characters (no 0/O, 1/l/I) so a password read out or typed from a message isn't misread.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** A random 16-character password from the browser's cryptographic RNG. */
export function generatePassword(length = 16): string {
  const limit = 256 - (256 % ALPHABET.length); // reject values that would bias the choice
  let out = "";
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) { if (b < limit && out.length < length) out += ALPHABET[b % ALPHABET.length]; }
  }
  return out;
}
