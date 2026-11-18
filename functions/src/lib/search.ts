/**
 * Firestore has no full-text search. We store lowercase prefixes of the
 * searchable fields in `searchKeywords` and query with array-contains.
 * (Future: swap for Algolia / Typesense / Vertex AI Search.)
 */
const MAX_PREFIX = 30;

export function buildSearchKeywords(...values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const lower = value.toLowerCase().trim();
    const tokens = new Set([lower, ...lower.split(/[\s,@/()_.]+/)]);
    for (const t of tokens) {
      if (!t) continue;
      for (let i = 1; i <= Math.min(t.length, MAX_PREFIX); i++) set.add(t.slice(0, i));
    }
  }
  return [...set].slice(0, 500);
}
