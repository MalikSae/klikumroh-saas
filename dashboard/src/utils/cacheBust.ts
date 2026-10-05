// Some uploads are stored at a fixed path (e.g. /uploads/{tenant}/agent/poster.webp): replacing the image
// keeps the same URL, so the browser keeps showing the cached old picture. The displayed src gets a
// version parameter after an upload in this session. Only the displayed src: the stored URL is unchanged.
export const withVersion = (src: string, version: number | null): string => {
  if (!src || version === null || src.startsWith('blob:') || src.startsWith('data:')) return src;
  const [base, hash] = src.split('#', 2);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${version}${hash !== undefined ? `#${hash}` : ''}`;
};
