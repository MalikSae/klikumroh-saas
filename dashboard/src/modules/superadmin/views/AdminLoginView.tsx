import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { loginStaff } from '../../../services/staffApi';

export const AdminLoginView: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email dan password wajib diisi');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await loginStaff(email.trim(), password);
      navigate('/internal/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login gagal. Periksa kembali email dan password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
          boxShadow: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.03)',
          padding: '32px 28px',
          boxSizing: 'border-box',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              marginBottom: '14px',
            }}
          >
            <ShieldCheck size={14} />
            <span>PORTAL MASTER ADMIN</span>
          </div>
          <h1
            style={{
              margin: '0 0 6px',
              fontSize: '22px',
              fontWeight: 800,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              color: '#0F172A',
            }}
          >
            KlikUmroh Platform
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748B' }}>
            Masuk untuk mengelola operasional SaaS
          </p>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Email Akun
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Mail size={15} style={{ position: 'absolute', left: '12px', color: '#94A3B8' }} />
              <input
                type="email"
                required
                autoFocus
                placeholder="staff@klikumroh.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 14px 0 36px',
                  fontSize: '13px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  color: '#0F172A',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#334155',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Kata Sandi
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={15} style={{ position: 'absolute', left: '12px', color: '#94A3B8' }} />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 14px 0 36px',
                  fontSize: '13px',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                  color: '#0F172A',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: '42px',
              backgroundColor: '#0F172A',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.12s ease',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <span>{loading ? 'Memverifikasi...' : 'Masuk ke Portal'}</span>
            {!loading && <ArrowRight size={15} />}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <span style={{ fontSize: '11px', color: '#94A3B8' }}>
            KlikUmroh Multi-Tenant SaaS Platform © 2026
          </span>
        </div>
      </div>
    </div>
  );
};
