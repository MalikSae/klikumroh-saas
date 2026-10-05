/**
 * Copies text and reports whether it really landed on the clipboard, so "Tersalin" is never shown for a
 * copy that failed. In-app browsers (WhatsApp, Instagram) often block navigator.clipboard; the older
 * execCommand('copy') on a hidden textarea still works in many of them, so it is tried second.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy copy below.
  }
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
};
