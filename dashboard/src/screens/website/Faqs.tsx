// FAQ: questions calon jamaah ask before registering, shown on the homepage.
import React, { useEffect, useState } from 'react';
import { createFAQ, deleteFAQ, fetchFAQs, updateFAQ, type FAQItem } from '../../services/api';
import { Banner, Button, Checkbox, Field, Modal, errorText, type Column } from '../../ui';
import { ContentList, sortOrdered } from './ContentList';

const toPayload = (f: FAQItem): Partial<FAQItem> => ({ question: f.question, answer: f.answer, display_order: f.display_order, is_active: f.is_active });

const FaqModal: React.FC<{ item: FAQItem | null; nextOrder: number; onClose: () => void; onSaved: () => void }> = ({ item, nextOrder, onClose, onSaved }) => {
  const [question, setQuestion] = useState(item?.question || '');
  const [answer, setAnswer] = useState(item?.answer || '');
  const [active, setActive] = useState(item?.is_active ?? true);
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!question.trim()) next.question = 'Pertanyaan wajib diisi.';
    if (!answer.trim()) next.answer = 'Jawaban wajib diisi.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setError(null);
    try {
      const body = { question: question.trim(), answer: answer.trim(), is_active: active, display_order: item?.display_order ?? nextOrder };
      if (item) await updateFAQ(item.id, body);
      else await createFAQ(body);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Gagal menyimpan FAQ'));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Ubah pertanyaan' : 'Tambah pertanyaan'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button variant="primary" type="submit" form="ws-faq" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </>
      }
    >
      <form id="ws-faq" className="ag-form" onSubmit={submit} noValidate>
        {error && <Banner tone="danger">{error}</Banner>}
        <Field label="Pertanyaan" error={errors.question}>
          {(id) => <input id={id} className="ku-input" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={200} placeholder="Contoh: Apakah bisa dicicil?" aria-invalid={Boolean(errors.question)} />}
        </Field>
        <Field label="Jawaban" error={errors.answer}>
          {(id) => <textarea id={id} className="ku-textarea" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-invalid={Boolean(errors.answer)} />}
        </Field>
        <Checkbox checked={active} onChange={setActive} label="Tampilkan di website" />
      </form>
    </Modal>
  );
};

export const Faqs: React.FC = () => {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FAQItem | null | 'new'>(null);

  const reload = () =>
    fetchFAQs()
      .then(setItems)
      .catch((e) => setError(errorText(e, 'Gagal memuat FAQ')))
      .finally(() => setLoading(false));

  useEffect(() => {
    reload();
  }, []);

  const columns: Column<FAQItem>[] = [
    {
      key: 'q',
      header: 'Pertanyaan',
      cell: (f) => (
        <span className="ag-name">
          {f.question}
          <span className="ku-muted ws-quote">{f.answer}</span>
        </span>
      ),
    },
  ];

  return (
    <>
      {error && <Banner tone="danger">{error}</Banner>}
      <ContentList
        items={items}
        loading={loading}
        columns={columns}
        noun="pertanyaan"
        addLabel="Tambah pertanyaan"
        intro="Jawab pertanyaan yang paling sering ditanyakan calon jamaah lewat WhatsApp."
        empty="Tambahkan pertanyaan seperti biaya, cicilan, atau syarat dokumen."
        onAdd={() => setEditing('new')}
        onEdit={setEditing}
        save={(f) => updateFAQ(f.id, toPayload(f))}
        remove={(f) => deleteFAQ(f.id)}
        reload={reload}
      />
      {editing && (
        <FaqModal
          item={editing === 'new' ? null : editing}
          nextOrder={(sortOrdered(items).at(-1)?.display_order ?? 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
};
