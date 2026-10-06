// "Muat lebih banyak" uses offset paging: a row that arrives between loads shifts the offset, so the next
// page can repeat rows already shown. Append only rows whose id is not on screen yet (first one wins), so
// no row shows twice and React keys stay unique.
export function appendUniqueById<T extends { id: number | string }>(prev: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(prev.map((item) => item.id));
  const out = [...prev];
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
