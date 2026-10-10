// Tim: admin accounts of this travel. Each member signs in at klikumroh.id with their own email.
import React, { useEffect, useState } from 'react';
import { MoreHorizontal, UserPlus } from 'lucide-react';
import { addTeamMember, fetchTeamMembers, getStoredUser, setTeamMemberRole, toggleTeamMemberStatus, type TeamMemberItem, type TeamRole } from '../../services/api';
import { Avatar, Banner, Button, DataTable, EmptyState, Field, Menu, Modal, Pill, Select, Toolbar, fmtDate, type Column, errorText } from '../../ui';
import { useFrame } from '../../app/AppFrame';
import { PasswordInput } from '../../modules/affiliator/PasswordInput';
import { resetPasswordProblem } from '../../utils/password';

const MIN_PASSWORD = 8;

const AddMemberModal: React.FC<{ open: boolean; onClose: () => void; onAdded: (m: TeamMemberItem) => void }> = ({ open, onClose, onAdded }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TeamRole>('admin');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPassword('');
    setRole('admin');
    setErrors({});
    setError(null);
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Nama wajib diisi.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Masukkan email yang valid.';
    // The admin hands this password to the new member: sent as typed, blank or space-padded refused.
    const pwProblem = resetPasswordProblem(password);
    if (pwProblem) next.password = pwProblem;
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      const m = await addTeamMember({ name: name.trim(), email: email.trim(), password, role });
      onAdded(m);
    } catch (err) {
      setError(errorText(err, 'Gagal menambahkan anggota'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tambah anggota tim"
      description="Anggota masuk ke dashboard lewat klikumroh.id dengan email dan password ini."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" form="st-add-member" disabled={saving}>
            {saving ? 'Menambahkan...' : 'Tambah anggota'}
          </Button>
        </>
      }
    >
      <form id="st-add-member" className="st-modal-form" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="Nama" error={errors.name}>
          {(id) => <input id={id} className="ku-input" placeholder="Contoh: Siti Aminah" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} autoFocus />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(id) => <input id={id} className="ku-input" type="email" autoComplete="off" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} />}
        </Field>
        <Field label="Peran" hint={role === 'pic' ? 'Mengelola langganan, tim, dan operasional harian.' : 'Mengelola operasional harian. Tidak dapat mengubah langganan dan tim.'}>
          {(id) => (
            <Select
              id={id}
              label="Peran"
              value={role}
              onChange={(v) => setRole(v as TeamRole)}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'pic', label: 'PIC' },
              ]}
            />
          )}
        </Field>
        <Field label="Password awal" error={errors.password} hint={`Minimal ${MIN_PASSWORD} karakter. Minta anggota menggantinya di Akun saya.`}>
          {(id) => <PasswordInput id={id} autoComplete="new-password" placeholder="Minimal 8 karakter" value={password} onChange={setPassword} invalid={Boolean(errors.password)} />}
        </Field>
      </form>
    </Modal>
  );
};

export const TeamSettings: React.FC = () => {
  const me = getStoredUser();
  const isPic = useFrame()?.isPic ?? true;
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<TeamMemberItem | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchTeamMembers()
      .then((m) => setMembers(m || []))
      .catch((e) => setError(errorText(e, 'Gagal memuat data')))
      .finally(() => setLoading(false));
  }, []);

  const replace = (m: TeamMemberItem) => setMembers((list) => list.map((x) => (x.id === m.id ? m : x)));

  const changeRole = async (m: TeamMemberItem, role: TeamRole) => {
    setError(null);
    try {
      replace(await setTeamMemberRole(m.id, role));
    } catch (e) {
      setError(errorText(e, 'Gagal mengubah peran anggota'));
    }
  };

  const toggle = async (m: TeamMemberItem) => {
    setBusy(true);
    setError(null);
    try {
      replace(await toggleTeamMemberStatus(m.id, m.status === 'active' ? 'deactivate' : 'activate'));
      setConfirm(null);
    } catch (e) {
      setError(errorText(e, 'Gagal mengubah status anggota'));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<TeamMemberItem>[] = [
    {
      key: 'name',
      header: 'Nama',
      cell: (m) => (
        <span className="ku-person">
          <Avatar name={m.name} />
          <span>
            {m.name}
            {m.id === me?.id && <span className="st-muted"> (Anda)</span>}
          </span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', cell: (m) => m.email },
    {
      key: 'status',
      header: 'Peran & status',
      // One badge: role and access state, e.g. "PIC • Aktif".
      cell: (m) => {
        const label = `${m.role === 'pic' ? 'PIC' : 'Admin'} • ${m.status === 'active' ? 'Aktif' : 'Nonaktif'}`;
        return m.status === 'active' ? <Pill tone="green">{label}</Pill> : <Pill>{label}</Pill>;
      },
    },
    { key: 'since', header: 'Ditambahkan', mobile: 'labeled', cell: (m) => fmtDate(m.created_at) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      // On the phone the menu sits beside the name and status, not alone on a row of its own.
      mobile: 'aside',
      cell: (m) =>
        !isPic ? null : (
          <Menu
            label={`Aksi untuk ${m.name}`}
            trigger={<MoreHorizontal className="ku-icon--sm" />}
            items={[
              m.role === 'pic'
                ? { label: 'Jadikan Admin', onClick: () => changeRole(m, 'admin') }
                : { label: 'Jadikan PIC', onClick: () => changeRole(m, 'pic') },
              ...(m.id === me?.id
                ? []
                : [
                    m.status === 'active'
                      ? { label: 'Nonaktifkan akses', danger: true, onClick: () => setConfirm(m) }
                      : { label: 'Aktifkan kembali', onClick: () => toggle(m) },
                  ]),
            ]}
          />
        ),
    },
  ];

  return (
    <section className="ku-list">
      {error && <Banner tone="danger">{error}</Banner>}
      <Toolbar
        right={
          isPic && (
            <Button variant="primary" icon={<UserPlus className="ku-icon--sm" />} onClick={() => setAdding(true)}>
              Tambah anggota
            </Button>
          )
        }
      >
        <span className="st-muted">
          {isPic ? 'PIC mengelola langganan dan tim. Admin mengelola operasional harian.' : 'Hanya PIC yang dapat mengubah tim dan langganan.'}
        </span>
      </Toolbar>
      <DataTable columns={columns} rows={members} rowKey={(m) => m.id} loading={loading} empty={<EmptyState compact title="Belum ada anggota tim" />} />

      <AddMemberModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(m) => {
          setMembers((list) => [...list, m]);
          setAdding(false);
        }}
      />
      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Nonaktifkan akses?"
        description={confirm ? `${confirm.name} tidak bisa masuk ke dashboard sampai diaktifkan kembali.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              Batal
            </Button>
            <Button variant="danger" onClick={() => confirm && toggle(confirm)} disabled={busy}>
              {busy ? 'Memproses...' : 'Nonaktifkan'}
            </Button>
          </>
        }
      />
    </section>
  );
};
