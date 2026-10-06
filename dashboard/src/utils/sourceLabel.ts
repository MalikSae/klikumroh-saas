// Readable names for utm_source values. Meta fills {{site_source_name}} with a short placement code
// (fb, ig, msg, an); older links from the link builder carry "facebook" / "instagram". Other values
// (e.g. "tiktok" from the link builder) are shown as typed.
const META_PLACEMENTS: Record<string, string> = {
  fb: 'Facebook',
  facebook: 'Facebook',
  ig: 'Instagram',
  instagram: 'Instagram',
  msg: 'Messenger',
  an: 'Audience Network',
};

/** A UTM value Meta never filled in (the raw "{{...}}" placeholder) is treated as empty. */
export const utmValue = (value: string | null | undefined): string => {
  const raw = (value ?? '').trim();
  return /^\{\{.*\}\}$/.test(raw) ? '' : raw;
};

export const sourceLabel = (source: string | null | undefined): string => {
  const raw = utmValue(source);
  return META_PLACEMENTS[raw.toLowerCase()] ?? raw;
};
