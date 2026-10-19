import React, { useCallback, useEffect, useState } from 'react';
import { Save, Send, RefreshCw, AlertCircle, CheckCircle2, AlertTriangle, RotateCw } from 'lucide-react';
import { AdminLayout } from '../layout/AdminLayout';
import {
  fetchPlatformMetaStaff,
  updatePlatformMetaStaff,
  testPlatformMetaStaff,
  resendPlatformPurchasesStaff,
  type PlatformMetaSettings,
} from '../../../services/staffApi';
import { FormInput } from '../shared/FormInput';
import { Tooltip } from '../shared/Tooltip';
import { formatDateTimeWIB } from '../../../utils/datetime';

const INTRO_TOOLTIP =
  'Pixel milik KlikUmroh untuk mengukur iklan yang mengajak travel mendaftar (klikumroh.id). ' +
  'Browser mengirim PageView, ViewContent, InitiateCheckout, dan Lead. Server mengirim Lead (event ID sama) ' +
  'dan Purchase saat pembayaran pertama travel dikonfirmasi. Token disimpan terenkripsi dan tidak pernah ditampilkan lagi. ' +
  'Data kontak dikirim ke Meta dalam bentuk hash; pastikan Kebijakan Privasi menyebut hal ini sebelum token diisi.';

type Busy = 'load' | 'save' | 'test' | 'resend' | null;

/**
 * KlikUmroh's own Meta Pixel + Conversions API (for the ads that bring in travels): one page in the Pemasaran
 * group, separate from the platform settings form so saving here never touches bank or legal fields.
 */
export const AdminMetaAdsView: React.FC = () => {
  const [settings, setSettings] = useState<PlatformMetaSettings | null>(null);
  const [pixelId, setPixelId] = useState('');
  const [testCode, setTestCode] = useState('');
  // Empty keeps the stored token: the token itself never comes back from the server.
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<Busy>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = (s: PlatformMetaSettings) => {
    setSettings(s);
    setPixelId(s.pixel_id);
    setTestCode(s.test_event_code);
  };

  const load = useCallback(async () => {
    try {
      setBusy('load');
      setError(null);
      apply(await fetchPlatformMetaStaff());
    } catch (err: any) {
      setSettings(null);
      setError(err.message || 'Gagal memuat pengaturan Meta Ads');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Runs one action: clears the messages first, always releases the busy flag.
  const run = async (kind: Exclude<Busy, 'load' | null>, fallback: string, action: () => Promise<void>) => {
    try {
      setBusy(kind);
      setError(null);
      setNotice(null);
      await action();
    } catch (err: any) {
      setError(err.message || fallback);
      // A failed delivery changes the status shown below.
      if (kind === 'test' || kind === 'resend') {
        try {
          apply(await fetchPlatformMetaStaff());
        } catch {
          /* keep the form as it is */
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const save = (clearToken: boolean) =>
    run('save', 'Gagal menyimpan pengaturan Meta Ads', async () => {
      apply(
        await updatePlatformMetaStaff({
          pixel_id: pixelId.trim(),
          access_token: token.trim() || undefined,
          clear_token: clearToken,
          test_event_code: testCode.trim(),
        }),
      );
      setToken('');
      setNotice(clearToken ? 'Token Conversions API dihapus' : 'Pengaturan Meta Ads disimpan');
    });

  const sendTest = () =>
    run('test', 'Gagal mengirim event uji ke Meta', async () => {
      const r = await testPlatformMetaStaff();
      setNotice(`Event uji diterima Meta (trace ${r.fbtrace_id}). Cek di Events Manager > Test Events.`);
      apply(await fetchPlatformMetaStaff());
    });

  const resend = () =>
    run('resend', 'Gagal mengirim ulang event Purchase', async () => {
      const r = await resendPlatformPurchasesStaff();
      setNotice(
        r.pending === 0
          ? 'Tidak ada pembayaran pertama yang belum terkirim ke Meta'
          : `Purchase tertunda ${r.pending}: ${r.sent} terkirim, ${r.failed} gagal`,
      );
      apply(await fetchPlatformMetaStaff());
    });

  const disabled = busy !== null;
  const capiActive = Boolean(settings?.token_configured && settings.pixel_id);
  const canTest = Boolean(capiActive && settings?.test_event_code);

  return (
    <AdminLayout
      title="Meta Ads"
      subtitle="Pixel dan Conversions API untuk iklan akuisisi travel"
      headerActions={
        <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load()} disabled={disabled}>
          <RefreshCw size={14} className={busy === 'load' ? 'db-spin' : ''} />
          <span>Segarkan</span>
        </button>
      }
    >
      <div style={{ maxWidth: '720px' }}>
        {error && (
          <div role="alert" style={noticeStyle('red')}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div role="status" style={noticeStyle('green')}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{notice}</span>
          </div>
        )}

        {!settings && busy === null && (
          <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void load()}>
            <RefreshCw size={14} />
            <span>Coba lagi</span>
          </button>
        )}

        {settings && (
          <div className="sa-panel" style={{ padding: '24px' }}>
            {!settings.encryption_ready && (
              <div style={{ ...noticeStyle('amber'), alignItems: 'flex-start' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Server belum punya APP_ENCRYPTION_KEY, jadi token belum bisa disimpan. Pixel di browser tetap berjalan.</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px', color: 'var(--sa-text-muted)' }}>
              <span>
                Status Conversions API: <strong>{capiActive ? 'aktif' : 'belum aktif'}</strong>
                {!capiActive && ' (butuh Pixel ID dan token)'}
              </span>
              <Tooltip content={INTRO_TOOLTIP} position="bottom" />
            </div>

            {/* The pixel ID is a plain number: "off" plus a non-login field name keeps the browser from filling a saved email here. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <FormInput
                name="meta-pixel-id"
                label="Pixel ID"
                placeholder="Contoh: 1234567890123456"
                tooltip="10-20 digit angka dari Events Manager > Sumber Data. Kosongkan untuk mematikan pixel di klikumroh.id."
                value={pixelId}
                onChange={(e) => setPixelId(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                disabled={disabled}
              />
              <FormInput
                name="meta-test-event-code"
                label="Test Event Code"
                placeholder="Contoh: TEST12345"
                tooltip="Dari Events Manager > Test Events. Selama terisi, event uji diberi kode ini. Kosongkan setelah pengujian selesai."
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                autoComplete="off"
                disabled={disabled}
              />
            </div>
            <FormInput
              name="meta-capi-token"
              type="password"
              label="Access Token Conversions API"
              placeholder={settings.token_configured ? `Tersimpan (berakhir ${settings.token_hint}), isi untuk mengganti` : 'Tempel token dari Events Manager'}
              tooltip="Events Manager > Sumber Data > Pengaturan > Conversions API > Buat access token. Kosongkan kolom ini agar token yang tersimpan tidak berubah."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="new-password"
              disabled={disabled || !settings.encryption_ready}
            />

            <div style={{ fontSize: '13px', color: 'var(--sa-text-muted)', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {settings.last_success_at && <span>Pengiriman terakhir berhasil: {formatDateTimeWIB(settings.last_success_at)}</span>}
              {settings.last_error && (
                <span style={{ color: 'var(--db-status-lost)' }}>
                  Pengiriman terakhir gagal{settings.last_error_at ? ` (${formatDateTimeWIB(settings.last_error_at)})` : ''}: {settings.last_error}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--sa-border)' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void sendTest()} disabled={disabled || !canTest}>
                  <Send size={14} />
                  <span>{busy === 'test' ? 'Mengirim...' : 'Kirim event uji'}</span>
                </button>
                <Tooltip
                  content="Kirim ulang Purchase untuk pembayaran pertama travel yang sudah dikonfirmasi tetapi belum sampai ke Meta (misalnya saat token belum diisi atau Meta menolak). Meta tidak menghitungnya dua kali."
                  position="top"
                >
                  <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void resend()} disabled={disabled || !capiActive}>
                    <RotateCw size={14} />
                    <span>{busy === 'resend' ? 'Mengirim...' : 'Kirim ulang Purchase'}</span>
                  </button>
                </Tooltip>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {settings.token_configured && (
                  <button type="button" className="sa-btn sa-btn--secondary" onClick={() => void save(true)} disabled={disabled}>
                    <span>Hapus token</span>
                  </button>
                )}
                <button type="button" className="sa-btn sa-btn--primary" onClick={() => void save(false)} disabled={disabled}>
                  <Save size={14} />
                  <span>{busy === 'save' ? 'Menyimpan...' : 'Simpan'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

function noticeStyle(kind: 'red' | 'green' | 'amber'): React.CSSProperties {
  const color = { red: 'var(--db-status-lost)', green: 'var(--db-status-closing)', amber: 'var(--sa-amber-text)' }[kind];
  return {
    padding: '12px 16px',
    backgroundColor: `var(--sa-${kind}-bg)`,
    border: `1px solid var(--sa-${kind}-border)`,
    borderRadius: 'var(--sa-radius-sm)',
    color,
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
  };
}
