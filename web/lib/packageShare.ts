// Sharing one package: a ready-to-send message (name, departure, price, link) plus the package photo.
// Used by the package detail page and the agent home ("Syiarkan!"). With a photo the system share sheet
// sends the image with the message as its caption (WhatsApp, Telegram, etc.); where files cannot be shared
// it falls back to text only, then to copying the message.

export interface SharePackageInfo {
  id: number;
  name: string;
  departure_date?: string | null;
  price?: number | null;
  // The travel that sells the package: named in the message so the receiver knows who is offering it.
  travel_name?: string | null;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

// The share habit counts only once the message really left (share sheet completed) or is really on the
// clipboard (copy fallback). A cancelled or failed share sheet does not count.
export const shareCountsAsHabit = (result: ShareResult): boolean => result === 'shared' || result === 'copied';

const formatDate = (d?: string | null) =>
  d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

const formatPrice = (p?: number | null) => (p ? 'Rp ' + Math.floor(p).toLocaleString('id-ID') : '');

export const packageShareText = (pkg: SharePackageInfo, link: string): string => {
  const date = formatDate(pkg.departure_date);
  const price = formatPrice(pkg.price);
  // Neutral on purpose (no greeting): the agent pastes it into groups, statuses and chats of all kinds.
  // Only facts from the package go in; nothing claims scarcity or a discount that may not be true.
  const travel = pkg.travel_name?.trim();
  const lines = [`Saatnya wujudkan niat umroh${travel ? ` bersama ${travel}` : ''}: ${pkg.name}${date ? `, berangkat ${date}` : ''}.`];
  if (price) lines.push(`Mulai ${price}.`);
  lines.push('', 'Lihat fasilitas, jadwal, dan cara daftarnya di sini:', link);
  return lines.join('\n');
};

// The agent's referral route for one package (counts the click, then opens the package with ?ref=).
export const agentPackageLink = (referralCode: string, packageId: number): string =>
  `${window.location.origin}/ref/${encodeURIComponent(referralCode)}?to=${encodeURIComponent(`/paket/${packageId}`)}`;

// The photo as JPEG: package photos are stored as WebP, which some chat apps send as a sticker or a file.
// Prepare it before the tap: the share sheet must open shortly after the click (user activation), and
// fetching plus converting a photo inside the click handler can take too long.
export const packagePhotoFile = async (src: string, name: string): Promise<File | null> => {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!blob) return null;
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'paket';
    return new File([blob], `${safe}.jpg`, { type: 'image/jpeg' });
  } catch {
    return null;
  }
};

// The classic copy for browsers where the async clipboard does not exist: a page opened over plain http (a phone
// reaching a dev server by its LAN address), an in-app WebView, an old browser. It must run inside the tap.
const legacyCopy = (text: string): boolean => {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  try {
    area.value = text;
    area.setAttribute('readonly', '');
    // Off screen, but still selectable (iOS refuses display:none).
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '-9999px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
};

const copyText = async (text: string): Promise<ShareResult> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // permission refused or no secure context: try the classic way below
  }
  return legacyCopy(text) ? 'copied' : 'failed';
};

// Whether this browser can open the system share sheet with an image attached.
export const canShareFiles = (): boolean => {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([new Blob()], 'x.jpg', { type: 'image/jpeg' })] });
  } catch {
    return false;
  }
};

// `file` is the photo from packagePhotoFile (null shares the message only).
export const sharePackage = async (pkg: SharePackageInfo, link: string, file: File | null): Promise<ShareResult> => {
  const text = packageShareText(pkg, link);
  if (typeof navigator === 'undefined' || !navigator.share) return copyText(text);

  // The link stays inside the text: with files attached many apps drop the separate url field.
  const data: ShareData = file && navigator.canShare?.({ files: [file] }) ? { files: [file], text } : { title: pkg.name, text };
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    // e.g. the app refused the image: share the text only.
    try {
      await navigator.share({ title: pkg.name, text });
      return 'shared';
    } catch (err2) {
      if (err2 instanceof DOMException && err2.name === 'AbortError') return 'cancelled';
      return copyText(text);
    }
  }
};
