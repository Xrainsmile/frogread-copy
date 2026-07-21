// SHA-256 based content hashing used to dedupe paragraphs and cache translations.

export async function hashText(text: string): Promise<string> {
  // Strip leading/trailing whitespace before hashing so trivially different
  // whitespace doesn't create duplicate cache entries.
  const normalized = text.trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
