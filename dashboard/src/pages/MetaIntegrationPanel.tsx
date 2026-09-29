import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, KeyRound, RefreshCw, Save, Send } from 'lucide-react';
import { Button, Card, FormInput, Tooltip } from '../components';
import {
  type MetaIntegrationSettings,
  fetchMetaIntegration,
  saveMetaIntegration,
  sendMetaTestEvent,
} from '../services/api';
import './MetaIntegrationPanel.css';

// Standard Meta events sent for this travel (see internal/service/meta.go).
const TRACKED_EVENTS: { name: string; where: string }[] = [
  { name: 'PageView', where: 'Setiap halaman situs travel dibuka' },
  { name: 'ViewContent', where: 'Calon jamaah membuka detail paket' },
  { name: 'Contact', where: 'Calon jamaah menekan tombol Chat WhatsApp' },
  { name: 'Lead', where: 'Form minat terkirim (Pixel + Conversions API, tidak dihitung ganda)' },
  { name: 'Purchase', where: 'Admin menandai prospek dari website sebagai Closing (DP), nilai = harga paket x jumlah jamaah' },
];

/** Settings tab "Integrasi Meta": per-travel Pixel ID, Conversions API token and test event code. */
export const MetaIntegrationPanel: React.FC = () => {
  const [settings, setSettings] = useState<MetaIntegrationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pixelId, setPixelId] = useState('');
  const [token, setToken] = useState('');
  const [replacingToken, setReplacingToken] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const apply = (s: MetaIntegrationSettings) => {
    setSettings(s);
    setPixelId(s.pixel_id);
    setTestCode(s.test_event_code);
    setToken('');
    setReplacingToken(false);
  };

  useEffect(() => {
    fetchMetaIntegration()
      .then(apply)
      .catch((err: Error) => setMessage({ kind: 'error', text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  const save = async (clearToken = false, overrideTestCode?: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const next = await saveMetaIntegration({
        pixel_id: pixelId.trim(),
        test_event_code: (overrideTestCode ?? testCode).trim(),
        ...(clearToken ? { clear_token: true } : token.trim() ? { access_token: token.trim() } : {}),
      });
      apply(next);
      setMessage({
        kind: 'success',
        text: clearToken
          ? 'Token Conversions API dihapus.'
          : overrideTestCode === ''
          ? 'Mode uji dimatikan. Event server kini dihitung untuk iklan.'
          : 'Integrasi Meta disimpan.',
      });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Gagal menyimpan integrasi Meta' });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await sendMetaTestEvent();
      setMessage({
        kind: 'success',
        text: `Event uji diterima Meta (${res.events_received} event). Cek di Events Manager > Test Events.`,
      });
    } catch (err: any) {
      setMessage({ kind: 'error', text: err.message || 'Gagal mengirim event uji' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="db-meta-loading">
        <RefreshCw size={18} className="db-spin" />
        <span>Memuat integrasi Meta...</span>
      </div>
    );
  }

  const showTokenInput = !settings?.token_configured || replacingToken;
  const canTest = Boolean(settings?.pixel_id && settings?.token_configured);

  return (
    <div className="db-meta-panel">
      <Card>
        <form
          className="db-meta-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {settings?.test_event_code && (
            <div className="db-meta-testmode" role="status">
              <AlertTriangle size={16} />
              <span>
                <strong>Mode uji aktif.</strong> Event dari server (Lead, Purchase) masuk ke Test Events dan belum dihitung
                untuk mengukur iklan.
              </span>
              <button type="button" className="db-meta-link" onClick={() => save(false, '')} disabled={saving}>
                Matikan mode uji
              </button>
            </div>
          )}

          {message && (
            <div className={`db-alert db-alert--${message.kind}`}>
              {message.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              <span>{message.text}</span>
            </div>
          )}

          <FormInput
            label="Pixel ID (Dataset ID)"
            placeholder="Contoh: 1234567890123456"
            value={pixelId}
            onChange={(e) => setPixelId(e.target.value.replace(/\D/g, ''))}
            tooltip="Buka Meta Events Manager > Sumber Data, pilih Pixel/Dataset travel Anda, salin ID angkanya. Kosongkan untuk menonaktifkan Pixel di situs."
          />

          <div className="db-meta-field">
            <div className="db-meta-field__label">
              <span className="db-form-label">Access Token Conversions API</span>
              <Tooltip content="Events Manager > Pengaturan dataset > Conversions API > Buat access token. Token disimpan terenkripsi dan tidak pernah ditampilkan lagi." />
            </div>
            {showTokenInput ? (
              <FormInput
                type="password"
                placeholder={settings?.encryption_ready ? 'Tempel access token dari Events Manager' : 'Belum tersedia'}
                value={token}
                disabled={!settings?.encryption_ready}
                onChange={(e) => setToken(e.target.value)}
              />
            ) : (
              <div className="db-meta-token">
                <KeyRound size={15} />
                <span>Token tersimpan (berakhiran {settings?.token_hint || '****'})</span>
                <button type="button" className="db-meta-link" onClick={() => setReplacingToken(true)}>
                  Ganti
                </button>
                <button type="button" className="db-meta-link db-meta-link--danger" onClick={() => save(true)} disabled={saving}>
                  Hapus
                </button>
              </div>
            )}
            {!settings?.encryption_ready && (
              <p className="db-meta-note">
                Server belum siap menyimpan token (kunci enkripsi belum dikonfigurasi). Pixel tetap bisa diaktifkan.
              </p>
            )}
          </div>

          <FormInput
            label="Test Event Code (opsional)"
            placeholder="Contoh: TEST12345"
            value={testCode}
            onChange={(e) => setTestCode(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
            tooltip="Dari Events Manager > Test Events. Selama diisi, event server masuk ke tab Test Events. Kosongkan setelah pengujian selesai agar event tercatat normal."
          />

          <div className="db-meta-actions">
            <Button variant="secondary" size="md" type="button" onClick={test} disabled={!canTest || testing || saving}>
              {testing ? <RefreshCw size={15} className="db-spin" /> : <Send size={15} />}
              <span>Kirim Event Uji</span>
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <RefreshCw size={15} className="db-spin" /> : <Save size={15} />}
              <span>Simpan</span>
            </Button>
          </div>
        </form>
      </Card>

      <section className="db-meta-events" aria-label="Event yang dikirim ke Meta">
        <h2 className="db-meta-events__title">Event standar yang dikirim</h2>
        <dl className="db-meta-events__list">
          {TRACKED_EVENTS.map((ev) => (
            <div key={ev.name} className="db-meta-events__row">
              <dt>{ev.name}</dt>
              <dd>{ev.where}</dd>
            </div>
          ))}
        </dl>
        <p className="db-meta-note">
          Data kontak jamaah hanya dikirim dalam bentuk hash (SHA-256), hanya untuk jamaah yang memberi persetujuan, dan
          tidak pernah untuk jamaah yang datanya sudah dihapus. Prospek input manual agen tidak dilaporkan sebagai Purchase.
        </p>
      </section>
    </div>
  );
};
