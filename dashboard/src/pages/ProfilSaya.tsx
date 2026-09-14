import React, { useState, useEffect } from 'react';
import {
  User,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Save,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Card,
  FormInput,
  Button,
  Badge,
  getStandardMenuItems,
} from '../components';
import {
  fetchMyProfile,
  updateMyProfile,
  updateMyPassword,
  getStoredTravelName,
  getStoredUser,
  type MyProfileItem,
} from '../services/api';

export const ProfilSayaPage: React.FC = () => {
  const [profile, setProfile] = useState<MyProfileItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Edit profile state
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [savingPassword, setSavingPassword] = useState<boolean>(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const currentUser = getStoredUser();

  const menuItems = getStandardMenuItems();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await fetchMyProfile();
      setProfile(data);
      setName(data.name);
      setEmail(data.email);
    } catch (err: any) {
      setProfileError(err.message || 'Gagal memuat profil');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setProfileError('Nama lengkap wajib diisi');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setProfileError('Alamat email valid wajib diisi');
      return;
    }

    try {
      setSavingProfile(true);
      const updated = await updateMyProfile({ name: trimmedName, email: trimmedEmail });
      setProfile(updated);
      setName(updated.name);
      setEmail(updated.email);

      // Update local storage user session cache if exists
      const stored = getStoredUser();
      if (stored) {
        localStorage.setItem(
          'klikumroh_user',
          JSON.stringify({ ...stored, name: updated.name, email: updated.email })
        );
      }

      setProfileSuccess('Profil berhasil diperbarui');
    } catch (err: any) {
      setProfileError(err.message || 'Gagal memperbarui profil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Password saat ini wajib diisi');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Password baru minimal 8 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password baru tidak cocok');
      return;
    }

    try {
      setSavingPassword(true);
      await updateMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password berhasil diperbarui');
    } catch (err: any) {
      setPasswordError(err.message || 'Gagal mengubah password');
    } finally {
      setSavingPassword(false);
    }
  };

  const formattedJoinedDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '-';

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          travelName={getStoredTravelName()}
          userName={name || currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={(name || currentUser?.name || 'AD').slice(0, 2).toUpperCase()}
        />

        <main className="db-page-container" style={{ maxWidth: '800px' }}>
          <PageHeader
            title="Profil Saya"
            subtitle="Kelola informasi akun staf travel dan kredensial login Anda"
          />

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--db-text-muted)' }}>
              Memuat data profil...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Card 1: Informasi Profil */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={20} style={{ color: 'var(--db-primary)' }} />
                    <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--db-text-primary)' }}>
                      Informasi Akun
                    </h2>
                  </div>
                  {profile && (
                    <Badge variant={profile.status === 'active' ? 'positive' : 'neutral'}>
                      {profile.status === 'active' ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  )}
                </div>

                {/* Read-only: Bergabung sejak */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    backgroundColor: 'var(--db-bg-secondary)',
                    borderRadius: '6px',
                    marginBottom: '20px',
                    fontSize: '14px',
                    color: 'var(--db-text-secondary)',
                  }}
                >
                  <Calendar size={16} />
                  <span>Bergabung sejak <strong>{formattedJoinedDate}</strong></span>
                </div>

                {profileSuccess && (
                  <div className="db-alert db-alert--success" style={{ marginBottom: '16px' }}>
                    <CheckCircle2 size={16} />
                    <span>{profileSuccess}</span>
                  </div>
                )}

                {profileError && (
                  <div className="db-alert db-alert--error" style={{ marginBottom: '16px' }}>
                    <AlertCircle size={16} />
                    <span>{profileError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <FormInput
                    label="Nama Lengkap"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama lengkap Anda"
                    required
                  />

                  <FormInput
                    label="Email Akun"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alamat@email.com"
                    required
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <Button type="submit" variant="primary" disabled={savingProfile}>
                      <Save size={16} />
                      <span>{savingProfile ? 'Menyimpan...' : 'Simpan Perubahan'}</span>
                    </Button>
                  </div>
                </form>
              </Card>

              {/* Card 2: Ubah Password */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                  <KeyRound size={20} style={{ color: 'var(--db-primary)' }} />
                  <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--db-text-primary)' }}>
                    Ubah Password
                  </h2>
                </div>

                {passwordSuccess && (
                  <div className="db-alert db-alert--success" style={{ marginBottom: '16px' }}>
                    <CheckCircle2 size={16} />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                {passwordError && (
                  <div className="db-alert db-alert--error" style={{ marginBottom: '16px' }}>
                    <AlertCircle size={16} />
                    <span>{passwordError}</span>
                  </div>
                )}

                <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <FormInput
                    label="Password Saat Ini"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Masukkan password lama Anda"
                    required
                  />

                  <FormInput
                    label="Password Baru"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 8 karakter"
                    required
                  />

                  <FormInput
                    label="Konfirmasi Password Baru"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi password baru"
                    required
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                    <Button type="submit" variant="primary" disabled={savingPassword}>
                      <KeyRound size={16} />
                      <span>{savingPassword ? 'Menyimpan...' : 'Ubah Password'}</span>
                    </Button>
                  </div>
                </form>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
