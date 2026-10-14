import React, { useEffect, useState } from 'react';
import { Megaphone, Save, Send, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  fetchPlatformMetaStaff,
  updatePlatformMetaStaff,
  testPlatformMetaStaff,
  resendPlatformPurchasesStaff,
  type PlatformMetaSettings,
} from '../../../services/staffApi';
import { FormInput } from '../shared/FormInput';
import { Tooltip } from '../shared/Tooltip';

const formatWhen = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
};

/**
 * KlikUmroh's own Meta Pixel + Conversions API (for the ads that bring in travels). Has its own save,
 * separate from the platform settings form above it: saving here never touches bank or legal fields.
 */
export const AdminMetaAdsPanel: React.FC = () => {
  const [settings, setSettings] = useState<PlatformMetaSettings | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [testCode, setTestCode] = useState('');
  // Empty keeps the stored token: the token itself never comes back from the server.
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (s: PlatformMetaSettings) => {
    setSettings(s);
    setPixelId(s.pixel_id);
    setTestCode(s.test_event_code);
  };

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      apply(await fetchPlatformMetaStaff());
    } catch (err: any) {
      setSettings(null);
      setError(err.message || 'Gagal memuat pengaturan Meta Ads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (clearToken: boolean) => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const updated = await updatePlatformMetaStaff({
        pixel_id: pixelId.trim(),
        access_token: token.trim() || undefined,
        clear_token: clearToken,
        test_event_code: testCode.trim(),
      });
      apply(updated);
      setToken('');
      setNotice(clearToken ? 'Token Conversions API dihapus' : 'Pengaturan Meta Ads disimpan');
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan Meta Ads');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    try {
      setTesting(true);
      setError(null);
      setNotice(null);
      const result = await testPlatformMetaStaff();
      setNotice(`Event uji diterima Meta (${result.events_received} event, trace ${result.fbtrace_id}). Cek di Events Manager > Test Events.`);
      // The delivery status changed on the server.
      apply(await fetchPlatformMetaStaff());
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim event uji ke Meta');
      try {
        apply(await fetchPlatformMetaStaff());
      } catch {
        /* keep the form as it is */
      }
    } finally {
      setTesting(false);
    }
  };

  const resend = async () => {
    try {
      setResending(true);
      setError(null);
      setNotice(null);
      const r = await resendPlatformPurchasesStaff();
      setNotice(
        r.pending === 0
          ? 'Tidak ada pembayaran pertama yang belum terkirim ke Meta'
          : `Purchase tertunda ${r.pending}: ${r.sent} terkirim, ${r.failed} gagal`,
      );
      apply(await fetchPlatformMetaStaff());
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim ulang event Purchase');
    } finally {
      setResending(false);
    }
  };

  const busy = loading || saving || testing || resending;
  const canTest = Boolean(settings?.token_configured && settings.pixel_id && settings.test_event_code);

  return (
    <div className="sa-panel" style={{ padding: '24px', marginBottom: '24px', maxWidth: '720px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Megaphone size={18} style={{ color: 'var(--sa-text-muted)' }} />
        <h2 style={{ fontFamily: 'var(--sa-font-display)', fontSize: '16px', fontWeight: 700, margin: 0 }}>
          Meta Ads KlikUmroh
        </h2>
        <Tooltip
          content={
            'Pixel milik KlikUmroh untuk mengukur iklan yang mengajak travel mendaftar (klikumroh.id). ' +
            'Browser mengirim PageView, ViewContent, InitiateCheckout, dan Lead. Server mengirim Lead (dengan event ID yang sama) ' +
            'dan Purchase saat pembayaran pertama travel dikonfirmasi. Token hanya disimpan terenkripsi dan tidak pernah ditampilkan lagi. ' +
            'Data kontak dikirim ke Meta dalam bentuk hash; pastikan Kebijakan Privasi menyebut hal ini sebelum token diisi.'
          }
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-red-bg)',
            border: '1px solid var(--sa-red-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--db-status-lost)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-green-bg)',
            border: '1px solid var(--sa-green-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--db-status-closing)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {settings && !settings.encryption_ready && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--sa-amber-bg)',
            border: '1px solid var(--sa-amber-border)',
            borderRadius: 'var(--sa-radius-sm)',
            color: 'var(--sa-amber-text)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '16px',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>Server belum punya APP_ENCRYPTION_KEY, jadi token Conversions API belum bisa disimpan. Pixel di browser tetap berjalan.</span>
        </div>
      )}

      {!settings && !loading && (
        <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load()}>
          <span>Coba lagi</span>
        </button>
      )}

      {settings && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <FormInput
              name="meta-pixel-id"
              label="Pixel ID"
              placeholder="Contoh: 1234567890123456"
              tooltip="10-20 digit angka dari Events Manager > Sumber Data. Kosongkan untuk mematikan pixel di klikumroh.id."
              value={pixelId}
              onChange={(e) => setPixelId(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
            <FormInput
              name="meta-capi-token"
              type="password"
              label="Access Token Conversions API"
              placeholder={settings.token_configured ? `Tersimpan (berakhir ${settings.token_hint}), isi untuk mengganti` : 'Tempel token dari Events Manager'}
              tooltip="Events Manager > Sumber Data > Pengaturan > Conversions API > Buat access token. Kosongkan kolom ini agar token yang tersimpan tidak berubah."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              disabled={busy || !settings.encryption_ready}
            />
            <FormInput
              name="meta-test-event-code"
              label="Test Event Code"
              placeholder="Contoh: TEST12345"
              tooltip="Dari Events Manager > Test Events. Selama terisi, event uji diberi kode ini. Kosongkan setelah pengujian selesai."
              value={testCode}
              onChange={(e) => setTestCode(e.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </div>

          <div style={{ fontSize: '13px', color: 'var(--sa-text-muted)', margin: '16px 0 0 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span>Conversions API: {settings.token_configured && settings.pixel_id ? 'aktif' : 'belum aktif (butuh Pixel ID dan token)'}</span>
            {settings.last_success_at && <span>Pengiriman terakhir berhasil: {formatWhen(settings.last_success_at)}</span>}
            {settings.last_error && (
              <span style={{ color: 'var(--db-status-lost)' }}>
                Pengiriman terakhir gagal ({formatWhen(settings.last_error_at)}): {settings.last_error}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
            {settings.token_configured && (
              <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void save(true)} disabled={busy}>
                <span>Hapus token</span>
              </button>
            )}
            <Tooltip content="Kirim ulang event Purchase untuk pembayaran pertama travel yang sudah dikonfirmasi tetapi belum sampai ke Meta (misalnya saat token belum diisi atau Meta menolak). Event yang sama tidak dihitung dua kali oleh Meta." position="top">
              <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void resend()} disabled={busy || !settings.token_configured || !settings.pixel_id}>
                <Send size={14} />
                <span>{resending ? 'Mengirim...' : 'Kirim ulang Purchase tertunda'}</span>
              </button>
            </Tooltip>
            <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void sendTest()} disabled={busy || !canTest}>
              <Send size={14} />
              <span>{testing ? 'Mengirim...' : 'Kirim event uji'}</span>
            </button>
            <button type="button" className="sa-btn sa-btn--primary" onClick={() => void save(false)} disabled={busy}>
              <Save size={14} />
              <span>{saving ? 'Menyimpan...' : 'Simpan Meta Ads'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
