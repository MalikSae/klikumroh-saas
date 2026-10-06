// Readable names for utm_source values. Meta fills {{site_source_name}} with a short placement code
// (fb, ig, msg, an); other values (e.g. "tiktok" from the link builder) are shown as typed.
const META_PLACEMENTS: Record<string, string> = {
  fb: 'Facebook',
  ig: 'Instagram',
  msg: 'Messenger',
  an: 'Audience Network',
};

export const sourceLabel = (source: string | null | undefined): string => {
  const raw = (source ?? '').trim();
  return META_PLACEMENTS[raw.toLowerCase()] ?? raw;
};
