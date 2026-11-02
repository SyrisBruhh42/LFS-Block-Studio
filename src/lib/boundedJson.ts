/** Storage/export adapters must reject oversize JSON rather than truncate it. */
export function stringifyBoundedJson(value: unknown, maxBytes: number, label: string): string {
  const json = JSON.stringify(value);
  if (typeof json !== 'string' || new TextEncoder().encode(json).byteLength > maxBytes) {
    throw new Error(`${label} exceeds this service's size limit. Keep the complete local project or download a project backup.`);
  }
  return json;
}
