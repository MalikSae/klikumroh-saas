import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Clock,
  ArrowRight,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { loginAdmin, getStoredToken } from '../services/api';
import './AdminLogin.css';

// Gunakan path logo publik. Karena dashboard berjalan di port 5176 (dev) dan nanti production, 
// pastikan logo tersedia di /klikumroh-logo.png (di public folder dashboard)
// Atau import dari assets jika ada versi gelap/berwarna.
import klikumrohLogo from '../assets/klikumroh-logo.png'; // Kita perlu pastikan logo ini ada, atau pakai fallback URL. 

export const AdminLoginPage: React.FC = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  useEffect(() => {
    // If already logged in, check token
    const token = getStoredToken();
    if (token && !pendingNotice) {
      // User can navigate
    }
  }, [pendingNotice]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email dan kata sandi wajib diisi');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setPendingNotice(null);

      const res = await loginAdmin(email.trim().toLowerCase(), password);

      if (res.tenant_status === 'active') {
        navigate('/', { replace: true });
      } else {
        // Status pending atau inactive
        setPendingNotice(
          'Akun Anda sedang menunggu verifikasi pembayaran dari tim KlikUmroh. Akses dashboard akan aktif begitu verifikasi selesai.'
        );
      }
    } catch (err: any) {
      setError(err.message || 'Login gagal, periksa email dan kata sandi Anda');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login-page">
      <div className="admin-login-card">
        {/* Header */}
        <div className="admin-login-header">
          <div className="admin-login-logo-wrapper">
            {/* Pakai fallback teks jika img gagal, atau arahkan ke /klikumroh-logo.png jika ada di public */}
            <img
              src={klikumrohLogo}
              alt="KlikUmroh.id"
              style={{ width: '160px', height: '44px', objectFit: 'contain' }}
              onError={(e) => {
                // Fallback to text if logo not found
                e.currentTarget.style.display = 'none';
                const span = document.createElement('span');
                span.innerText = 'KlikUmroh';
                span.style.fontSize = '24px';
                span.style.fontWeight = '800';
                span.style.color = 'var(--db-primary-button)';
                e.currentTarget.parentElement?.appendChild(span);
              }}
            />
          </div>
          <h1 className="admin-login-title">Dashboard Travel KlikUmroh</h1>
          <p className="admin-login-subtitle">
            Masuk ke sistem manajemen agen dan travel Anda
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="admin-login-error-banner" role="alert">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Pending Notice */}
        {pendingNotice && (
          <div className="admin-login-pending-banner" role="status">
            <Clock size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div className="admin-login-pending-title">Menunggu Verifikasi</div>
              <div>{pendingNotice}</div>
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="admin-login-field-group">
            <label htmlFor="login-email" className="admin-login-label">
              Email Akun Travel
            </label>
            <div className="admin-login-input-wrapper">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@travelanda.com"
                required
                autoComplete="email"
                className="admin-login-input"
                disabled={loading}
              />
            </div>
          </div>

          <div className="admin-login-field-group">
            <label htmlFor="login-password" className="admin-login-label">
              Kata Sandi
            </label>
            <div className="admin-login-input-wrapper">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi"
                required
                autoComplete="current-password"
                className="admin-login-input admin-login-password-input"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="admin-login-toggle-password-btn"
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="admin-login-submit-btn"
          >
            {loading ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Memproses...
              </>
            ) : (
              <>
                Masuk ke Dashboard
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer Links */}
        <div className="admin-login-footer-links">
          <div className="admin-login-signup-prompt">
            Belum punya akun travel?{' '}
            <a href="https://klikumroh.id/checkout" className="admin-login-signup-link">
              Daftar langganan
            </a>
          </div>
          <a href="https://klikumroh.id" className="admin-login-back-home-link">
            <ArrowLeft size={14} />
            Kembali ke Beranda
          </a>
        </div>
      </div>
    </main>
  );
};
