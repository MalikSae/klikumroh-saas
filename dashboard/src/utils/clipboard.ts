// Copy text to the clipboard. navigator.clipboard only exists on secure origins (https, localhost), so on
// plain http (e.g. a LAN address) it falls back to a hidden textarea + execCommand('copy').
// Resolves to true only when the text was really copied: callers show "Tersalin" only then.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the fallback
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Off-screen and invisible (ui.css), so selecting it does not scroll or flash the page.
    ta.className = 'ku-copy-buffer';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
