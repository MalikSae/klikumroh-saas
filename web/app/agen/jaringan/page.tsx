'use client';

// "Jaringan Saya": the agents this agent recruited directly (one level, no tree), with their status, how many
// prospects and closings they have, and what the override commission from them amounts to when the travel pays
// override. Opened from the recruit card on the home page and from the profile page; not a tab of the bottom
// bar. The upline is the signed-in agent: the API takes no agent id.
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, MessageCircle, RefreshCw, User, UserPlus } from 'lucide-react';
import { MobileContainer } from '../../../components/MobileContainer';
import { AgentBottomNavbar } from '../../../components/AgentBottomNavbar';
import { readJsonSafe, apiErrorMessage } from '../../../lib/safeJson';
import { jakartaDateLabel } from '../../../lib/jakartaTime';
import './Jaringan.css';

interface NetworkMember {
  id: number;
  name: string;
  photo_url: string | null;
  status: 'pending' | 'active' | 'inactive';
  joined_at: string;
  phone: string | null;
  prospect_count: number;
  closing_count: number;
  override_released: number;
  override_held: number;
}

interface Network {
  override_enabled: boolean;
  total: number;
  active: number;
  pending: number;
  override_released: number;
  override_held: number;
  members: NetworkMember[];
}

const STATUS_LABEL: Record<NetworkMember['status'], string> = {
  active: 'Aktif',
  pending: 'Menunggu persetujuan travel',
  inactive: 'Nonaktif',
};

const rupiah = (n: number): string => 'Rp ' + Math.round(n).toLocaleString('id-ID');

const waLink = (phone: string): string => `https://wa.me/${phone.replace(/\D/g, '')}`;

export default function AgenJaringanPage() {
  const router = useRouter();
  const [network, setNetwork] = useState<Network | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem('agent_token');
    if (!token) {
      router.push('/agen/login');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/agent/network', { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        localStorage.removeItem('agent_token');
        router.push('/agen/login');
        return;
      }
      // Only active partners see their network; a pending/inactive agent sees the account status instead.
      if (res.status === 403) {
        router.push('/agen/status');
        return;
      }
      const json = await readJsonSafe<Network>(res);
      if (!res.ok || !json) throw new Error(apiErrorMessage(res.status, json, 'Jaringan belum bisa dimuat'));
      setNetwork({ ...json, members: Array.isArray(json.members) ? json.members : [] });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the API; state is set when the response lands
    load();
  }, [load]);

  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push('/agen/dashboard');
  };

  return (
    <MobileContainer>
      <header className="jr-header">
        <button type="button" className="jr-icon-btn" onClick={goBack} aria-label="Kembali">
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="jr-header__title">Jaringan saya</h1>
      </header>

      <div className="jr-page">
        {loading ? (
          <div className="jr-state" role="status">
            <Loader2 size={24} className="jr-spin" aria-hidden="true" />
            <p className="jr-muted">Memuat jaringan...</p>
          </div>
        ) : error || !network ? (
          <div className="jr-state">
            <AlertCircle size={28} aria-hidden="true" />
            <p className="jr-muted">{error || 'Jaringan belum bisa dimuat'}</p>
            <button type="button" className="jr-btn" onClick={() => load()}>
              <RefreshCw size={16} aria-hidden="true" />
              <span>Coba lagi</span>
            </button>
          </div>
        ) : network.total === 0 ? (
          <div className="jr-state">
            <UserPlus size={28} aria-hidden="true" />
            <h2 className="jr-title">Belum ada agen yang Anda ajak</h2>
            <p className="jr-muted">Bagikan tautan ajak dari beranda. Agen yang mendaftar lewat tautan itu muncul di sini.</p>
            <button type="button" className="jr-btn" onClick={() => router.push('/agen/dashboard')}>
              Ke beranda
            </button>
          </div>
        ) : (
          <>
            <section className="jr-summary" aria-label="Ringkasan jaringan">
              <div className="jr-summary__item">
                <strong className="jr-summary__value">{network.total}</strong>
                <span className="jr-summary__label">Diajak</span>
              </div>
              <div className="jr-summary__item">
                <strong className="jr-summary__value">{network.active}</strong>
                <span className="jr-summary__label">Aktif</span>
              </div>
              <div className="jr-summary__item">
                <strong className="jr-summary__value">{network.pending}</strong>
                <span className="jr-summary__label">Menunggu</span>
              </div>
            </section>

            {network.override_enabled && (
              <section className="jr-override" aria-label="Komisi override dari jaringan">
                <p className="jr-override__title">Komisi override dari jaringan Anda</p>
                <div className="jr-override__row">
                  <span>Siap ditarik</span>
                  <strong>{rupiah(network.override_released)}</strong>
                </div>
                <div className="jr-override__row">
                  <span>Tertahan sampai jamaah lunas</span>
                  <strong>{rupiah(network.override_held)}</strong>
                </div>
              </section>
            )}

            <ul className="jr-list">
              {network.members.map((m) => (
                <li key={m.id} className="jr-row">
                  <span className="jr-row__avatar" aria-hidden="true">
                    {m.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- agent photo uploaded by the agent
                      <img src={m.photo_url} alt="" />
                    ) : (
                      <User size={20} />
                    )}
                  </span>
                  <div className="jr-row__body">
                    <p className="jr-row__name">{m.name}</p>
                    <p className={`jr-row__status jr-row__status--${m.status}`}>{STATUS_LABEL[m.status]}</p>
                    <p className="jr-muted">
                      Bergabung {jakartaDateLabel(m.joined_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="jr-row__figures">
                      {m.prospect_count} prospek, {m.closing_count} closing
                    </p>
                    {network.override_enabled && (m.override_released > 0 || m.override_held > 0) && (
                      <p className="jr-muted">
                        Override: {rupiah(m.override_released)} siap ditarik
                        {m.override_held > 0 ? `, ${rupiah(m.override_held)} tertahan` : ''}
                      </p>
                    )}
                  </div>
                  {m.status === 'active' && m.phone && (
                    <a
                      className="jr-row__chat"
                      href={waLink(m.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Chat ${m.name} lewat WhatsApp`}
                    >
                      <MessageCircle size={20} aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>

            <p className="jr-muted jr-note">Daftar ini hanya berisi agen yang Anda ajak langsung.</p>
          </>
        )}
      </div>

      <AgentBottomNavbar />
    </MobileContainer>
  );
}
