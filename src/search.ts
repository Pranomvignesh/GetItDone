/** Filtering for the add bar's /edit picker: prefix, then word start, then anywhere, then loose (subsequence). */

function rank(name: string, query: string): number | null {
  const n = name.toLowerCase()
  if (n.startsWith(query)) return 0
  if (n.split(/[\s,/&-]+/).some((w) => w.startsWith(query))) return 1
  if (n.includes(query)) return 2
  // Every character of the query, in order ("wsh" → "wash shoe").
  let i = 0
  for (const ch of n) if (ch === query[i]) i++
  return i === query.length ? 3 : null
}

/**
 * Best matches first; ties keep the given order (callers pass newest first).
 * Loose matches only appear when nothing matches more directly. An empty
 * query matches everything.
 */
export function searchByName<T extends { name: string }>(items: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return items.slice(0, limit)
  const scored = items
    .map((item, index) => ({ item, index, score: rank(item.name, q) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
  const direct = scored.some((r) => r.score < 3)
  return scored
    .filter((r) => !direct || r.score < 3)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((r) => r.item)
}
