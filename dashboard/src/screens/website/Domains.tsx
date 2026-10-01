// Domain: the free klikumroh.id address and the travel's own domain (DNS records + verification).
import React, { useEffect, useState } from 'react';
import { CornerDownRight, ExternalLink, RefreshCw, Trash2, X } from 'lucide-react';
import { deleteCustomDomain, fetchDomains, getDomainARecordTargets, getDomainCNAMETarget, registerCustomDomain, verifyCustomDomain, type DomainItem } from '../../services/api';
import { Banner, Button, Checkbox, Field, IconButton, Modal, Pill, errorText, fmtAgo, type PillTone } from '../../ui';
import { SettingsSection } from '../settings/Section';
import { CopyText } from '../agents/shared';

const STATUS: Record<DomainItem['status'], { label: string; tone: PillTone }> = {
  pending: { label: 'Menunggu DNS', tone: 'amber' },
  active: { label: 'Aktif', tone: 'green' },
  failed: { label: 'Gagal diverifikasi', tone: 'red' },
};

/** Registrable domain of a hostname: namatravel.com, or namatravel.co.id for Indonesian second-level names. */
const zoneOf = (host: string) => {
  const parts = host.split('.');
  const n = /.(co|or|ac|go|web|my|sch|net|biz|ponpes|desa).id$/.test(host) ? 3 : 2;
  return parts.slice(-n).join('.');
};

/** A root domain (namatravel.com) cannot have a CNAME; it needs A records. www.namatravel.com can. */
const isRoot = (host: string) => zoneOf(host) === host;

/** What to type in the "Host" field of most DNS panels, which append the domain themselves. */
const hostField = (name: string, zone: string) => (name === zone ? '@' : name.endsWith('.' + zone) ? name.slice(0, -(zone.length + 1)) : name);

type Row = { type: string; name: string; value: string };

/** Backend reasons are lowercase clauses; show them as a sentence. */
const sentence = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** DNS records still needed: the primary's CNAME (or A for a root domain) and TXT, and the alias's A. */
const DnsTable: React.FC<{ primary: DomainItem; alias?: DomainItem }> = ({ primary, alias }) => {
  const zone = zoneOf(primary.hostname);
  const aTargets = getDomainARecordTargets();
  const cname = getDomainCNAMETarget();
  const pointing = (d: DomainItem): Row[] =>
    isRoot(d.hostname) ? (aTargets.length ? aTargets : ['']).map((ip) => ({ type: 'A', name: d.hostname, value: ip })) : [{ type: 'CNAME', name: d.hostname, value: cname }];
  const rows: Row[] = [
    ...(primary.status !== 'active' ? pointing(primary) : []),
    ...(alias && alias.status !== 'active' ? pointing(alias) : []),
    ...(primary.status !== 'active' && primary.verification_token ? [{ type: 'TXT', name: `_klikumroh-verify.${primary.hostname}`, value: primary.verification_token }] : []),
  ];
  if (rows.length === 0) return null;
  return (
    <table className="ws-dns">
      <thead>
        <tr>
          <th>Tipe</th>
          <th>Host</th>
          <th>Nilai</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.type + r.name + r.value}>
            <td>{r.type}</td>
            <td>
              <CopyText value={hostField(r.name, zone)} label="host" />
              <span className="ws-dns__full">{r.name}</span>
            </td>
            <td>{r.value ? <CopyText value={r.value} label="nilai record" /> : <span className="ku-muted">Hubungi tim KlikUmroh</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** The www / non-www pair for a typed host, or null when the host is neither (e.g. umroh.namatravel.com). */
const pairOf = (host: string): { primary: string; alias: string } | null => {
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)) return null;
  if (isRoot(host)) return { primary: 'www.' + host, alias: host };
  if (host.startsWith('www.') && isRoot(host.slice(4))) return { primary: host, alias: host.slice(4) };
  return null;
};

/** Step-by-step guide, open while the travel has no custom domain yet. */
const DomainGuide: React.FC<{ open: boolean }> = ({ open }) => (
  <details className="ws-guide" open={open}>
    <summary>Panduan menghubungkan domain</summary>
    <ol className="ws-guide__steps">
      <li>
        <b>Siapkan domain.</b> Beli domain di penyedia domain mana pun, lalu pastikan Anda bisa membuka pengaturan DNS-nya.
      </li>
      <li>
        <b>Tambahkan domain di atas.</b> Alamat utamanya <code>www.namatravel.com</code> (cukup satu record CNAME). Biarkan pilihan{' '}
        <i>juga arahkan namatravel.com</i> tercentang agar pengunjung yang mengetik tanpa www ikut sampai ke website Anda.
      </li>
      <li>
        <b>Buat record di pengelola DNS.</b> Salin Tipe, Host, dan Nilai dari tabel. Isi kolom Host dengan teks tebal di tabel; nama lengkap di bawahnya
        hanya untuk panel yang meminta nama lengkap. TTL biarkan bawaan.
      </li>
      <li>
        <b>Klik Periksa sekarang.</b> Perubahan DNS biasanya terbaca dalam beberapa menit, kadang sampai 48 jam. Setelah aktif, sertifikat HTTPS dibuat
        otomatis, alamat tanpa www dan alamat bawaan diarahkan ke www, termasuk link referral agen.
      </li>
    </ol>
    <div className="ws-guide__notes">
      <b>Jika gagal diverifikasi:</b>
      <ul>
        <li>Hapus record A atau CNAME lama untuk host yang sama, misalnya bawaan hosting sebelumnya.</li>
        <li>Memakai Cloudflare? Setel record ke <i>DNS only</i> (awan abu-abu), bukan <i>Proxied</i>.</li>
        <li>Pastikan TXT berisi nilai persis dari tabel, tanpa tanda kutip atau spasi tambahan.</li>
        <li>Alamat tanpa www baru bisa aktif setelah alamat www aktif.</li>
      </ul>
    </div>
  </details>
);

export const Domains: React.FC = () => {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [host, setHost] = useState('');
  const [withAlias, setWithAlias] = useState(true);
  const [hostError, setHostError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'add' | null>(null);
  const [confirm, setConfirm] = useState<DomainItem | null>(null);

  const load = () =>
    fetchDomains()
      .then(setDomains)
      .catch((e) => setError(errorText(e, 'Gagal memuat domain')))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const sub = domains.find((d) => d.type === 'subdomain');
  const custom = domains.filter((d) => d.type === 'custom');
  const primaries = custom.filter((d) => !d.redirect_to_domain_id);
  const aliasOf = (p: DomainItem) => custom.find((d) => d.redirect_to_domain_id === p.id);

  const typed = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const pair = pairOf(typed);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(typed)) {
      setHostError('Tulis nama domain saja, contoh www.namatravel.com.');
      return;
    }
    setBusy('add');
    setHostError(null);
    setError(null);
    try {
      await registerCustomDomain(typed, Boolean(pair && withAlias));
      setHost('');
      setWithAlias(true);
      await load();
    } catch (err) {
      setHostError(errorText(err, 'Gagal menambahkan domain'));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (d: DomainItem) => {
    setBusy(d.id);
    setError(null);
    try {
      await verifyCustomDomain(d.id);
    } catch (e) {
      setError(errorText(e, 'Gagal memeriksa domain'));
    } finally {
      await load();
      setBusy(null);
    }
  };

  const remove = async (d: DomainItem) => {
    setBusy(d.id);
    setConfirm(null);
    try {
      await deleteCustomDomain(d.id);
    } catch (e) {
      setError(errorText(e, 'Gagal menghapus domain'));
    } finally {
      await load();
      setBusy(null);
    }
  };

  if (loading) return <div className="st-loading" aria-busy="true" />;

  const confirmAlias = confirm && !confirm.redirect_to_domain_id ? aliasOf(confirm) : undefined;

  return (
    <div className="st-form">
      {error && <Banner tone="danger">{error}</Banner>}

      <SettingsSection title="Alamat bawaan" description="Selalu aktif, gratis dari KlikUmroh.">
        {sub ? (
          <div className="ws-domain-line">
            <b>{sub.hostname}</b>
            <a className="pk-link" href={`https://${sub.hostname}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="ku-icon--sm" aria-hidden="true" /> Buka
            </a>
          </div>
        ) : (
          <p className="ku-muted">Alamat bawaan belum tersedia.</p>
        )}
        {primaries.some((d) => d.status === 'active') && <p className="ku-muted">Pengunjung alamat ini diarahkan ke domain sendiri, termasuk link referral agen.</p>}
      </SettingsSection>

      <SettingsSection title="Domain sendiri" description="Pakai domain travel Anda, misalnya www.namatravel.com.">
        {primaries.map((d) => {
          const alias = aliasOf(d);
          const pending = d.status !== 'active' || (alias && alias.status !== 'active');
          return (
            <div key={d.id} className="ws-domain">
              <div className="ws-domain__head">
                <b>{d.hostname}</b>
                <Pill tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Pill>
                <span className="ws-domain__actions">
                  {pending && (
                    <Button size="sm" variant="secondary" icon={<RefreshCw className="ku-icon--sm" />} onClick={() => verify(d)} disabled={busy === d.id}>
                      {busy === d.id ? 'Memeriksa...' : 'Periksa sekarang'}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={<Trash2 className="ku-icon--sm" />} onClick={() => setConfirm(d)} disabled={busy === d.id}>
                    Hapus
                  </Button>
                </span>
              </div>
              {alias && (
                <div className="ws-alias">
                  <CornerDownRight className="ku-icon--sm" aria-hidden="true" />
                  <span>
                    <b>{alias.hostname}</b> dialihkan ke {d.hostname}
                  </span>
                  <Pill tone={STATUS[alias.status].tone}>{STATUS[alias.status].label}</Pill>
                  <IconButton size="sm" label={`Hapus ${alias.hostname}`} onClick={() => setConfirm(alias)} disabled={busy === alias.id}>
                    <X className="ku-icon--sm" />
                  </IconButton>
                </div>
              )}
              {d.status === 'active' && (
                <p className="ku-muted">
                  Terhubung{d.verified_at ? ` sejak ${fmtAgo(d.verified_at)}` : ''}. Sertifikat HTTPS diterbitkan otomatis.
                  {(d.check_failures ?? 0) > 0 ? ` Pemeriksaan DNS terakhir gagal ${d.check_failures}x; pastikan record DNS tidak berubah.` : ''}
                </p>
              )}
              {pending && (
                <>
                  <p className="ku-muted">Tambahkan record berikut di pengelola DNS domain Anda, lalu klik Periksa sekarang. Perubahan DNS bisa butuh beberapa jam.</p>
                  <DnsTable primary={d} alias={alias} />
                  {d.status !== 'active' && d.verification_failure_reason && (
                    <Banner tone="warning">
                      <b>{d.hostname} belum terverifikasi{d.last_verification_attempt_at ? ` (${fmtAgo(d.last_verification_attempt_at)})` : ''}.</b> {sentence(d.verification_failure_reason)}
                    </Banner>
                  )}
                  {alias && alias.status !== 'active' && alias.verification_failure_reason && (
                    <Banner tone="warning">
                      <b>{alias.hostname} belum terverifikasi.</b> {sentence(alias.verification_failure_reason)}
                    </Banner>
                  )}
                </>
              )}
            </div>
          );
        })}
        <form className="ws-domain-add" onSubmit={add} noValidate>
          <div className="ws-domain-add__row">
            <Field label={custom.length ? 'Tambah domain lain' : 'Nama domain'} error={hostError}>
              {(id) => <input id={id} className="ku-input" value={host} onChange={(e) => { setHost(e.target.value); setHostError(null); }} placeholder="www.namatravel.com" aria-invalid={Boolean(hostError)} />}
            </Field>
            <Button type="submit" variant={custom.length ? 'secondary' : 'primary'} disabled={busy === 'add' || !host.trim()}>
              {busy === 'add' ? 'Menambahkan...' : 'Tambah domain'}
            </Button>
          </div>
          {pair && (
            <Checkbox
              checked={withAlias}
              onChange={setWithAlias}
              label={
                <>
                  Juga arahkan <b>{pair.alias}</b> ke <b>{pair.primary}</b> (disarankan)
                </>
              }
            />
          )}
        </form>
        <DomainGuide open={custom.length === 0} />
      </SettingsSection>

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Hapus ${confirm?.hostname}?`}
        description={
          confirm?.redirect_to_domain_id
            ? 'Alamat ini berhenti diarahkan ke domain utama.'
            : confirmAlias
              ? `Website berhenti tampil di domain ini dan kembali memakai alamat bawaan. ${confirmAlias.hostname} ikut dihapus.`
              : 'Website berhenti tampil di domain ini dan kembali memakai alamat bawaan.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => confirm && remove(confirm)}>
              Hapus domain
            </Button>
          </>
        }
      />
    </div>
  );
};
