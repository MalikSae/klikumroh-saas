// Iklan & pelacakan: build ad links that are recorded per campaign, and connect Meta Pixel + Conversions API.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import { fetchMetaIntegration, fetchPackages, saveMetaIntegration, sendMetaTestEvent, type MetaIntegrationSettings, type PackageItem } from '../../services/api';
import { Banner, Button, Field, Select, errorText, fmtAgo } from '../../ui';
import { publicSiteUrl, useFrame } from '../../app/AppFrame';
import { SettingsSection } from '../settings/Section';
import { copyText } from '../../utils/clipboard';
import { Tooltip } from '../../modules/superadmin/shared/Tooltip';
import { buildAdLink, isMetaPlatform } from '../../utils/adLink';

const SOURCES = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
];

const slug = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

const LINK_TIP =
  'Untuk Google, TikTok, dan YouTube, link ini membawa platform dan nama kampanye (utm_source, utm_campaign); prospeknya tercatat sebagai Website. Untuk Facebook dan Instagram, link ini sengaja tanpa utm_source: Meta mengisinya sendiri lewat {{site_source_name}} (Facebook, Instagram, Messenger) dari blok Parameter URL iklan Meta, yang juga membawa ad_id. Prospek dihitung sebagai Iklan, dan masuk tabel Kampanye iklan, hanya bila linknya membawa ad_id itu. Bila nama kampanye juga diisi Meta, nama dari Meta yang dipakai.';

const LinkBuilder: React.FC = () => {
  const frame = useFrame();
  const site = publicSiteUrl(frame?.subscription?.tenant_slug);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [page, setPage] = useState('home');
  const [source, setSource] = useState('facebook');
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPackages('published').then(setPackages).catch(() => setPackages([]));
  }, []);

  const url = useMemo(() => buildAdLink(site ?? '', page, source, slug(campaign)), [site, page, source, campaign]);

  const [copyFailed, setCopyFailed] = useState(false);
  const copy = async () => {
    const ok = await copyText(url);
    setCopied(ok);
    setCopyFailed(!ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <SettingsSection
      title="Link iklan"
      description={
        <>
          Hanya iklan Meta yang memakai Parameter URL iklan Meta (ad_id) di bawah yang dihitung sebagai Iklan. Platform lain tercatat sebagai Website.{' '}
          <Tooltip content={LINK_TIP} />
        </>
      }
    >
      {!site ? (
        <p className="ku-muted">Alamat website travel belum tersedia.</p>
      ) : (
        <>
          <div className="st-grid">
            <Field label="Halaman tujuan">
              {(id) => (
                <Select
                  id={id}
                  label="Halaman tujuan"
                  value={page}
                  onChange={setPage}
                  options={[{ value: 'home', label: 'Beranda website' }, ...packages.map((p) => ({ value: String(p.id), label: p.name }))]}
                />
              )}
            </Field>
            <Field label="Platform iklan" hint={isMetaPlatform(source) ? 'Tanpa utm_source: Meta mengisinya lewat Parameter URL iklan Meta di bawah.' : undefined}>
              {(id) => <Select id={id} label="Platform iklan" value={source} onChange={setSource} options={SOURCES} />}
            </Field>
          </div>
          <Field label="Nama kampanye" optional hint={campaign && slug(campaign) !== campaign ? `Ditulis sebagai "${slug(campaign)}".` : 'Contoh: promo-ramadhan.'}>
            {(id) => <input id={id} className="ku-input" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="promo-ramadhan" maxLength={80} />}
          </Field>
          <div className="ch-link">
            <code className="ch-link__url">{url}</code>
            <Button size="sm" variant="secondary" icon={copied ? <Check className="ku-icon--sm" /> : <Copy className="ku-icon--sm" />} onClick={copy}>
              {copied ? 'Tersalin' : 'Salin link'}
            </Button>
          </div>
          {copyFailed && <p className="ku-muted">Gagal menyalin otomatis. Blok link di atas lalu salin manual.</p>}
        </>
      )}
    </SettingsSection>
  );
};

/** Paste-ready Meta "URL parameters": the backend counts a lead as Iklan only when ad_id (Meta's {{ad.id}}) is in the link. */
// {{site_source_name}} is filled by Meta per placement (fb, ig, msg, an) so Instagram leads are told apart.
const META_URL_PARAMS = 'utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&ad_id={{ad.id}}';

const META_PARAMS_TIP =
  'Meta mengganti {{ad.id}} dengan ID iklan, {{campaign.name}} dengan nama kampanye, dan {{site_source_name}} dengan tempat iklan tampil (Facebook, Instagram, Messenger) saat iklan diklik. Prospek dihitung sebagai Iklan hanya bila linknya membawa ad_id; fbclid atau utm_medium saja tidak cukup. Kolom ini ada di level iklan, bagian Pelacakan (Tracking).';

const MetaUrlParams: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    const ok = await copyText(META_URL_PARAMS);
    setCopied(ok);
    setFailed(!ok);
    if (ok) window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <SettingsSection title="Parameter URL iklan Meta">
      <p className="ch-text">
        Agar lead dari iklan Meta tercatat sebagai Iklan, tempel teks ini di kolom URL parameters (Parameter URL) setiap iklan di Meta Ads Manager:{' '}
        <Tooltip content={META_PARAMS_TIP} />
      </p>
      <div className="ch-link">
        <code className="ch-link__url">{META_URL_PARAMS}</code>
        <Button size="sm" variant="secondary" icon={copied ? <Check className="ku-icon--sm" /> : <Copy className="ku-icon--sm" />} onClick={copy}>
          {copied ? 'Tersalin' : 'Salin'}
        </Button>
      </div>
      {failed && <p className="ku-muted">Gagal menyalin otomatis. Blok teks di atas lalu salin manual.</p>}
    </SettingsSection>
  );
};

const MetaSettings: React.FC = () => {
  const [meta, setMeta] = useState<MetaIntegrationSettings | null>(null);
  const [pixel, setPixel] = useState('');
  const [token, setToken] = useState('');
  const [testCode, setTestCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const apply = (m: MetaIntegrationSettings) => {
    setMeta(m);
    setPixel(m.pixel_id || '');
    setTestCode(m.test_event_code || '');
    setToken('');
  };

  useEffect(() => {
    fetchMetaIntegration()
      .then(apply)
      .catch((e) => setError(errorText(e, 'Gagal memuat integrasi Meta')));
  }, []);

  if (!meta) return error ? <Banner tone="danger">{error}</Banner> : <div className="st-loading" aria-busy="true" />;

  const dirty = pixel !== (meta.pixel_id || '') || testCode !== (meta.test_event_code || '') || token.trim() !== '';

  const save = async (opts?: { clear?: boolean }) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      apply(await saveMetaIntegration({ pixel_id: pixel.trim(), test_event_code: testCode.trim(), ...(token.trim() ? { access_token: token.trim() } : {}), ...(opts?.clear ? { clear_token: true } : {}) }));
      setNotice(opts?.clear ? 'Access token dihapus.' : 'Integrasi Meta tersimpan.');
    } catch (e) {
      setError(errorText(e, 'Gagal menyimpan integrasi Meta'));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setNotice(null);
    try {
      const r = await sendMetaTestEvent();
      setNotice(`Event uji diterima Meta (${r.events_received} event). Cek di Events Manager, tab Test Events.`);
      setMeta(await fetchMetaIntegration());
    } catch (e) {
      setError(errorText(e, 'Gagal mengirim event uji'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsSection title="Meta Pixel & Conversions API" description="Iklan Facebook dan Instagram belajar dari prospek dan closing Anda.">
      {error && <Banner tone="danger">{error}</Banner>}
      {notice && <Banner tone="success">{notice}</Banner>}
      {!meta.encryption_ready && <Banner tone="warning">Penyimpanan access token belum siap di server. Pixel ID tetap bisa disimpan.</Banner>}
      <p className="ch-text">Website mengirim event Lead saat calon jamaah mengisi minat, dan Purchase saat prospek dari website ditandai Closing.</p>
      <Field label="Pixel ID" hint="10–20 digit angka dari Events Manager.">
        {(id) => <input id={id} className="ku-input" inputMode="numeric" value={pixel} onChange={(e) => setPixel(e.target.value.replace(/\s/g, ''))} placeholder="123456789012345" />}
      </Field>
      <Field
        label="Access token Conversions API"
        optional
        hint={meta.token_configured ? `Token tersimpan (berakhiran ${meta.token_hint}). Isi hanya jika ingin menggantinya.` : 'Buat di Events Manager > Settings > Conversions API.'}
      >
        {(id) => <input id={id} className="ku-input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} disabled={!meta.encryption_ready} placeholder={meta.token_configured ? '••••••••' : ''} />}
      </Field>
      <Field label="Test Event Code" optional hint="Dari Events Manager > Test Events. Dipakai untuk event uji saja.">
        {(id) => <input id={id} className="ku-input" value={testCode} onChange={(e) => setTestCode(e.target.value.trim())} placeholder="TEST12345" />}
      </Field>

      <div className="ch-status">
        <span className={`ch-status__dot ${meta.last_error && (!meta.last_success_at || (meta.last_error_at && meta.last_error_at > meta.last_success_at)) ? 'ch-status__dot--bad' : meta.last_success_at ? 'ch-status__dot--ok' : ''}`} aria-hidden="true" />
        <span>
          {meta.last_error && (!meta.last_success_at || (meta.last_error_at && meta.last_error_at > meta.last_success_at))
            ? `Pengiriman terakhir gagal${meta.last_error_at ? ` ${fmtAgo(meta.last_error_at)}` : ''}: ${meta.last_error}`
            : meta.last_success_at
              ? `Event terakhir terkirim ${fmtAgo(meta.last_success_at)}.`
              : 'Belum ada event yang dikirim dari server.'}
        </span>
      </div>

      <div className="st-actions">
        {meta.token_configured && (
          <Button variant="ghost" onClick={() => save({ clear: true })} disabled={saving}>
            Hapus token
          </Button>
        )}
        <Button variant="secondary" icon={<Send className="ku-icon--sm" />} onClick={test} disabled={testing || dirty || !meta.token_configured || !meta.pixel_id || !meta.test_event_code}>
          {testing ? 'Mengirim...' : 'Kirim event uji'}
        </Button>
        <Button variant="primary" onClick={() => save()} disabled={saving || !dirty}>
          {saving ? 'Menyimpan...' : 'Simpan'}
        </Button>
      </div>
    </SettingsSection>
  );
};

/** What the public website and the server send to Meta, and when (see internal/service/meta.go). */
const EVENTS: Array<{ name: string; when: string; from: string; data: string }> = [
  { name: 'PageView', when: 'Setiap halaman website dibuka (portal agen dan halaman login tidak dihitung).', from: 'Browser', data: 'Alamat halaman.' },
  { name: 'ViewContent', when: 'Calon jamaah membuka halaman detail paket.', from: 'Browser', data: 'ID, nama, dan harga paket.' },
  {
    name: 'Lead',
    when: 'Calon jamaah mengirim form minat dan menjadi prospek baru.',
    from: 'Browser + server',
    data: 'Paket yang dipilih. Dari server juga data kontak yang di-hash, IP, jenis browser, dan cookie Meta.',
  },
  {
    name: 'Purchase',
    when: 'Anda menandai prospek dari form website sebagai Closing (sudah DP).',
    from: 'Server',
    data: 'Nilai = harga paket x jumlah jamaah (IDR), data kontak yang di-hash. Sekali per prospek.',
  },
];

const EventList: React.FC = () => (
  <SettingsSection title="Event yang dikirim" description="Yang dilaporkan ke Meta dan kapan.">
    <table className="ch-events">
      <thead>
        <tr>
          <th>Event</th>
          <th>Kapan</th>
          <th>Dari</th>
          <th>Data</th>
        </tr>
      </thead>
      <tbody>
        {EVENTS.map((e) => (
          <tr key={e.name}>
            <td>
              <b>{e.name}</b>
            </td>
            <td data-label="Kapan">{e.when}</td>
            <td className="ch-events__from" data-label="Dari">{e.from}</td>
            <td data-label="Data">{e.data}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <div className="ch-howto">
      <b>Cara pengiriman</b>
      <ul>
        <li>
          <b>Browser (Pixel)</b> terkirim dari perangkat pengunjung begitu Pixel ID diisi. <b>Server (Conversions API)</b> dikirim dari server KlikUmroh dan
          butuh access token; tetap sampai meski pengunjung memakai pemblokir iklan.
        </li>
        <li>Lead dari browser dan dari server memakai ID event yang sama, jadi Meta menghitungnya satu kali.</li>
        <li>
          Nomor WhatsApp, email, nama, dan kota di-hash (SHA-256) sebelum dikirim, dan hanya untuk calon jamaah yang menyetujui teks persetujuan yang menyebut
          Meta. Prospek yang datanya sudah dihapus tidak pernah dikirim.
        </li>
        <li>Prospek yang dicatat manual oleh agen tidak dilaporkan sebagai Purchase, karena tidak datang dari website atau iklan.</li>
      </ul>
    </div>
    <Banner tone="warning">
      <b>Kosongkan Test Event Code setelah selesai menguji.</b> Selama kode itu terisi, event dari server (Lead dan Purchase) ikut masuk ke Test Events di
      Events Manager, bukan ke laporan dan optimasi iklan.
    </Banner>
  </SettingsSection>
);

export const Tracking: React.FC = () => (
  <div className="st-form">
    <LinkBuilder />
    <MetaUrlParams />
    <MetaSettings />
    <EventList />
  </div>
);
