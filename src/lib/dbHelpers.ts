export function parseTags(sourceTags: string | null | undefined): string[] {
  if (!sourceTags) return [];
  try { return JSON.parse(sourceTags); } catch { return []; }
}
export function serializeTags(tags: string[]): string {
  return JSON.stringify(tags);
}
