// sha256 of a text as lowercase hex, in the browser. The spend page hashes the document it prints
// and compares the result with the digest the contract published, so a reader can check that the
// words on screen are the bytes that were judged.

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
