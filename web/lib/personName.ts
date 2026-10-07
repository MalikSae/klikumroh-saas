// Person-name fields: the first letter of every word becomes a capital while typing ("joko susilo" ->
// "Joko Susilo"), founder request 7 Oct 2026. The other letters stay as typed, so "McDonald", "H. Ahmad"
// or an all-caps name are not changed; a letter after an apostrophe (Ma'ruf) is not a new word.
export function capitalizeName(value: string): string {
  return value.replace(/(^|[\s-])(\p{Ll})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('id-ID'));
}
