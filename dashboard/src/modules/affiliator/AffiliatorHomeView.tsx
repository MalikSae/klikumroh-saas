// Affiliator home: the balance first (the one primary action is the payout), then what to share (link and
// coupon), then the numbers behind it.
import React, { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Card, CardBody, CopyButton, Field, errorText, fmtNumber, fmtPercent, fmtRupiah } from '../../ui';
import { affiliatorLink, fetchAffiliatorOverview, setAffiliatorCoupon, type AffiliatorOverview } from '../../services/affiliatorApi';
import { affiliatorPayoutState } from './payoutRule';
import './affiliator.css';

const COUPON_PATTERN = /^[A-Z0-9]{4,20}$/;

export const AffiliatorHomeView: React.FC = () => {
  const [data, setData] = useState<AffiliatorOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetchAffiliatorOverview()
      .then(setData)
      .catch((e) => setLoadError(errorText(e, 'Gagal memuat data')));
  }, []);
  useEffect(load, [load]);

  const saveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = code.trim().toUpperCase();
    if (!COUPON_PATTERN.test(next)) {
      setCodeError('4-20 karakter, hanya huruf dan angka.');
      return;
    }
    setSaving(true);
    setCodeError(null);
    try {
      await setAffiliatorCoupon(next);
      setEditing(false);
      setCode('');
      load();
    } catch (err) {
      setCodeError(errorText(err, 'Gagal menyimpan kupon'));
    } finally {
      setSaving(false);
    }
  };

  if (loadError) return <Banner tone="danger">{loadError}</Banner>;
  if (!data) return <p className="af-muted">Memuat...</p>;

  const link = affiliatorLink(data.affiliator.link_code);
  // Same rule as the Komisi page (bank details, nothing requested, minimum reached).
  const canPayout = affiliatorPayoutState(data, fmtRupiah).canRequest;
  const showCouponForm = editing || !data.coupon_code;

  return (
    <div className="af-stack">
      <section className="af-balance" aria-label="Saldo komisi">
        <div>
          <div className="af-balance__label">Komisi siap dicairkan</div>
          <div className="af-balance__value">{fmtRupiah(data.balance.available)}</div>
          <div className="af-balance__note">
            {data.balance.held > 0 ? `${fmtRupiah(data.balance.held)} masih ditahan ${data.hold_days} hari sejak pembayaran disetujui.` : `Minimal pencairan ${fmtRupiah(data.min_payout)}.`}
          </div>
        </div>
        <Button variant={canPayout ? 'primary' : 'secondary'} to="/affiliator/komisi">
          {canPayout ? 'Ajukan pencairan' : 'Lihat komisi'}
        </Button>
      </section>

      <Card title="Bagikan" description={`Travel yang berlangganan lewat link atau kupon Anda memberi komisi ${fmtPercent(data.first_rate, 2)} dari pembayaran pertama dan ${fmtPercent(data.renewal_rate, 2)} dari setiap perpanjangan.`}>
        <CardBody>
          <div className="af-share">
            <div className="af-share__row">
              <div className="af-share__text">
                <div className="af-share__label">Link Anda</div>
                <div className="af-share__value af-share__value--link">{link}</div>
              </div>
              <CopyButton value={link}>Salin</CopyButton>
            </div>

            {data.coupon_code && (
              <div className="af-share__row">
                <div className="af-share__text">
                  <div className="af-share__label">Kupon diskon {fmtPercent(data.coupon_discount, 2)} untuk travel baru</div>
                  <div className="af-share__value">{data.coupon_code}</div>
                </div>
                {!editing && (
                  <div className="af-share__actions">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setCode(data.coupon_code ?? ''); }}>Ubah</Button>
                    <CopyButton value={data.coupon_code}>Salin</CopyButton>
                  </div>
                )}
              </div>
            )}

            {showCouponForm && (
              <form className="af-coupon" onSubmit={saveCoupon} noValidate>
                <Field
                  label={data.coupon_code ? 'Kode kupon baru' : `Buat kode kupon (diskon ${fmtPercent(data.coupon_discount, 2)} untuk travel baru)`}
                  hint={data.coupon_code ? 'Kupon lama langsung tidak berlaku. Travel yang sudah terdaftar tetap tercatat milik Anda.' : 'Contoh: BERKAH20. 4-20 karakter, hanya huruf dan angka.'}
                  error={codeError}
                >
                  {(id) => (
                    <input id={id} className="ku-input af-coupon__input" maxLength={20} autoCapitalize="characters" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} aria-invalid={Boolean(codeError)} />
                  )}
                </Field>
                <div className="af-coupon__actions">
                  {data.coupon_code && <Button variant="ghost" onClick={() => { setEditing(false); setCodeError(null); }}>Batal</Button>}
                  <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan kupon'}</Button>
                </div>
              </form>
            )}
          </div>
        </CardBody>
      </Card>

      <dl className="af-stats" aria-label="Ringkasan">
        <div><dt>Klik link</dt><dd>{fmtNumber(data.clicks)}</dd></div>
        <div><dt>Travel dibawa</dt><dd>{fmtNumber(data.tenant_count)}</dd></div>
        <div><dt>Travel aktif</dt><dd>{fmtNumber(data.active_tenants)}</dd></div>
        <div><dt>Sudah dicairkan</dt><dd>{fmtRupiah(data.balance.paid)}</dd></div>
      </dl>
    </div>
  );
};
