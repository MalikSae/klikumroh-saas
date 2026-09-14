import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Lock } from 'lucide-react';
import { FormInput, Button } from '../components';
import { loginStaff, getStoredStaffToken } from '../services/staffApi';
import klikumrohLogoWhite from '../assets/klikumroh-logo-white.png';
import './StaffLogin.css';

export const StaffLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getStoredStaffToken()) {
      navigate('/internal/tenants', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email dan password wajib diisi');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await loginStaff(email, password);
      navigate('/internal/tenants', { replace: true });
    } catch (err: any) {
      setError(err.message || 'Login gagal, periksa email dan password Anda');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="staff-login-page">
      <div className="staff-login-card">
        <div className="staff-login-card__header">
          <div className="staff-login-card__logo-wrapper">
            <img
              src={klikumrohLogoWhite}
              alt="KlikUmroh"
              className="staff-login-card__logo"
            />
          </div>
          <h2 className="staff-login-card__title">Portal Internal KlikUmroh</h2>
          <p className="staff-login-card__subtitle">Akses khusus staf dan operasional platform</p>
          <span className="staff-login-card__badge">
            <Lock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: '-1px' }} />
            Internal Staff Only
          </span>
        </div>

        {error && (
          <div className="staff-login-card__error" style={{ marginBottom: '18px' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="staff-login-card__form">
          <FormInput
            type="email"
            label="Email Staff"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@klikumroh.id"
            required
            disabled={loading}
          />

          <FormInput
            type="password"
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Masukkan password"
            required
            disabled={loading}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={loading}
            style={{ width: '100%', marginTop: '8px' }}
          >
            <span>{loading ? 'Memproses...' : 'Masuk Portal'}</span>
            <ArrowRight size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
};
