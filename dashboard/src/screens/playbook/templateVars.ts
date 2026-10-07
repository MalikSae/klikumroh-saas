// Fills the travel-level placeholders of the guide templates with the travel's own data. The other
// placeholders ([Nama], [angka], [tautan referral], ...) are for the reader to fill and are left as they are.
export interface TravelVars {
  name?: string | null;
  /** The travel website's agent sign-up page, e.g. https://abc.klikumroh.id/agen/daftar. */
  recruitLink?: string | null;
  /** PPIU licence number as the travel typed it in Profil travel. */
  ppiu?: string | null;
}

/** PPIU number without a leading "PPIU" / "No." the travel may have typed, since the templates add "PPIU". */
const cleanPpiu = (v?: string | null): string => v?.trim().replace(/^PPIU\s*/i, '').replace(/^No\.?\s*/i, '') ?? '';

export function fillTravelVars(text: string, vars: TravelVars): string {
  const name = vars.name?.trim();
  const link = vars.recruitLink?.trim();
  const ppiu = cleanPpiu(vars.ppiu);
  let out = text;
  if (name) out = out.split('[Nama Travel]').join(name);
  if (link) out = out.split('[tautan halaman daftar agen travel Anda]').join(link).split('[tautan halaman daftar agen]').join(link);
  if (ppiu) out = out.split('[nomor]').join(ppiu);
  return out;
}
