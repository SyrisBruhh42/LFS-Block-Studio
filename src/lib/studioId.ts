/** Cryptographic IDs avoid collision with old shared world IDs and prior candidates. */
export function createStudioId(prefix = 'project'): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, v => v.toString(16).padStart(2, '0')).join('')}`;
}
