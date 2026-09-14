import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Star,
  Image as ImageIcon,
  Quote,
  HelpCircle,
  ExternalLink,
  Upload,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Card,
  FormInput,
  Button,
  Modal,
  getStandardMenuItems,
} from '../components';
import {
  fetchBanners,
  createBanner,
  updateBanner,
  uploadBannerImage,
  deleteBanner,
  fetchTestimonials,
  createTestimonial,
  updateTestimonial,
  deleteTestimonial,
  fetchFAQs,
  createFAQ,
  updateFAQ,
  deleteFAQ,
  getStoredUser,
  type BannerItem,
  type TestimonialItem,
  type FAQItem,
} from '../services/api';

type TabType = 'banners' | 'testimonials' | 'faqs';

export const WebsiteContentPage: React.FC = () => {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const validTabs: TabType[] = ['banners', 'testimonials', 'faqs'];
  const activeTab: TabType = (section && validTabs.includes(section as TabType))
    ? (section as TabType)
    : 'banners';

  useEffect(() => {
    if (section && !validTabs.includes(section as TabType)) {
      navigate('/website-content/banners', { replace: true });
    }
  }, [section, navigate]);

  const [loading, setLoading] = useState<boolean>(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Data states
  const [banners, setBanners] = useState<BannerItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);

  // Banner Modal state
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<BannerItem | null>(null);
  const [bannerForm, setBannerForm] = useState({
    title: '',
    image_url: '',
    cta_url: '',
    display_order: 1,
    is_active: true,
  });
  const [uploadingBannerImage, setUploadingBannerImage] = useState(false);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);
  const [submittingBanner, setSubmittingBanner] = useState(false);

  // Testimonial Modal state
  const [isTestiModalOpen, setIsTestiModalOpen] = useState(false);
  const [editingTesti, setEditingTesti] = useState<TestimonialItem | null>(null);
  const [testiForm, setTestiForm] = useState({
    name: '',
    package_name: '',
    rating: 5,
    quote: '',
    avatar_url: '',
    display_order: 1,
    is_active: true,
  });
  const [submittingTesti, setSubmittingTesti] = useState(false);

  // FAQ Modal state
  const [isFAQModalOpen, setIsFAQModalOpen] = useState(false);
  const [editingFAQ, setEditingFAQ] = useState<FAQItem | null>(null);
  const [faqForm, setFaqForm] = useState({
    question: '',
    answer: '',
    display_order: 1,
    is_active: true,
  });
  const [submittingFAQ, setSubmittingFAQ] = useState(false);

  // Delete Confirm Modal
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'banner' | 'testi' | 'faq';
    id: number;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentUser = getStoredUser();

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [bData, tData, fData] = await Promise.all([
        fetchBanners().catch(() => []),
        fetchTestimonials().catch(() => []),
        fetchFAQs().catch(() => []),
      ]);
      setBanners(bData);
      setTestimonials(tData);
      setFaqs(fData);
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memuat konten web');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // -------------------------------------------------------------
  // BANNER ACTIONS
  // -------------------------------------------------------------
  const handleOpenAddBanner = () => {
    setEditingBanner(null);
    setBannerUploadError(null);
    setBannerForm({
      title: '',
      image_url: '',
      cta_url: '',
      display_order: banners.length + 1,
      is_active: true,
    });
    setIsBannerModalOpen(true);
  };

  const handleOpenEditBanner = (b: BannerItem) => {
    setEditingBanner(b);
    setBannerUploadError(null);
    setBannerForm({
      title: b.title,
      image_url: b.image_url,
      cta_url: b.cta_url || '',
      display_order: b.display_order,
      is_active: b.is_active,
    });
    setIsBannerModalOpen(true);
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setBannerUploadError('Ukuran file gambar banner maksimal 8MB');
      return;
    }

    try {
      setUploadingBannerImage(true);
      setBannerUploadError(null);
      const res = await uploadBannerImage(file);
      setBannerForm((prev) => ({ ...prev, image_url: res.image_url }));
    } catch (err: any) {
      setBannerUploadError(err.message || 'Gagal mengunggah gambar banner');
    } finally {
      setUploadingBannerImage(false);
      e.target.value = '';
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bannerForm.title.trim()) {
      setErrorMessage('Judul banner wajib diisi');
      return;
    }
    if (!bannerForm.image_url.trim()) {
      setErrorMessage('Gambar banner wajib diunggah');
      return;
    }

    try {
      setSubmittingBanner(true);
      setErrorMessage(null);
      const payload = {
        title: bannerForm.title.trim(),
        image_url: bannerForm.image_url.trim(),
        subtitle: null,
        cta_url: bannerForm.cta_url.trim() || null,
        display_order: bannerForm.display_order,
        is_active: bannerForm.is_active,
      };

      if (editingBanner) {
        await updateBanner(editingBanner.id, payload);
        setSuccessMessage('Banner promo berhasil diperbarui!');
      } else {
        await createBanner(payload);
        setSuccessMessage('Banner promo berhasil ditambahkan!');
      }
      setIsBannerModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan banner');
    } finally {
      setSubmittingBanner(false);
    }
  };

  // -------------------------------------------------------------
  // TESTIMONIAL ACTIONS
  // -------------------------------------------------------------
  const handleOpenAddTesti = () => {
    setEditingTesti(null);
    setTestiForm({
      name: '',
      package_name: '',
      rating: 5,
      quote: '',
      avatar_url: '',
      display_order: testimonials.length + 1,
      is_active: true,
    });
    setIsTestiModalOpen(true);
  };

  const handleOpenEditTesti = (t: TestimonialItem) => {
    setEditingTesti(t);
    setTestiForm({
      name: t.name,
      package_name: t.package_name,
      rating: t.rating,
      quote: t.quote,
      avatar_url: t.avatar_url || '',
      display_order: t.display_order,
      is_active: t.is_active,
    });
    setIsTestiModalOpen(true);
  };

  const handleSaveTesti = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testiForm.name.trim()) {
      setErrorMessage('Nama jamaah wajib diisi');
      return;
    }
    if (!testiForm.quote.trim()) {
      setErrorMessage('Isi testimoni wajib diisi');
      return;
    }

    try {
      setSubmittingTesti(true);
      setErrorMessage(null);
      if (editingTesti) {
        await updateTestimonial(editingTesti.id, testiForm);
        setSuccessMessage('Testimoni jamaah berhasil diperbarui!');
      } else {
        await createTestimonial(testiForm);
        setSuccessMessage('Testimoni jamaah berhasil ditambahkan!');
      }
      setIsTestiModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan testimoni');
    } finally {
      setSubmittingTesti(false);
    }
  };

  // -------------------------------------------------------------
  // FAQ ACTIONS
  // -------------------------------------------------------------
  const handleOpenAddFAQ = () => {
    setEditingFAQ(null);
    setFaqForm({
      question: '',
      answer: '',
      display_order: faqs.length + 1,
      is_active: true,
    });
    setIsFAQModalOpen(true);
  };

  const handleOpenEditFAQ = (f: FAQItem) => {
    setEditingFAQ(f);
    setFaqForm({
      question: f.question,
      answer: f.answer,
      display_order: f.display_order,
      is_active: f.is_active,
    });
    setIsFAQModalOpen(true);
  };

  const handleSaveFAQ = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faqForm.question.trim()) {
      setErrorMessage('Pertanyaan FAQ wajib diisi');
      return;
    }
    if (!faqForm.answer.trim()) {
      setErrorMessage('Jawaban FAQ wajib diisi');
      return;
    }

    try {
      setSubmittingFAQ(true);
      setErrorMessage(null);
      if (editingFAQ) {
        await updateFAQ(editingFAQ.id, faqForm);
        setSuccessMessage('FAQ berhasil diperbarui!');
      } else {
        await createFAQ(faqForm);
        setSuccessMessage('FAQ baru berhasil ditambahkan!');
      }
      setIsFAQModalOpen(false);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan FAQ');
    } finally {
      setSubmittingFAQ(false);
    }
  };

  // -------------------------------------------------------------
  // DELETE ACTION
  // -------------------------------------------------------------
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      setDeleting(true);
      setErrorMessage(null);
      if (deleteConfirm.type === 'banner') {
        await deleteBanner(deleteConfirm.id);
        setSuccessMessage('Banner berhasil dihapus!');
      } else if (deleteConfirm.type === 'testi') {
        await deleteTestimonial(deleteConfirm.id);
        setSuccessMessage('Testimoni berhasil dihapus!');
      } else if (deleteConfirm.type === 'faq') {
        await deleteFAQ(deleteConfirm.id);
        setSuccessMessage('FAQ berhasil dihapus!');
      }
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus item');
    } finally {
      setDeleting(false);
    }
  };

  const menuItems = getStandardMenuItems('content-' + activeTab);

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: '1080px' }}>
          {activeTab === 'banners' && (
            <PageHeader
              title="Banner Promo Carousel"
              subtitle="Kelola slide gambar dan banner promosi yang tampil di posisi teratas beranda web publik travel Anda."
              actions={
                <Button variant="primary" size="sm" onClick={handleOpenAddBanner}>
                  <Plus size={16} />
                  <span>Tambah Banner</span>
                </Button>
              }
            />
          )}
          {activeTab === 'testimonials' && (
            <PageHeader
              title="Testimoni Jamaah"
              subtitle="Koleksi ulasan, bintang rating, dan kutipan kepuasan jamaah yang telah berangkat bersama travel Anda."
              actions={
                <Button variant="primary" size="sm" onClick={handleOpenAddTesti}>
                  <Plus size={16} />
                  <span>Tambah Testimoni</span>
                </Button>
              }
            />
          )}
          {activeTab === 'faqs' && (
            <PageHeader
              title="FAQ / Tanya Jawab"
              subtitle="Daftar pertanyaan umum dan jawaban untuk mempermudah calon jamaah mendapatkan informasi sebelum mendaftar."
              actions={
                <Button variant="primary" size="sm" onClick={handleOpenAddFAQ}>
                  <Plus size={16} />
                  <span>Tambah FAQ</span>
                </Button>
              }
            />
          )}

          {successMessage && (
            <div className="db-alert db-alert--success">
              <CheckCircle2 size={18} />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="db-alert db-alert--error">
              <AlertCircle size={18} />
              <span>{errorMessage}</span>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '32px 0', color: 'var(--db-text-muted)' }}>
              <RefreshCw size={20} className="db-spin" />
              <span>Memuat data konten...</span>
            </div>
          ) : (
            <>
              {/* ------------------------------------------------------------- */}
              {/* TAB 1: BANNERS */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'banners' && (
                <Card>
                  {banners.length === 0 ? (
                    <div className="db-empty-state-card">
                      <ImageIcon size={40} className="db-empty-state-card__icon" />
                      <h4 className="db-empty-state-card__title">Belum ada banner promo khusus</h4>
                      <p className="db-empty-state-card__desc">
                        Website publik saat ini menampilkan placeholder default. Klik tombol di bawah untuk menambahkan banner perdana Anda.
                      </p>
                      <Button variant="primary" size="sm" onClick={handleOpenAddBanner}>
                        <Plus size={14} />
                        <span>Tambah Banner Sekarang</span>
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {banners.map((b) => (
                        <div
                          key={b.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 16px',
                            backgroundColor: 'var(--db-chart-area-fill)',
                            border: '1px solid var(--db-border)',
                            borderRadius: 'var(--radius-md)',
                            gap: '16px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: '100px',
                                height: '56px',
                                borderRadius: 'var(--radius-sm)',
                                overflow: 'hidden',
                                backgroundColor: 'var(--db-border)',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {b.image_url ? (
                                <img
                                  src={b.image_url}
                                  alt={b.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <ImageIcon size={20} color="var(--db-text-muted)" />
                              )}
                            </div>

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{b.title}</span>
                                {!b.is_active && (
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      padding: '2px 6px',
                                      borderRadius: '4px',
                                      backgroundColor: 'var(--db-border)',
                                      color: 'var(--db-text-muted)',
                                    }}
                                  >
                                    Nonaktif
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: 'var(--db-text-muted)' }}>
                                <span>Urutan: #{b.display_order}</span>
                                {b.cta_url && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <ExternalLink size={12} /> {b.cta_url}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Button variant="secondary" size="sm" onClick={() => handleOpenEditBanner(b)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteConfirm({ type: 'banner', id: b.id, name: b.title })}
                            >
                              <Trash2 size={14} color="var(--db-negative)" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 2: TESTIMONIALS */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'testimonials' && (
                <Card>
                  {testimonials.length === 0 ? (
                    <div className="db-empty-state-card">
                      <Quote size={40} className="db-empty-state-card__icon" />
                      <h4 className="db-empty-state-card__title">Belum ada testimoni khusus yang diinput</h4>
                      <p className="db-empty-state-card__desc">
                        Website publik saat ini menampilkan ulasan alumni default. Klik tombol di bawah untuk menambahkan testimoni asli jamaah Anda.
                      </p>
                      <Button variant="primary" size="sm" onClick={handleOpenAddTesti}>
                        <Plus size={14} />
                        <span>Tambah Testimoni Sekarang</span>
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {testimonials.map((t) => (
                        <div
                          key={t.id}
                          style={{
                            padding: '16px',
                            backgroundColor: 'var(--db-chart-area-fill)',
                            border: '1px solid var(--db-border)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '16px',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{t.name}</span>
                              <span style={{ fontSize: '13px', color: 'var(--db-text-muted)' }}>— {t.package_name}</span>
                              {!t.is_active && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--db-border)',
                                    color: 'var(--db-text-muted)',
                                  }}
                                >
                                  Nonaktif
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', margin: '4px 0 8px', color: 'var(--db-rating-star)' }}>
                              {[...Array(t.rating)].map((_, i) => (
                                <Star key={i} size={14} fill="currentColor" />
                              ))}
                            </div>

                            <p style={{ margin: 0, fontSize: '14px', color: 'var(--db-text-primary)', fontStyle: 'italic', lineHeight: '1.5' }}>
                              &ldquo;{t.quote}&rdquo;
                            </p>

                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--db-text-muted)' }}>
                              Urutan: #{t.display_order}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Button variant="secondary" size="sm" onClick={() => handleOpenEditTesti(t)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteConfirm({ type: 'testi', id: t.id, name: t.name })}
                            >
                              <Trash2 size={14} color="var(--db-negative)" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 3: FAQS */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'faqs' && (
                <Card>
                  {faqs.length === 0 ? (
                    <div className="db-empty-state-card">
                      <HelpCircle size={40} className="db-empty-state-card__icon" />
                      <h4 className="db-empty-state-card__title">Belum ada FAQ khusus yang ditambahkan</h4>
                      <p className="db-empty-state-card__desc">
                        Website publik saat ini menampilkan daftar FAQ standar. Tambahkan FAQ spesifik travel Anda untuk mempermudah calon jamaah.
                      </p>
                      <Button variant="primary" size="sm" onClick={handleOpenAddFAQ}>
                        <Plus size={14} />
                        <span>Tambah FAQ Sekarang</span>
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {faqs.map((f) => (
                        <div
                          key={f.id}
                          style={{
                            padding: '16px',
                            backgroundColor: 'var(--db-chart-area-fill)',
                            border: '1px solid var(--db-border)',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '16px',
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--db-text-primary)' }}>{f.question}</span>
                              {!f.is_active && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--db-border)',
                                    color: 'var(--db-text-muted)',
                                  }}
                                >
                                  Nonaktif
                                </span>
                              )}
                            </div>

                            <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--db-text-muted)', lineHeight: '1.5' }}>
                              {f.answer}
                            </p>

                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--db-text-muted)' }}>
                              Urutan: #{f.display_order}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Button variant="secondary" size="sm" onClick={() => handleOpenEditFAQ(f)}>
                              <Edit2 size={14} />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteConfirm({ type: 'faq', id: f.id, name: f.question })}
                            >
                              <Trash2 size={14} color="var(--db-negative)" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}

          {/* ------------------------------------------------------------- */}
          {/* MODAL: BANNER */}
          {/* ------------------------------------------------------------- */}
          <Modal
            isOpen={isBannerModalOpen}
            onClose={() => setIsBannerModalOpen(false)}
            title={editingBanner ? 'Edit Banner Promo' : 'Tambah Banner Promo Baru'}
          >
            <form onSubmit={handleSaveBanner}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <FormInput
                  label="Judul Banner Promo"
                  placeholder="Contoh: Promo Umroh Syawal Akbar"
                  value={bannerForm.title}
                  onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                  tooltip="Judul ini hanya digunakan sebagai penanda di dashboard admin dan teks alternatif (alt) gambar untuk SEO Google, tidak akan menutupi visual banner di website publik."
                  tooltipPosition="bottom"
                  required
                />

                {/* Upload Gambar Banner */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                      Gambar Banner Promo *
                    </label>
                    <span style={{ fontSize: '11px', color: 'var(--db-text-muted)' }}>
                      Rasio disarankan ~2.4:1 (Maks. 8MB)
                    </span>
                  </div>

                  {bannerUploadError && (
                    <div className="db-alert db-alert--error" style={{ padding: '8px 12px', fontSize: '12px', marginBottom: '8px' }}>
                      <AlertCircle size={15} />
                      <span>{bannerUploadError}</span>
                    </div>
                  )}

                  {bannerForm.image_url ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div
                        style={{
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          height: '140px',
                          backgroundColor: 'var(--db-border)',
                          position: 'relative',
                          border: '1px solid var(--db-border)',
                        }}
                      >
                        <img
                          src={bannerForm.image_url}
                          alt="Banner Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--db-card-bg)',
                            border: '1px solid var(--db-border)',
                            color: 'var(--db-text-primary)',
                            fontSize: '12px',
                            fontWeight: 500,
                            cursor: uploadingBannerImage ? 'not-allowed' : 'pointer',
                            opacity: uploadingBannerImage ? 0.7 : 1,
                          }}
                        >
                          <Upload size={14} />
                          <span>{uploadingBannerImage ? 'Mengunggah...' : 'Ganti Gambar'}</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleBannerFileChange}
                            disabled={uploadingBannerImage}
                            style={{ display: 'none' }}
                          />
                        </label>

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setBannerForm((prev) => ({ ...prev, image_url: '' }))}
                          disabled={uploadingBannerImage}
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          <Trash2 size={13} />
                          <span>Hapus Gambar</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px 16px',
                        border: '2px dashed var(--db-border)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--db-chart-area-fill)',
                        cursor: uploadingBannerImage ? 'not-allowed' : 'pointer',
                        opacity: uploadingBannerImage ? 0.7 : 1,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--db-card-bg)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--db-primary-button)',
                          marginBottom: '8px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                        }}
                      >
                        <Upload size={20} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                        {uploadingBannerImage ? 'Mengunggah...' : 'Pilih Gambar Banner'}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--db-text-muted)', marginTop: '4px' }}>
                        Mendukung format JPG, PNG, atau WebP (otomatis dikompresi agar web memuat cepat)
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleBannerFileChange}
                        disabled={uploadingBannerImage}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>

                <FormInput
                  label="Link Tujuan / CTA URL (Opsional)"
                  placeholder="Contoh: /paket/10 atau link pendaftaran"
                  value={bannerForm.cta_url}
                  onChange={(e) => setBannerForm({ ...bannerForm, cta_url: e.target.value })}
                  tooltip="Jika diisi, pengunjung yang mengklik banner di website publik akan otomatis diarahkan ke URL ini."
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormInput
                    label="Urutan Tampil"
                    type="number"
                    value={String(bannerForm.display_order)}
                    onChange={(e) => setBannerForm({ ...bannerForm, display_order: parseInt(e.target.value) || 1 })}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '28px', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="banner_active"
                      checked={bannerForm.is_active}
                      onChange={(e) => setBannerForm({ ...bannerForm, is_active: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label htmlFor="banner_active" style={{ fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>
                      Tampilkan di Beranda
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <Button variant="secondary" type="button" onClick={() => setIsBannerModalOpen(false)}>
                    Batal
                  </Button>
                  <Button variant="primary" type="submit" disabled={submittingBanner || uploadingBannerImage}>
                    {submittingBanner ? 'Menyimpan...' : 'Simpan Banner'}
                  </Button>
                </div>
              </div>
            </form>
          </Modal>

          {/* ------------------------------------------------------------- */}
          {/* MODAL: TESTIMONIAL */}
          {/* ------------------------------------------------------------- */}
          <Modal
            isOpen={isTestiModalOpen}
            onClose={() => setIsTestiModalOpen(false)}
            title={editingTesti ? 'Edit Testimoni' : 'Tambah Testimoni Baru'}
          >
            <form onSubmit={handleSaveTesti}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <FormInput
                  label="Nama Jamaah *"
                  placeholder="Contoh: H. Bambang Sugiarto & Keluarga"
                  value={testiForm.name}
                  onChange={(e) => setTestiForm({ ...testiForm, name: e.target.value })}
                  required
                />

                <FormInput
                  label="Paket / Tahun Keberangkatan"
                  placeholder="Contoh: Alumni Umroh Syawal 1447H"
                  value={testiForm.package_name}
                  onChange={(e) => setTestiForm({ ...testiForm, package_name: e.target.value })}
                />

                <FormInput
                  label="Rating Bintang (1 - 5)"
                  type="select"
                  value={String(testiForm.rating)}
                  onChange={(e) => setTestiForm({ ...testiForm, rating: parseInt(e.target.value) || 5 })}
                  options={[
                    { value: '5', label: '5 Bintang — Sangat Memuaskan' },
                    { value: '4', label: '4 Bintang — Memuaskan' },
                    { value: '3', label: '3 Bintang — Cukup' },
                    { value: '2', label: '2 Bintang' },
                    { value: '1', label: '1 Bintang' },
                  ]}
                />

                <FormInput
                  label="Kutipan Ulasan / Testimoni *"
                  type="textarea"
                  rows={4}
                  placeholder="Ceritakan pengalaman kepuasan pelayanan, fasilitas hotel, dan bimbingan muthawif..."
                  value={testiForm.quote}
                  onChange={(e) => setTestiForm({ ...testiForm, quote: e.target.value })}
                  required
                />

                <FormInput
                  label="URL Foto Profil Jamaah (Opsional)"
                  placeholder="https://example.com/foto-jamaah.jpg"
                  value={testiForm.avatar_url}
                  onChange={(e) => setTestiForm({ ...testiForm, avatar_url: e.target.value })}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormInput
                    label="Urutan Tampil"
                    type="number"
                    value={String(testiForm.display_order)}
                    onChange={(e) => setTestiForm({ ...testiForm, display_order: parseInt(e.target.value) || 1 })}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '28px', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="testi_active"
                      checked={testiForm.is_active}
                      onChange={(e) => setTestiForm({ ...testiForm, is_active: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label htmlFor="testi_active" style={{ fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>
                      Tampilkan di Beranda
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <Button variant="secondary" type="button" onClick={() => setIsTestiModalOpen(false)}>
                    Batal
                  </Button>
                  <Button variant="primary" type="submit" disabled={submittingTesti}>
                    {submittingTesti ? 'Menyimpan...' : 'Simpan Testimoni'}
                  </Button>
                </div>
              </div>
            </form>
          </Modal>

          {/* ------------------------------------------------------------- */}
          {/* MODAL: FAQ */}
          {/* ------------------------------------------------------------- */}
          <Modal
            isOpen={isFAQModalOpen}
            onClose={() => setIsFAQModalOpen(false)}
            title={editingFAQ ? 'Edit FAQ' : 'Tambah FAQ Baru'}
          >
            <form onSubmit={handleSaveFAQ}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <FormInput
                  label="Pertanyaan (Question) *"
                  placeholder="Contoh: Apakah paket sudah mencakup tiket pesawat dan visa?"
                  value={faqForm.question}
                  onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                  required
                />

                <FormInput
                  label="Jawaban (Answer) *"
                  type="textarea"
                  rows={4}
                  placeholder="Tuliskan jawaban yang jelas dan informatif untuk calon jamaah..."
                  value={faqForm.answer}
                  onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                  required
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <FormInput
                    label="Urutan Tampil"
                    type="number"
                    value={String(faqForm.display_order)}
                    onChange={(e) => setFaqForm({ ...faqForm, display_order: parseInt(e.target.value) || 1 })}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '28px', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="faq_active"
                      checked={faqForm.is_active}
                      onChange={(e) => setFaqForm({ ...faqForm, is_active: e.target.checked })}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <label htmlFor="faq_active" style={{ fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>
                      Tampilkan di Beranda
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <Button variant="secondary" type="button" onClick={() => setIsFAQModalOpen(false)}>
                    Batal
                  </Button>
                  <Button variant="primary" type="submit" disabled={submittingFAQ}>
                    {submittingFAQ ? 'Menyimpan...' : 'Simpan FAQ'}
                  </Button>
                </div>
              </div>
            </form>
          </Modal>

          {/* ------------------------------------------------------------- */}
          {/* MODAL: DELETE CONFIRMATION */}
          {/* ------------------------------------------------------------- */}
          <Modal
            isOpen={!!deleteConfirm}
            onClose={() => setDeleteConfirm(null)}
            title="Konfirmasi Hapus"
          >
            <div>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--db-text-primary)' }}>
                Apakah Anda yakin ingin menghapus <strong>{deleteConfirm?.name}</strong>? Tindakan ini tidak dapat dibatalkan.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
                  Batal
                </Button>
                <Button variant="primary" onClick={handleConfirmDelete} disabled={deleting}>
                  {deleting ? 'Menghapus...' : 'Hapus'}
                </Button>
              </div>
            </div>
          </Modal>
        </main>
      </div>
    </div>
  );
};
