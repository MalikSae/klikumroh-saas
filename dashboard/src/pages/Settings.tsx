import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Globe,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Upload,
  Trash2,
  Image as ImageIcon,
  Search,
  Share2,
  MapPin,
  Star,
  Sparkles,
  CheckCheck,
  Link2,
  Copy,
  Check,
  Plus,
  ArrowRight,
  FileText,
  Clock,
  AlertTriangle,
  CalendarClock,
  Download,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  PageHeader,
  Card,
  FormInput,
  Button,
  Badge,
  Modal,
  Tooltip,
  getStandardMenuItems,
} from '../components';
import {
  fetchTenantBranding,
  updateTenantBranding,
  fetchTenantProfile,
  updateTenantProfile,
  fetchTenantContactLegal,
  updateTenantContactLegal,
  fetchTenantTrustMetrics,
  updateTenantTrustMetrics,
  fetchCommissionSettings,
  updateCommissionSettings,
  fetchTenantAgentSettings,
  updateTenantAgentSettings,
  uploadAgentPoster,
  deleteAgentPoster,
  fetchTenantTargetSettings,
  updateTenantTargetSettings,
  uploadTenantIcon,
  deleteTenantIcon,
  uploadTenantLogo,
  deleteTenantLogo,
  fetchTenantSEOGeo,
  updateTenantSEOGeo,
  uploadTenantOGImage,
  deleteTenantOGImage,
  fetchDomains,
  registerCustomDomain,
  verifyCustomDomain,
  deleteCustomDomain,
  type DomainItem,
  fetchTeamMembers,
  addTeamMember,
  toggleTeamMemberStatus,
  type TeamMemberItem,
  getFullImageUrl,
  getStoredUser,
  getStoredTravelName,
  setStoredTravelName,
  fetchTenantSubscription,
  fetchPricingPlansForRenewal,
  type TenantSubscriptionInfo,
  type SubscriptionPricingPlan,
  API_BASE,
} from '../services/api';

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

type SettingsTab = 'profile' | 'contact' | 'trust' | 'seo' | 'agent' | 'domain' | 'team' | 'subscription';

const VALID_SETTINGS_TABS: SettingsTab[] = [
  'profile',
  'contact',
  'trust',
  'seo',
  'agent',
  'domain',
  'team',
  'subscription',
];

export const SettingsPage: React.FC = () => {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const activeTab: SettingsTab = VALID_SETTINGS_TABS.includes(section as SettingsTab)
    ? (section as SettingsTab)
    : 'profile';

  useEffect(() => {
    if (!section || !VALID_SETTINGS_TABS.includes(section as SettingsTab)) {
      navigate('/settings/profile', { replace: true });
    }
  }, [section, navigate]);

  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profil & Branding state
  const [name, setName] = useState<string>('');
  const [brandLogoURL, setBrandLogoURL] = useState<string>('');
  const [brandIconURL, setBrandIconURL] = useState<string>('');
  const [uploadingIcon, setUploadingIcon] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);
  const [tagline, setTagline] = useState<string>('');
  const [aboutSummary, setAboutSummary] = useState<string>('');
  const [brandColor, setBrandColor] = useState<string>('#16A34A');
  const [colorError, setColorError] = useState<string | null>(null);

  // Kontak & Legalitas state
  const [ppiuNumber, setPpiuNumber] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [whatsappNumber, setWhatsappNumber] = useState<string>('');
  const [socialInstagram, setSocialInstagram] = useState<string>('');
  const [socialFacebook, setSocialFacebook] = useState<string>('');
  const [socialYoutube, setSocialYoutube] = useState<string>('');

  // Trust Strip state
  const [trustRating, setTrustRating] = useState<string>('4.9');
  const [trustAlumniCount, setTrustAlumniCount] = useState<string>('1.000+');
  const [trustGuarantee, setTrustGuarantee] = useState<string>('100% Berangkat, Jadwal Pasti');

  // Komisi state
  const [commissionOverrideEnabled, setCommissionOverrideEnabled] = useState<boolean>(false);
  const [commissionOverridePercentage, setCommissionOverridePercentage] = useState<string>('');
  const [commissionError, setCommissionError] = useState<string | null>(null);

  // Pengaturan Sistem Agen state
  const [agentMode, setAgentMode] = useState<'gratis' | 'berbayar'>('gratis');
  const [agentRegistrationFee, setAgentRegistrationFee] = useState<string>('');
  const [agentRegistrationBenefits, setAgentRegistrationBenefits] = useState<string>('');
  const [agentBankName, setAgentBankName] = useState<string>('');
  const [agentBankAccountNumber, setAgentBankAccountNumber] = useState<string>('');
  const [agentBankAccountHolder, setAgentBankAccountHolder] = useState<string>('');
  const [agentTermsConditions, setAgentTermsConditions] = useState<string>('');
  const [agentPosterURL, setAgentPosterURL] = useState<string>('');
  const [uploadingPoster, setUploadingPoster] = useState<boolean>(false);
  const [minimumPayoutAmount, setMinimumPayoutAmount] = useState<string>('');
  const [agentSettingsError, setAgentSettingsError] = useState<string | null>(null);

  // Target Bulanan Agen state
  const [targetPeriodStart, setTargetPeriodStart] = useState<string>('');
  const [targetPeriodEnd, setTargetPeriodEnd] = useState<string>('');
  const [targetJamaah, setTargetJamaah] = useState<string>('');
  const [targetSettingsError, setTargetSettingsError] = useState<string | null>(null);

  // SEO & GEO state
  const [city, setCity] = useState<string>('');
  const [province, setProvince] = useState<string>('');
  const [metaTitle, setMetaTitle] = useState<string>('');
  const [metaDescription, setMetaDescription] = useState<string>('');
  const [metaKeywords, setMetaKeywords] = useState<string>('');
  const [ogImageURL, setOgImageURL] = useState<string>('');
  const [uploadingOGImage, setUploadingOGImage] = useState<boolean>(false);
  const [seoError, setSeoError] = useState<string | null>(null);

  // Custom Domain state
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [customDomainInput, setCustomDomainInput] = useState<string>('');
  const [addingDomain, setAddingDomain] = useState<boolean>(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [verifyingDomainId, setVerifyingDomainId] = useState<number | null>(null);
  const [deletingDomainId, setDeletingDomainId] = useState<number | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<boolean>(false);
  const [domainToDelete, setDomainToDelete] = useState<DomainItem | null>(null);

  // Team Management state
  const [teamMembers, setTeamMembers] = useState<TeamMemberItem[]>([]);
  const [loadingTeam, setLoadingTeam] = useState<boolean>(false);
  const [newMemberName, setNewMemberName] = useState<string>('');
  const [newMemberEmail, setNewMemberEmail] = useState<string>('');
  const [newMemberPassword, setNewMemberPassword] = useState<string>('');
  const [addingMember, setAddingMember] = useState<boolean>(false);
  const [togglingMemberId, setTogglingMemberId] = useState<number | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);

  // Subscription & Billing state
  const [subInfo, setSubInfo] = useState<TenantSubscriptionInfo | null>(null);
  const [pricingPlans, setPricingPlans] = useState<SubscriptionPricingPlan[]>([]);
  const [loadingSub, setLoadingSub] = useState<boolean>(false);
  const [previewProofURL, setPreviewProofURL] = useState<string | null>(null);

  const currentPlan = pricingPlans.find((p) => p.id === subInfo?.current_plan_id) || pricingPlans[0];
  const activePeriodMonths = Math.max(1, subInfo?.current_plan_period_months || (currentPlan ? currentPlan.period_months : 12));
  const effectiveMonthlyPrice = currentPlan && currentPlan.period_months ? Math.round(currentPlan.price / currentPlan.period_months) : 400000;
  const daysRemaining = subInfo?.days_remaining ?? 0;
  const isSubPending = subInfo?.status === 'pending';
  const isSubExpired = Boolean(subInfo?.is_subscription_expired || subInfo?.is_suspended);
  const totalDays = Math.max(daysRemaining, activePeriodMonths * 30);
  const daysPassed = Math.max(0, totalDays - daysRemaining);
  const daysPerMonth = totalDays / activePeriodMonths;
  const currentMonthIndex = isSubPending
    ? 0
    : isSubExpired
    ? activePeriodMonths
    : Math.min(activePeriodMonths, Math.max(1, Math.floor(daysPassed / daysPerMonth) + 1));

  const handleExportBillingCSV = () => {
    if (!subInfo?.payment_verifications || subInfo.payment_verifications.length === 0) return;
    const headers = ['Invoice ID', 'Tanggal', 'Paket', 'Kupon', 'Total Bayar', 'Status', 'Keterangan'];
    const rows = subInfo.payment_verifications.map((item) => [
      `INV-${item.id}`,
      new Date(item.created_at).toLocaleDateString('id-ID'),
      item.plan_name || `Paket #${item.plan_id}`,
      item.coupon_code || '-',
      item.final_amount,
      item.status === 'approved' ? 'Disetujui' : item.status === 'rejected' ? 'Ditolak' : 'Menunggu Verifikasi',
      item.rejection_reason || '-',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `riwayat-tagihan-${subInfo.tenant_name || 'travel'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadSubscriptionData = async () => {
    try {
      setLoadingSub(true);
      const [info, plans] = await Promise.all([
        fetchTenantSubscription(),
        fetchPricingPlansForRenewal(),
      ]);
      setSubInfo(info);
      setPricingPlans(plans);
    } catch (err: any) {
      console.error('Failed to load subscription info:', err);
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'subscription') {
      loadSubscriptionData();
    }
  }, [activeTab]);

  const currentUser = getStoredUser();

  const loadSettings = async () => {
    try {
      setLoading(true);
      setLoadingTeam(true);
      setErrorMessage(null);

      const [brandingData, profileData, contactData, trustData, commData, agentData, targetData, seoData, domainsData, teamData] = await Promise.all([
        fetchTenantBranding().catch(() => ({ brand_primary_color: '#16A34A' })),
        fetchTenantProfile().catch(() => ({ name: '', brand_logo_url: null, brand_icon_url: null, tagline: null, about_summary: null })),
        fetchTenantContactLegal().catch(() => ({
          ppiu_number: null, address: null, phone: null, email: null, whatsapp_number: null,
          social_instagram: null, social_facebook: null, social_youtube: null,
        })),
        fetchTenantTrustMetrics().catch(() => ({
          trust_rating: '4.9', trust_alumni_count: '1.000+', trust_guarantee: '100% Berangkat, Jadwal Pasti',
        })),
        fetchCommissionSettings().catch(() => ({ commission_override_enabled: false, commission_override_percentage: null })),
        fetchTenantAgentSettings().catch(() => ({
          agent_registration_fee: null,
          agent_registration_benefits: null,
          agent_bank_name: null,
          agent_bank_account_number: null,
          agent_bank_account_holder: null,
          agent_terms_conditions: null,
          agent_poster_url: null,
          minimum_payout_amount: null,
        })),
        fetchTenantTargetSettings().catch(() => ({
          target_period_start: null,
          target_period_end: null,
          target_jamaah: null,
        })),
        fetchTenantSEOGeo().catch(() => ({
          city: null,
          province: null,
          meta_title: null,
          meta_description: null,
          meta_keywords: null,
          og_image_url: null,
        })),
        fetchDomains().catch(() => []),
        fetchTeamMembers().catch(() => []),
      ]);

      setDomains(domainsData || []);
      setTeamMembers(teamData || []);
      setLoadingTeam(false);

      // Branding
      setBrandColor(brandingData.brand_primary_color || '#16A34A');

      // Profile
      setName(profileData.name || '');
      if (profileData.name && profileData.name.trim()) {
        setStoredTravelName(profileData.name.trim());
      }
      setBrandLogoURL(profileData.brand_logo_url || '');
      setBrandIconURL(profileData.brand_icon_url || '');
      setTagline(profileData.tagline || '');
      setAboutSummary(profileData.about_summary || '');

      // Contact & Legal
      setPpiuNumber(contactData.ppiu_number || '');
      setAddress(contactData.address || '');
      setEmail(contactData.email || '');
      setWhatsappNumber(contactData.whatsapp_number || '');
      setSocialInstagram(contactData.social_instagram || '');
      setSocialFacebook(contactData.social_facebook || '');
      setSocialYoutube(contactData.social_youtube || '');

      // Trust metrics
      setTrustRating(trustData.trust_rating || '4.9');
      setTrustAlumniCount(trustData.trust_alumni_count || '1.000+');
      setTrustGuarantee(trustData.trust_guarantee || '100% Berangkat, Jadwal Pasti');

      // Commission
      if (commData) {
        setCommissionOverrideEnabled(commData.commission_override_enabled);
        setCommissionOverridePercentage(
          commData.commission_override_percentage !== null && commData.commission_override_percentage !== undefined
            ? String(commData.commission_override_percentage)
            : ''
        );
      }

      // Agent Settings
      if (agentData) {
        const isPaid = agentData.agent_registration_fee !== null && agentData.agent_registration_fee !== undefined && agentData.agent_registration_fee > 0;
        setAgentMode(isPaid ? 'berbayar' : 'gratis');
        setAgentRegistrationFee(agentData.agent_registration_fee !== null && agentData.agent_registration_fee !== undefined ? String(agentData.agent_registration_fee) : '');
        setAgentRegistrationBenefits(agentData.agent_registration_benefits || '');
        setAgentBankName(agentData.agent_bank_name || '');
        setAgentBankAccountNumber(agentData.agent_bank_account_number || '');
        setAgentBankAccountHolder(agentData.agent_bank_account_holder || '');
        setAgentTermsConditions(agentData.agent_terms_conditions || '');
        setAgentPosterURL(agentData.agent_poster_url || '');
        setMinimumPayoutAmount(agentData.minimum_payout_amount !== null && agentData.minimum_payout_amount !== undefined ? String(agentData.minimum_payout_amount) : '');
      }

      // Target Settings
      if (targetData) {
        setTargetPeriodStart(targetData.target_period_start || '');
        setTargetPeriodEnd(targetData.target_period_end || '');
        setTargetJamaah(targetData.target_jamaah !== null && targetData.target_jamaah !== undefined ? String(targetData.target_jamaah) : '');
      }

      // SEO & GEO Settings
      if (seoData) {
        setCity(seoData.city || '');
        setProvince(seoData.province || '');
        setMetaTitle(seoData.meta_title || '');
        setMetaDescription(seoData.meta_description || '');
        setMetaKeywords(seoData.meta_keywords || '');
        setOgImageURL(seoData.og_image_url || '');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memuat data pengaturan');
    } finally {
      setLoading(false);
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBrandColor(val);
    if (val && !HEX_REGEX.test(val)) {
      setColorError('Format warna harus berupa hex #RRGGBB (contoh: #2563EB)');
    } else {
      setColorError(null);
    }
  };

  // Submit Profile & Branding
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const trimmedColor = brandColor.trim();
    if (!HEX_REGEX.test(trimmedColor)) {
      setColorError('Format warna harus berupa hex #RRGGBB (contoh: #2563EB)');
      return;
    }

    try {
      setSubmitting(true);
      await Promise.all([
        updateTenantBranding(trimmedColor),
        updateTenantProfile({
          name: name.trim(),
          brand_logo_url: brandLogoURL.trim() || null,
          brand_icon_url: brandIconURL.trim() || null,
          tagline: tagline.trim() || null,
          about_summary: aboutSummary.trim() || null,
        }),
      ]);
      if (name.trim()) {
        setStoredTravelName(name.trim());
      }
      setSuccessMessage('Profil dan branding travel berhasil disimpan! Perubahan langsung aktif di website publik.');
      setSuccessMessage('Profil dan branding berhasil disimpan.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan profil travel');
    } finally {
      setSubmitting(false);
    }
  };

  const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file icon maksimal 5MB');
      return;
    }

    try {
      setUploadingIcon(true);
      setErrorMessage(null);
      const res = await uploadTenantIcon(file);
      setBrandIconURL(res.brand_icon_url);
      setSuccessMessage('Icon travel (rasio 1:1) berhasil diunggah!');
      setSuccessMessage('Ikon travel berhasil diperbarui.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengunggah icon travel');
    } finally {
      setUploadingIcon(false);
      e.target.value = '';
    }
  };

  const handleDeleteIcon = async () => {
    try {
      setUploadingIcon(true);
      setErrorMessage(null);
      await deleteTenantIcon();
      setBrandIconURL('');
      setSuccessMessage('Icon travel berhasil dihapus');
      setSuccessMessage('Ikon travel berhasil dihapus.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus icon travel');
    } finally {
      setUploadingIcon(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file logo maksimal 5MB');
      return;
    }

    try {
      setUploadingLogo(true);
      setErrorMessage(null);
      const res = await uploadTenantLogo(file);
      setBrandLogoURL(res.brand_logo_url);
      setSuccessMessage('Logo resmi horizontal berhasil diunggah!');
      setSuccessMessage('Logo resmi berhasil diperbarui.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengunggah logo travel');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleDeleteLogo = async () => {
    try {
      setUploadingLogo(true);
      setErrorMessage(null);
      await deleteTenantLogo();
      setBrandLogoURL('');
      setSuccessMessage('Logo resmi berhasil dihapus');
      setSuccessMessage('Logo resmi berhasil dihapus.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus logo travel');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Submit Contact & Legal
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      setSubmitting(true);
      await updateTenantContactLegal({
        ppiu_number: ppiuNumber.trim() || null,
        address: address.trim() || null,
        phone: null,
        email: email.trim() || null,
        whatsapp_number: whatsappNumber.trim() || null,
        social_instagram: socialInstagram.trim() || null,
        social_facebook: socialFacebook.trim() || null,
        social_youtube: socialYoutube.trim() || null,
      });
      setSuccessMessage('Data kontak dan legalitas travel berhasil disimpan!');
      setSuccessMessage('Kontak dan legalitas berhasil disimpan.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan data kontak');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Trust Metrics
  const handleTrustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      setSubmitting(true);
      await updateTenantTrustMetrics({
        trust_rating: trustRating.trim() || null,
        trust_alumni_count: trustAlumniCount.trim() || null,
        trust_guarantee: trustGuarantee.trim() || null,
      });
      setSuccessMessage('Badge poin kepercayaan berhasil disimpan!');
      setSuccessMessage('Badge kepercayaan berhasil disimpan.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan metrik kepercayaan');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit SEO & GEO
  const handleSEOSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setSeoError(null);

    try {
      setSubmitting(true);
      await updateTenantSEOGeo({
        city: city.trim() || null,
        province: province.trim() || null,
        meta_title: metaTitle.trim() || null,
        meta_description: metaDescription.trim() || null,
        meta_keywords: metaKeywords.trim() || null,
      });
      setSuccessMessage('Pengaturan SEO & GEO Google berhasil disimpan! Halaman publik dan bot pencari akan membaca konfigurasi terbaru.');
      setSuccessMessage('Pengaturan SEO berhasil disimpan.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setSeoError(err.message || 'Gagal menyimpan pengaturan SEO & GEO');
    } finally {
      setSubmitting(false);
    }
  };

  // Upload OG Image
  const handleOGImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Ukuran file banner share maksimal 5MB');
      return;
    }

    try {
      setUploadingOGImage(true);
      setErrorMessage(null);
      const res = await uploadTenantOGImage(file);
      setOgImageURL(res.og_image_url);
      setSuccessMessage('Banner share media sosial (1200x630 px) berhasil diunggah dan dioptimasi!');
      setSuccessMessage('Banner media sosial berhasil diperbarui.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal mengunggah banner share media sosial');
    } finally {
      setUploadingOGImage(false);
      e.target.value = '';
    }
  };

  // Delete OG Image
  const handleDeleteOGImage = async () => {
    try {
      setUploadingOGImage(true);
      setErrorMessage(null);
      await deleteTenantOGImage();
      setOgImageURL('');
      setSuccessMessage('Banner share media sosial berhasil dihapus. Sistem akan menggunakan poster agen atau logo resmi sebagai fallback.');
      setSuccessMessage('Banner media sosial berhasil dihapus.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus banner share');
    } finally {
      setUploadingOGImage(false);
    }
  };

  // Submit Unified Agent Settings (Sistem Agen, Komisi Override, Target Bulanan)
  const handleUnifiedAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setAgentSettingsError(null);
    setCommissionError(null);
    setTargetSettingsError(null);

    let hasError = false;

    // 1. Agent Mode & Berbayar validation
    let fee: number | null = null;
    if (agentMode === 'berbayar') {
      if (!agentRegistrationFee || isNaN(Number(agentRegistrationFee)) || Number(agentRegistrationFee) <= 0) {
        setAgentSettingsError('Biaya pendaftaran wajib diisi dengan nominal lebih dari 0 untuk mode berbayar');
        hasError = true;
      } else {
        fee = parseFloat(agentRegistrationFee);
      }

      if (!agentBankName.trim() || !agentBankAccountNumber.trim() || !agentBankAccountHolder.trim()) {
        setAgentSettingsError('Nama bank, nomor rekening, dan atas nama pemilik rekening wajib diisi untuk mode berbayar');
        hasError = true;
      }
    }

    // 2. Min Payout validation
    let minPayout: number | null = null;
    if (minimumPayoutAmount.trim() !== '') {
      if (isNaN(Number(minimumPayoutAmount)) || Number(minimumPayoutAmount) < 0) {
        setAgentSettingsError('Minimum saldo pencairan komisi harus berupa angka valid');
        hasError = true;
      } else {
        minPayout = parseFloat(minimumPayoutAmount);
      }
    }

    // 3. Commission Override validation
    let pct: number | null = null;
    if (commissionOverrideEnabled) {
      if (!commissionOverridePercentage || isNaN(Number(commissionOverridePercentage))) {
        setCommissionError('Persentase komisi override harus berupa angka antara 0 dan 100');
        hasError = true;
      } else {
        pct = parseFloat(commissionOverridePercentage);
        if (pct < 0 || pct > 100) {
          setCommissionError('Persentase komisi override harus antara 0 dan 100');
          hasError = true;
        }
      }
    }

    // 4. Target Period validation
    if (targetPeriodStart && targetPeriodEnd) {
      if (new Date(targetPeriodEnd) < new Date(targetPeriodStart)) {
        setTargetSettingsError('Tanggal selesai periode harus sama atau setelah tanggal mulai periode');
        hasError = true;
      }
    }

    if (hasError) {
      return;
    }

    try {
      setSubmitting(true);
      const [, commRes] = await Promise.all([
        updateTenantAgentSettings({
          agent_registration_fee: fee,
          agent_registration_benefits: agentRegistrationBenefits.trim() || null,
          agent_bank_name: agentMode === 'berbayar' ? agentBankName.trim() || null : null,
          agent_bank_account_number: agentMode === 'berbayar' ? agentBankAccountNumber.trim() || null : null,
          agent_bank_account_holder: agentMode === 'berbayar' ? agentBankAccountHolder.trim() || null : null,
          agent_terms_conditions: agentTermsConditions.trim() || null,
          agent_poster_url: agentPosterURL || null,
          minimum_payout_amount: minPayout,
        }),
        updateCommissionSettings(commissionOverrideEnabled, pct),
        updateTenantTargetSettings({
          target_period_start: targetPeriodStart.trim() ? targetPeriodStart.trim() : null,
          target_period_end: targetPeriodEnd.trim() ? targetPeriodEnd.trim() : null,
          target_jamaah: targetJamaah.trim() ? parseInt(targetJamaah.trim(), 10) : null,
        }),
      ]);

      setCommissionOverrideEnabled(commRes.commission_override_enabled);
      if (commRes.commission_override_percentage !== null && commRes.commission_override_percentage !== undefined) {
        setCommissionOverridePercentage(String(commRes.commission_override_percentage));
      } else {
        setCommissionOverridePercentage('');
      }

      setSuccessMessage('Pengaturan sistem agen, komisi, dan target bulanan berhasil disimpan!');
      setSuccessMessage('Pengaturan agen berhasil disimpan.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menyimpan pengaturan agen');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePosterChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setAgentSettingsError('Ukuran file poster maksimal 8MB');
      return;
    }

    try {
      setUploadingPoster(true);
      setAgentSettingsError(null);
      const res = await uploadAgentPoster(file);
      setAgentPosterURL(res.poster_url);
      setSuccessMessage('Poster promosi agen (rasio 1:1) berhasil diunggah!');
      setSuccessMessage('Poster agen berhasil diperbarui.');
    } catch (err: any) {
      setAgentSettingsError(err.message || 'Gagal mengunggah poster agen');
    } finally {
      setUploadingPoster(false);
      e.target.value = '';
    }
  };

  const handleDeletePoster = async () => {
    try {
      setUploadingPoster(true);
      setAgentSettingsError(null);
      await deleteAgentPoster();
      setAgentPosterURL('');
      setSuccessMessage('Poster promosi agen berhasil dihapus');
      setSuccessMessage('Poster agen berhasil dihapus.');
    } catch (err: any) {
      setAgentSettingsError(err.message || 'Gagal menghapus poster agen');
    } finally {
      setUploadingPoster(false);
    }
  };

  const handleAddCustomDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customDomainInput.trim().toLowerCase();
    if (!trimmed) {
      setDomainError('Nama hostname custom domain wajib diisi');
      return;
    }

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('/') || trimmed.includes(':')) {
      setDomainError('Format domain tidak boleh mengandung http://, https://, titik dua (:), atau tanda garis miring (/)');
      return;
    }

    try {
      setAddingDomain(true);
      setDomainError(null);
      const res = await registerCustomDomain(trimmed);
      setDomains((prev) => [res.domain, ...prev]);
      setCustomDomainInput('');
      setSuccessMessage(`Custom domain ${trimmed} berhasil didaftarkan. Silakan atur CNAME DNS Anda dan klik Verifikasi Sekarang.`);
      setSuccessMessage(`Domain ${trimmed} berhasil ditambahkan. Silakan atur DNS CNAME.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setDomainError(err.message || 'Gagal mendaftarkan custom domain');
    } finally {
      setAddingDomain(false);
    }
  };

  const handleVerifyDomain = async (id: number) => {
    try {
      setVerifyingDomainId(id);
      setErrorMessage(null);
      const updated = await verifyCustomDomain(id);
      setDomains((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (updated.status === 'active') {
        setSuccessMessage(`Verifikasi DNS berhasil! Domain ${updated.hostname} kini berstatus Aktif.`);
        setSuccessMessage(`Verifikasi DNS berhasil. Domain ${updated.hostname} aktif.`);
      } else {
        setErrorMessage(`Verifikasi DNS belum berhasil: ${updated.verification_failure_reason || 'CNAME belum mengarah ke cname.klikumroh.id'}`);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal memverifikasi domain');
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const handleDeleteDomain = async (id: number) => {
    try {
      setDeletingDomainId(id);
      await deleteCustomDomain(id);
      setDomains((prev) => prev.filter((d) => d.id !== id));
      setDomainToDelete(null);
      setSuccessMessage('Custom domain berhasil dihapus');
      setSuccessMessage('Domain kustom berhasil dihapus.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMessage(err.message || 'Gagal menghapus domain');
    } finally {
      setDeletingDomainId(null);
    }
  };

  const handleCopyCNAME = () => {
    navigator.clipboard.writeText('cname.klikumroh.id');
    setCopiedTarget(true);
    setTimeout(() => setCopiedTarget(false), 2000);
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamError(null);
    setTeamSuccess(null);

    const trimmedName = newMemberName.trim();
    const trimmedEmail = newMemberEmail.trim().toLowerCase();

    if (!trimmedName) {
      setTeamError('Nama anggota wajib diisi');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setTeamError('Email valid wajib diisi');
      return;
    }
    if (newMemberPassword.length < 8) {
      setTeamError('Password minimal 8 karakter');
      return;
    }

    try {
      setAddingMember(true);
      const newMember = await addTeamMember({
        name: trimmedName,
        email: trimmedEmail,
        password: newMemberPassword,
      });
      setTeamMembers((prev) => [newMember, ...prev]);
      setNewMemberName('');
      setNewMemberEmail('');
      setNewMemberPassword('');
      setTeamSuccess(`Anggota tim ${newMember.name} berhasil ditambahkan.`);
    } catch (err: any) {
      setTeamError(err.message || 'Gagal menambahkan anggota tim');
    } finally {
      setAddingMember(false);
    }
  };

  const handleToggleTeamMemberStatus = async (member: TeamMemberItem) => {
    setTeamError(null);
    setTeamSuccess(null);
    const action = member.status === 'active' ? 'deactivate' : 'activate';
    try {
      setTogglingMemberId(member.id);
      const updated = await toggleTeamMemberStatus(member.id, action);
      setTeamMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      setTeamSuccess(`Status ${member.name} berhasil diubah menjadi ${updated.status === 'active' ? 'Aktif' : 'Nonaktif'}.`);
    } catch (err: any) {
      setTeamError(err.message || 'Gagal mengubah status anggota tim');
    } finally {
      setTogglingMemberId(null);
    }
  };

  const defaultSubdomain = domains.find((d) => d.type === 'subdomain');
  const customDomains = domains.filter((d) => d.type === 'custom');

  const getHeaderInfo = (tab: SettingsTab) => {
    switch (tab) {
      case 'profile':
        return {
          title: 'Pengaturan Profil & Branding',
          subtitle: 'Konfigurasi identitas visual, logo resmi, ikon 1:1, slogan, dan narasi profil travel Anda.',
        };
      case 'contact':
        return {
          title: 'Pengaturan Kontak & Legalitas',
          subtitle: 'Kelola alamat kantor, nomor WhatsApp resmi, nomor izin PPIU Kemenag, dan tautan media sosial.',
        };
      case 'trust':
        return {
          title: 'Badge Kepercayaan (Trust Metrics)',
          subtitle: 'Kredibilitas travel seperti rating kepuasan jamaah, jumlah alumni, dan jaminan keberangkatan.',
        };
      case 'seo':
        return {
          title: 'Pengaturan SEO & GEO Google',
          subtitle: 'Optimasi mesin pencari Google, meta description, kata kunci, dan penargetan wilayah travel.',
        };
      case 'agent':
        return {
          title: 'Sistem & Komisi Agen',
          subtitle: 'Konfigurasi skema kemitraan, biaya pendaftaran agen, rekening penampung, dan target bulanan.',
        };
      case 'domain':
        return {
          title: 'Domain & Custom Domain',
          subtitle: 'Kelola subdomain default dan hubungkan alamat domain situs travel milik Anda sendiri.',
        };
      case 'team':
        return {
          title: 'Tim & Staf Administrator',
          subtitle: 'Kelola akun staf operasional travel dengan hak akses dashboard admin KlikUmroh.',
        };
      case 'subscription':
        return {
          title: 'Langganan & Tagihan',
          subtitle: 'Status paket langganan KlikUmroh, perpanjangan masa aktif, kupon diskon, dan riwayat tagihan.',
        };
    }
  };
  const headerInfo = getHeaderInfo(activeTab);

  const menuItems = getStandardMenuItems(`settings-${activeTab}`);

  return (
    <div className="db-main-layout">
      <Sidebar
        brandName="KlikUmroh.id"
        menuItems={menuItems}
        footerContent="KlikUmroh.id 1.0"
      />

      <div className="db-content-area">
        <Topbar
          travelName={name.trim() || getStoredTravelName()}
          userName={currentUser?.name || 'Administrator'}
          userRole="Administrator"
          userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'}
        />

        <main className="db-page-container" style={{ maxWidth: activeTab === 'subscription' ? '1140px' : '960px' }}>
          <PageHeader
            title={headerInfo.title}
            subtitle={headerInfo.subtitle}
          />

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
              <span>Memuat data pengaturan...</span>
            </div>
          ) : (
            <>
              {/* ------------------------------------------------------------- */}
              {/* TAB 1: PROFIL & BRANDING */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'profile' && (
                <form onSubmit={handleProfileSubmit}>
                  <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <FormInput
                        label="Nama Travel *"
                        placeholder="Contoh: Al-Barakah Tour & Travel"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />

                      {/* Upload Icon Travel (1:1 / Favicon) */}
                      <div>
                        <label
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--db-text-primary)',
                            display: 'block',
                            marginBottom: '4px',
                          }}
                        >
                          Icon Travel (Rasio 1:1)
                        </label>
                        <p style={{ fontSize: '13px', color: 'var(--db-text-muted)', margin: '0 0 12px 0' }}>
                          Digunakan sebagai favicon tab browser dan icon fallback. Format PNG otomatis dipotong persegi 1:1 dan dikompresi (maks 5MB).
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                          <div
                            style={{
                              width: '80px',
                              height: '80px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px dashed var(--db-border)',
                              backgroundColor: 'var(--db-chart-area-fill)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              position: 'relative',
                              flexShrink: 0,
                            }}
                          >
                            {brandIconURL ? (
                              <img
                                key={brandIconURL}
                                src={getFullImageUrl(brandIconURL)}
                                alt="Icon Travel"
                                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
                              />
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: 'var(--db-text-muted)', textAlign: 'center' }}>
                                <ImageIcon size={22} />
                                <span style={{ fontSize: '10px', fontWeight: 500 }}>1:1 Icon</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--db-primary-button)',
                                color: 'var(--db-card-bg)',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: uploadingIcon ? 'not-allowed' : 'pointer',
                                opacity: uploadingIcon ? 0.7 : 1,
                              }}
                            >
                              <Upload size={15} />
                              <span>{uploadingIcon ? 'Mengunggah...' : brandIconURL ? 'Ganti Icon (1:1)' : 'Pilih Icon (1:1)'}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleIconChange}
                                disabled={uploadingIcon}
                                style={{ display: 'none' }}
                              />
                            </label>

                            {brandIconURL && (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={handleDeleteIcon}
                                disabled={uploadingIcon}
                                style={{ padding: '8px 14px', fontSize: '13px' }}
                              >
                                <Trash2 size={15} />
                                <span>Hapus</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Upload Logo Resmi Horizontal */}
                      <div>
                        <label
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--db-text-primary)',
                            display: 'block',
                            marginBottom: '4px',
                          }}
                        >
                          Logo Resmi (Horizontal)
                        </label>
                        <p style={{ fontSize: '13px', color: 'var(--db-text-muted)', margin: '0 0 12px 0' }}>
                          Ditampilkan pada header situs publik. Format PNG transparan (maks 5MB). Jika belum diunggah, header otomatis menampilkan icon + nama travel.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                          <div
                            style={{
                              width: '220px',
                              height: '64px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px dashed var(--db-border)',
                              backgroundColor: 'var(--db-chart-area-fill)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              position: 'relative',
                              flexShrink: 0,
                            }}
                          >
                            {brandLogoURL ? (
                              <img
                                key={brandLogoURL}
                                src={getFullImageUrl(brandLogoURL)}
                                alt="Logo Travel"
                                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '6px' }}
                              />
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--db-text-muted)' }}>
                                <ImageIcon size={20} />
                                <span style={{ fontSize: '11px', fontWeight: 500 }}>Logo Horizontal</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--db-primary-button)',
                                color: 'var(--db-card-bg)',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: uploadingLogo ? 'not-allowed' : 'pointer',
                                opacity: uploadingLogo ? 0.7 : 1,
                              }}
                            >
                              <Upload size={15} />
                              <span>{uploadingLogo ? 'Mengunggah...' : brandLogoURL ? 'Ganti Logo' : 'Pilih Logo'}</span>
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                onChange={handleLogoChange}
                                disabled={uploadingLogo}
                                style={{ display: 'none' }}
                              />
                            </label>

                            {brandLogoURL && (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={handleDeleteLogo}
                                disabled={uploadingLogo}
                                style={{ padding: '8px 14px', fontSize: '13px' }}
                              >
                                <Trash2 size={15} />
                                <span>Hapus</span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      <FormInput
                        label="Slogan / Tagline Travel (Opsional)"
                        placeholder="Contoh: Sahabat Ibadah Menuju Baitullah yang Mabrur"
                        value={tagline}
                        onChange={(e) => setTagline(e.target.value)}
                      />

                      <FormInput
                        label="Narasi Profil Singkat (Tentang Kami)"
                        type="textarea"
                        rows={4}
                        placeholder="Tuliskan 1-2 paragraf mengenai izin resmi, bimbingan muthawif, dan komitmen pelayanan travel Anda..."
                        value={aboutSummary}
                        onChange={(e) => setAboutSummary(e.target.value)}
                        tooltip="Teks ini akan tampil pada kartu section 'Tentang Kami' di halaman depan web publik."
                      />

                      <div>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: 500, color: 'var(--db-text-primary)', marginBottom: '6px' }}>
                          Warna Utama Brand *
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input
                            type="color"
                            value={brandColor.startsWith('#') && brandColor.length === 7 ? brandColor : '#16A34A'}
                            onChange={handleColorChange}
                            style={{
                              width: '44px',
                              height: '40px',
                              padding: '2px',
                              border: '1px solid var(--db-border)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              backgroundColor: 'var(--db-chart-area-fill)',
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <FormInput
                              placeholder="#16A34A"
                              value={brandColor}
                              onChange={handleColorChange}
                              error={colorError || undefined}
                              hint="Kode HEX warna primer untuk tombol, tab, dan aksen website publik."
                            />
                          </div>
                        </div>
                      </div>

                      <div className="db-form-actions">
                        <Button variant="primary" type="submit" disabled={submitting}>
                          <Save size={16} />
                          <span>{submitting ? 'Menyimpan...' : 'Simpan Profil & Branding'}</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </form>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 2: KONTAK & LEGALITAS */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'contact' && (
                <form onSubmit={handleContactSubmit}>
                  <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <FormInput
                        label="Nomor SK Izin PPIU Kemenag RI"
                        placeholder="Contoh: No. 891/2020 atau No. U.123 Tahun 2023"
                        value={ppiuNumber}
                        onChange={(e) => setPpiuNumber(e.target.value)}
                        tooltip="Nomor SK izin resmi PPIU Kemenag RI. Ditampilkan otomatis pada badge legalitas di web publik dan metadata SEO."
                      />

                      <FormInput
                        label="Alamat Kantor Fisik"
                        type="textarea"
                        rows={2}
                        placeholder="Contoh: Jl. TB Simatupang No. 18, Cilandak, Jakarta Selatan"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />

                      <FormInput
                        label="Email Resmi Travel"
                        type="email"
                        placeholder="info@travelumroh.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />

                      <FormInput
                        label="Nomor WhatsApp Customer Service"
                        placeholder="Contoh: 081234567890 atau 6281234567890"
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        tooltip="Nomor ini digunakan untuk tombol floating Chat WhatsApp di navigasi bawah web publik."
                      />

                      <div style={{ borderTop: '1px solid var(--db-border)', paddingTop: '16px', marginTop: '4px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-muted)', display: 'block', marginBottom: '12px' }}>
                          AKUN MEDIA SOSIAL RESMI (OPSIONAL)
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <FormInput
                            label="Instagram URL"
                            placeholder="https://instagram.com/travelumroh"
                            value={socialInstagram}
                            onChange={(e) => setSocialInstagram(e.target.value)}
                          />
                          <FormInput
                            label="Facebook URL"
                            placeholder="https://facebook.com/travelumroh"
                            value={socialFacebook}
                            onChange={(e) => setSocialFacebook(e.target.value)}
                          />
                          <FormInput
                            label="YouTube URL"
                            placeholder="https://youtube.com/@travelumroh"
                            value={socialYoutube}
                            onChange={(e) => setSocialYoutube(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="db-form-actions">
                        <Button variant="primary" type="submit" disabled={submitting}>
                          <Save size={16} />
                          <span>{submitting ? 'Menyimpan...' : 'Simpan Kontak & Legalitas'}</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </form>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 3: TRUST STRIP */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'trust' && (
                <form onSubmit={handleTrustSubmit}>
                  <Card>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <FormInput
                        label="Rating Kepuasan Jamaah"
                        placeholder="Contoh: 4.9"
                        value={trustRating}
                        onChange={(e) => setTrustRating(e.target.value)}
                        tooltip="Skor rating kepuasan yang ditampilkan pada badge rating (skala 5.0)."
                      />

                      <FormInput
                        label="Total Alumni Jamaah yang Telah Diberangkatkan"
                        placeholder="Contoh: 1.000+ Jamaah"
                        value={trustAlumniCount}
                        onChange={(e) => setTrustAlumniCount(e.target.value)}
                        tooltip="Jumlah alumni jamaah untuk menonjolkan jam terbang travel Anda."
                      />

                      <FormInput
                        label="Slogan Garansi / Komitmen Keberangkatan"
                        placeholder="Contoh: 100% Berangkat, Jadwal Pasti"
                        value={trustGuarantee}
                        onChange={(e) => setTrustGuarantee(e.target.value)}
                        tooltip="Format: '[Garansi], [Keterangan]'. Contoh: '100% Berangkat, Jadwal Pasti'. Otomatis terbagi rapi menjadi judul dan subjudul badge di web publik."
                      />

                      <div className="db-form-actions">
                        <Button variant="primary" type="submit" disabled={submitting}>
                          <Save size={16} />
                          <span>{submitting ? 'Menyimpan...' : 'Simpan Badge Kepercayaan'}</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                </form>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 4: SEO & GEO GOOGLE */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'seo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <form onSubmit={handleSEOSubmit}>
                    <Card>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {seoError && (
                          <div className="db-alert db-alert--error" style={{ marginBottom: 0 }}>
                            <AlertCircle size={18} />
                            <span>{seoError}</span>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                          <FormInput
                            label="Kota / Kabupaten Operasional"
                            placeholder="Contoh: Jakarta Selatan atau Bandung"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            tooltip="Memicu meta tag geo.placename dan Schema.org TravelAgency untuk pencarian lokal Google saat calon jamaah mencari travel di kota Anda."
                          />

                          <FormInput
                            label="Provinsi"
                            placeholder="Contoh: DKI Jakarta atau Jawa Barat"
                            value={province}
                            onChange={(e) => setProvince(e.target.value)}
                            tooltip="Memicu kode wilayah geo.region (ID-JK, ID-JB, dll) pada mesin pencari."
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <label className="db-form-label" style={{ marginBottom: 0 }}>
                                Custom Meta Title
                              </label>
                              <Tooltip content="Judul tab peramban & hasil pencarian Google. Jika kosong, sistem otomatis membuat judul ramah SEO: '[Nama Travel] — Paket Umroh Resmi [Kota] (PPIU [No. Izin])'." />
                            </div>
                            <span style={{ fontSize: '12px', color: metaTitle.length > 60 ? 'var(--db-negative)' : 'var(--db-text-muted)' }}>
                              {metaTitle.length}/60 karakter (Rekomendasi: 50–60)
                            </span>
                          </div>
                          <FormInput
                            placeholder={`Contoh: Paket Umroh Resmi & Terpercaya ${city || 'Jakarta'} | ${name || 'Al-Barakah Tour'}`}
                            value={metaTitle}
                            onChange={(e) => setMetaTitle(e.target.value)}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <label className="db-form-label" style={{ marginBottom: 0 }}>
                                Custom Meta Description
                              </label>
                              <Tooltip content="Cuplikan ringkasan yang muncul di bawah tautan judul pada hasil pencarian Google dan pratinjau pesan media sosial. Rekomendasi: 120–160 karakter." />
                            </div>
                            <span style={{ fontSize: '12px', color: metaDescription.length > 160 ? 'var(--db-negative)' : 'var(--db-text-muted)' }}>
                              {metaDescription.length}/160 karakter (Rekomendasi: 120–160)
                            </span>
                          </div>
                          <FormInput
                            type="textarea"
                            rows={3}
                            placeholder="Contoh: Biro perjalanan umroh resmi dengan izin PPIU Kemenag RI. Dapatkan bimbingan ibadah terpercaya, akomodasi bintang 5 dekat Masjidil Haram, dan kepastian jadwal keberangkatan 100%."
                            value={metaDescription}
                            onChange={(e) => setMetaDescription(e.target.value)}
                          />
                        </div>

                        <FormInput
                          label="Kata Kunci / Meta Keywords"
                          placeholder="Contoh: travel umroh, paket umroh murah, travel umroh jakarta selatan, biaya umroh 2026"
                          value={metaKeywords}
                          onChange={(e) => setMetaKeywords(e.target.value)}
                          tooltip="Kata kunci pencarian spesifik yang relevan dengan penawaran paket umroh travel Anda (pisahkan dengan koma)."
                        />

                        <div className="db-form-actions">
                          <Button variant="primary" type="submit" disabled={submitting}>
                            <Save size={16} />
                            <span>{submitting ? 'Menyimpan...' : 'Simpan Pengaturan SEO & GEO'}</span>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </form>

                  {/* KARTU BANNER OPEN GRAPH (1200 x 630 px) */}
                  <Card
                    title="Gambar Share Media Sosial (Open Graph)"
                    subtitle="Spanduk visual yang otomatis tampil saat tautan website travel atau link referral agen dibagikan ke WhatsApp, Telegram, Facebook, dan medsos lainnya."
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '20px',
                          flexWrap: 'wrap',
                          padding: '20px',
                          backgroundColor: 'var(--db-chart-area-fill)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--db-border)',
                        }}
                      >
                        {/* Preview Box 1.91:1 */}
                        <div
                          style={{
                            width: '260px',
                            aspectRatio: '1200 / 630',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--db-border)',
                            backgroundColor: 'var(--db-card-bg)',
                            overflow: 'hidden',
                            position: 'relative',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: 'var(--shadow-sm)',
                          }}
                        >
                          {ogImageURL ? (
                            <img
                              src={getFullImageUrl(ogImageURL)}
                              alt="Banner Kustom"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : agentPosterURL ? (
                            <img
                              src={getFullImageUrl(agentPosterURL)}
                              alt="Fallback Poster Agen"
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : brandLogoURL ? (
                            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                              <img
                                src={getFullImageUrl(brandLogoURL)}
                                alt="Fallback Logo"
                                style={{ maxHeight: '60px', maxWidth: '80%', objectFit: 'contain' }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: 'var(--db-text-muted)' }}>
                              <ImageIcon size={28} />
                              <span style={{ fontSize: '11px', fontWeight: 600 }}>Rasio 1.91 : 1</span>
                            </div>
                          )}

                          {/* Source Status Tag */}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '8px',
                              left: '8px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'rgba(0, 0, 0, 0.7)',
                              backdropFilter: 'blur(4px)',
                              color: '#ffffff',
                              fontSize: '10px',
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                            }}
                          >
                            {ogImageURL
                              ? 'Banner Kustom'
                              : agentPosterURL
                              ? 'Fallback: Poster Agen'
                              : brandLogoURL
                              ? 'Fallback: Logo Travel'
                              : 'Standar Sistem'}
                          </div>
                        </div>

                        {/* Details & Action Controls */}
                        <div style={{ flex: 1, minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                              Banner Pratinjau Tautan (1200 x 630 px)
                            </span>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--db-card-bg)',
                                border: '1px solid var(--db-border)',
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--db-text-secondary)',
                              }}
                            >
                              <Sparkles size={12} style={{ color: 'var(--db-primary)' }} />
                              Auto Compress PNG
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--db-text-muted)', lineHeight: '1.5' }}>
                            Rasio ideal Open Graph <strong>1.91 : 1</strong> (format JPG/PNG/WebP, maks 5MB). Server otomatis mengompresi gambar menjadi format PNG tajam dan cepat dimuat. Jika tidak diunggah, medsos otomatis menggunakan Poster Agen atau Logo Travel sebagai gambar pratinjau.
                          </p>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                borderRadius: 'var(--radius-md)',
                                backgroundColor: 'var(--db-primary-button)',
                                color: 'var(--db-card-bg)',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: uploadingOGImage ? 'not-allowed' : 'pointer',
                                opacity: uploadingOGImage ? 0.7 : 1,
                                transition: 'opacity 0.15s ease',
                              }}
                            >
                              <Upload size={15} />
                              <span>{uploadingOGImage ? 'Mengompresi & Mengunggah...' : ogImageURL ? 'Ganti Banner Kustom' : 'Pilih Gambar Banner (1200x630)'}</span>
                              <input
                                type="file"
                                accept="image/png, image/jpeg, image/webp"
                                style={{ display: 'none' }}
                                onChange={handleOGImageChange}
                                disabled={uploadingOGImage}
                              />
                            </label>

                            {ogImageURL && (
                              <button
                                type="button"
                                onClick={handleDeleteOGImage}
                                disabled={uploadingOGImage}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 14px',
                                  borderRadius: 'var(--radius-md)',
                                  backgroundColor: 'transparent',
                                  border: '1px solid var(--db-border)',
                                  color: 'var(--db-negative)',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={15} />
                                <span>Hapus Kustom</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>

                  {/* SIMULATOR INTERAKTIF: GOOGLE SERP & WHATSAPP SHARE */}
                  <Card
                    title="Live Preview Simulator: Tampilan di Google & WhatsApp"
                    subtitle="Pratinjau langsung bagaimana calon jamaah dan relasi melihat website travel Anda di halaman pencarian Google serta saat tautan dibagikan via obrolan WhatsApp."
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', alignItems: 'stretch' }}>
                      {/* SIMULASI GOOGLE SERP */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--db-border)',
                          backgroundColor: 'var(--db-chart-area-fill)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Search size={16} style={{ color: 'var(--db-primary)' }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                              Google Search (SERP Snippet)
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--db-text-muted)', fontWeight: 500 }}>
                            Hasil Organik
                          </span>
                        </div>

                        {/* SERP Card Box */}
                        <div
                          style={{
                            padding: '16px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--db-border)',
                            backgroundColor: 'var(--db-card-bg)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            flex: 1,
                            boxShadow: 'var(--shadow-sm)',
                          }}
                        >
                          {/* Breadcrumb row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {brandIconURL ? (
                              <img
                                src={getFullImageUrl(brandIconURL)}
                                alt="Favicon"
                                style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  backgroundColor: 'var(--db-primary)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                }}
                              >
                                {name ? name.slice(0, 1).toUpperCase() : 'U'}
                              </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                              <span style={{ fontSize: '13px', color: 'var(--db-text-primary)', fontWeight: 600 }}>
                                {name || 'KlikUmroh Travel'}
                              </span>
                              <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                                {`https://${(name || 'travel').toLowerCase().replace(/[^a-z0-9]/g, '')}.klikumroh.id › paket`}
                              </span>
                            </div>
                          </div>

                          {/* Clickable Blue Title */}
                          <a
                            href="#preview"
                            onClick={(e) => e.preventDefault()}
                            style={{
                              fontSize: '17px',
                              fontWeight: 500,
                              color: 'var(--db-primary)',
                              textDecoration: 'none',
                              lineHeight: '1.35',
                            }}
                          >
                            {metaTitle || `${name || 'KlikUmroh Tour'} — Paket Umroh Resmi ${city || 'Indonesia'} (PPIU ${ppiuNumber || 'Kemenag'})`}
                          </a>

                          {/* Rich snippet badges */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              flexWrap: 'wrap',
                              gap: '8px',
                              fontSize: '12px',
                              color: 'var(--db-text-secondary)',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Star size={12} style={{ color: 'var(--db-warning)', fill: 'var(--db-warning)' }} />
                              <strong>{trustRating || '4.9'}</strong> ({trustAlumniCount || '1.000+'})
                            </span>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <ShieldCheck size={12} style={{ color: 'var(--db-positive)' }} />
                              PPIU Resmi Kemenag
                            </span>
                            {city && (
                              <>
                                <span>•</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <MapPin size={12} style={{ color: 'var(--db-primary)' }} />
                                  {city}{province ? `, ${province}` : ''}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Meta description snippet */}
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: '13px',
                              lineHeight: '1.5',
                              color: 'var(--db-text-muted)',
                            }}
                          >
                            {metaDescription ||
                              (aboutSummary
                                ? (aboutSummary.length > 155 ? `${aboutSummary.slice(0, 155)}...` : aboutSummary)
                                : `Biro perjalanan umroh resmi terdaftar di Kemenag RI dengan layanan bintang dan jadwal pasti di ${city || 'Indonesia'}. Hubungi kami untuk katalog paket umroh terbaru.`)}
                          </p>
                        </div>
                      </div>

                      {/* SIMULASI WHATSAPP SHARE */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          padding: '16px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--db-border)',
                          backgroundColor: 'var(--db-chart-area-fill)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Share2 size={16} style={{ color: 'var(--db-positive)' }} />
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-primary)' }}>
                              WhatsApp Link Share (Chat Card)
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--db-text-muted)', fontWeight: 500 }}>
                            Pratinjau Pesan
                          </span>
                        </div>

                        {/* WhatsApp Message Card Box */}
                        <div
                          style={{
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--db-border)',
                            backgroundColor: 'var(--db-card-bg)',
                            overflow: 'hidden',
                            boxShadow: 'var(--shadow-sm)',
                            display: 'flex',
                            flexDirection: 'column',
                            flex: 1,
                          }}
                        >
                          {/* Banner image preview */}
                          <div
                            style={{
                              width: '100%',
                              aspectRatio: '1200 / 630',
                              backgroundColor: 'var(--db-bg-elevated)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              position: 'relative',
                            }}
                          >
                            {ogImageURL ? (
                              <img
                                src={getFullImageUrl(ogImageURL)}
                                alt="OG Banner"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : agentPosterURL ? (
                              <img
                                src={getFullImageUrl(agentPosterURL)}
                                alt="Agent Poster Fallback"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : brandLogoURL ? (
                              <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                <img
                                  src={getFullImageUrl(brandLogoURL)}
                                  alt="Logo Fallback"
                                  style={{ maxHeight: '70px', maxWidth: '80%', objectFit: 'contain' }}
                                />
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: '8px',
                                  color: 'var(--db-text-muted)',
                                }}
                              >
                                <ImageIcon size={32} />
                                <span style={{ fontSize: '12px' }}>Banner Pratinjau Tautan</span>
                              </div>
                            )}
                          </div>

                          {/* Card details body */}
                          <div
                            style={{
                              padding: '12px 14px',
                              backgroundColor: 'var(--db-bg-elevated)',
                              borderTop: '1px solid var(--db-border)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '4px',
                              flex: 1,
                            }}
                          >
                            <span
                              style={{
                                fontSize: '10px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: 'var(--db-text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {(name || 'travel').toLowerCase().replace(/[^a-z0-9]/g, '')}.klikumroh.id
                            </span>
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: 700,
                                color: 'var(--db-text-primary)',
                                lineHeight: '1.3',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {metaTitle || `${name || 'Travel Umroh'} — Paket Umroh Resmi ${city || 'Indonesia'}`}
                            </span>
                            <span
                              style={{
                                fontSize: '12px',
                                color: 'var(--db-text-secondary)',
                                lineHeight: '1.4',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {metaDescription ||
                                (aboutSummary
                                  ? (aboutSummary.length > 90 ? `${aboutSummary.slice(0, 90)}...` : aboutSummary)
                                  : `Pilihan paket umroh resmi dengan fasilitas bintang dan pembimbing terpercaya di ${city || 'Indonesia'}.`)}
                            </span>

                            {/* Simulated WhatsApp timestamp & ticks */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--db-text-muted)' }}>10:42</span>
                              <CheckCheck size={14} style={{ color: 'var(--db-primary)' }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 5: PENGATURAN SISTEM & KOMISI AGEN */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'agent' && (
                <form onSubmit={handleUnifiedAgentSubmit}>
                  {/* Bagian 1: Skema Pendaftaran & Syarat Kemitraan */}
                  <Card
                    title="Skema Pendaftaran & Syarat Kemitraan"
                    subtitle="Kelola skema pendaftaran agen kemitraan travel (gratis vs berbayar), syarat & ketentuan, serta batas pencairan komisi."
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      {agentSettingsError && (
                        <div className="db-alert db-alert--error" style={{ marginBottom: 0 }}>
                          <AlertCircle size={18} />
                          <span>{agentSettingsError}</span>
                        </div>
                      )}

                      {/* Mode Toggle */}
                      <div>
                        <label
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--db-text-primary)',
                            display: 'block',
                            marginBottom: '8px',
                          }}
                        >
                          Skema Pendaftaran Agen *
                        </label>
                        <div className="db-mode-toggle-group">
                          <button
                            type="button"
                            onClick={() => setAgentMode('gratis')}
                            style={{
                              padding: '12px 16px',
                              borderRadius: 'var(--radius-md)',
                              border: `2px solid ${agentMode === 'gratis' ? 'var(--db-primary-button)' : 'var(--db-border)'}`,
                              backgroundColor: agentMode === 'gratis' ? 'var(--db-chart-area-fill)' : 'transparent',
                              color: agentMode === 'gratis' ? 'var(--db-primary-button)' : 'var(--db-text-muted)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Mode Gratis (Tanpa Biaya)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAgentMode('berbayar')}
                            style={{
                              padding: '12px 16px',
                              borderRadius: 'var(--radius-md)',
                              border: `2px solid ${agentMode === 'berbayar' ? 'var(--db-primary-button)' : 'var(--db-border)'}`,
                              backgroundColor: agentMode === 'berbayar' ? 'var(--db-chart-area-fill)' : 'transparent',
                              color: agentMode === 'berbayar' ? 'var(--db-primary-button)' : 'var(--db-text-muted)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            Mode Berbayar (Wajib Transfer)
                          </button>
                        </div>
                        <span style={{ display: 'block', marginTop: '6px', fontSize: '13px', color: 'var(--db-text-muted)' }}>
                          {agentMode === 'gratis'
                            ? 'Calon agen langsung menunggu persetujuan admin setelah mendaftar tanpa instruksi pembayaran.'
                            : 'Calon agen diwajibkan melakukan transfer biaya registrasi dan mengunggah bukti pembayaran sebelum diverifikasi.'}
                        </span>
                      </div>

                      {/* Conditional Berbayar Fields */}
                      {agentMode === 'berbayar' && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            padding: '16px',
                            backgroundColor: 'var(--db-chart-area-fill)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--db-border)',
                          }}
                        >
                          <FormInput
                            label="Nominal Biaya Pendaftaran (Rp) *"
                            placeholder="Contoh: 150000"
                            type="number"
                            value={agentRegistrationFee}
                            onChange={(e) => setAgentRegistrationFee(e.target.value)}
                            required={agentMode === 'berbayar'}
                            hint="Nominal yang harus dibayarkan calon agen saat mendaftar kemitraan."
                          />

                          <div className="db-bank-fields-grid">
                            <FormInput
                              label="Nama Bank Tujuan *"
                              placeholder="Contoh: Bank Syariah Indonesia (BSI) / BCA"
                              value={agentBankName}
                              onChange={(e) => setAgentBankName(e.target.value)}
                              required={agentMode === 'berbayar'}
                            />
                            <FormInput
                              label="Nomor Rekening *"
                              placeholder="Contoh: 7123456789"
                              value={agentBankAccountNumber}
                              onChange={(e) => setAgentBankAccountNumber(e.target.value)}
                              required={agentMode === 'berbayar'}
                            />
                            <FormInput
                              label="Atas Nama Rekening *"
                              placeholder="Contoh: PT Klik Umroh Travel"
                              value={agentBankAccountHolder}
                              onChange={(e) => setAgentBankAccountHolder(e.target.value)}
                              required={agentMode === 'berbayar'}
                            />
                          </div>

                          <FormInput
                            label="Benefit & Fasilitas Agen (Opsional)"
                            type="textarea"
                            rows={3}
                            placeholder="Contoh: Mendapatkan bimbingan materi promosi, katalog flyer digital, dan komisi hingga Rp 2.000.000 per jamaah."
                            value={agentRegistrationBenefits}
                            onChange={(e) => setAgentRegistrationBenefits(e.target.value)}
                            hint="Poin manfaat yang didapatkan calon agen saat mendaftar mode berbayar."
                          />
                        </div>
                      )}

                      {/* Poster Promosi Agen (Rasio 1:1) */}
                      <div>
                        <label
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--db-text-primary)',
                            display: 'block',
                            marginBottom: '4px',
                          }}
                        >
                          Poster Promosi Agen (Rasio 1:1)
                        </label>
                        <p style={{ fontSize: '13px', color: 'var(--db-text-muted)', margin: '0 0 12px 0' }}>
                          Unggah poster promosi kemitraan rasio 1:1 (persegi, format JPG/PNG/WebP, maks 8MB) untuk ditampilkan di halaman pendaftaran agen.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                          {/* 1:1 Preview Box */}
                          <div
                            style={{
                              width: '150px',
                              height: '150px',
                              borderRadius: 'var(--radius-md)',
                              border: '1px dashed var(--db-border)',
                              backgroundColor: 'var(--db-chart-area-fill)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              position: 'relative',
                              flexShrink: 0,
                            }}
                          >
                            {agentPosterURL ? (
                              <img
                                key={agentPosterURL}
                                src={getFullImageUrl(agentPosterURL)}
                                alt="Poster Promosi Agen"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', color: 'var(--db-text-muted)', padding: '12px', textAlign: 'center' }}>
                                <ImageIcon size={30} />
                                <span style={{ fontSize: '11px', fontWeight: 500 }}>Rasio 1:1</span>
                              </div>
                            )}
                          </div>

                          {/* Upload Actions */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center', minHeight: '150px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <label
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '8px 16px',
                                  borderRadius: 'var(--radius-md)',
                                  backgroundColor: 'var(--db-primary-button)',
                                  color: 'var(--db-card-bg)',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  cursor: uploadingPoster ? 'not-allowed' : 'pointer',
                                  opacity: uploadingPoster ? 0.7 : 1,
                                }}
                              >
                                <Upload size={16} />
                                <span>{uploadingPoster ? 'Mengunggah...' : agentPosterURL ? 'Ganti Poster (1:1)' : 'Pilih Poster (1:1)'}</span>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={handlePosterChange}
                                  disabled={uploadingPoster}
                                  style={{ display: 'none' }}
                                />
                              </label>

                              {agentPosterURL && (
                                <button
                                  type="button"
                                  onClick={handleDeletePoster}
                                  disabled={uploadingPoster}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'transparent',
                                    border: '1px solid var(--db-border)',
                                    color: 'var(--db-negative)',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Trash2 size={16} />
                                  <span>Hapus</span>
                                </button>
                              )}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--db-text-muted)' }}>
                              Foto otomatis dipotong persegi 1:1 untuk tampilan optimal di web pendaftaran agen.
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Syarat & Ketentuan Agen */}
                      <FormInput
                        label="Syarat & Ketentuan Agen (Opsional)"
                        type="textarea"
                        rows={4}
                        placeholder="Tuliskan syarat dan ketentuan kemitraan agen di travel Anda..."
                        value={agentTermsConditions}
                        onChange={(e) => setAgentTermsConditions(e.target.value)}
                        tooltip="Jika diisi, calon agen wajib mencentang kotak persetujuan S&K sebelum menyelesaikan pendaftaran."
                      />

                      {/* Minimum Saldo Pencairan */}
                      <FormInput
                        label="Minimum Saldo Pencairan Komisi (Rp, Opsional)"
                        type="number"
                        placeholder="Contoh: 500000"
                        value={minimumPayoutAmount}
                        onChange={(e) => setMinimumPayoutAmount(e.target.value)}
                        tooltip="Batas minimal saldo komisi yang dapat diajukan pencairannya oleh agen ke rekening pribadi."
                      />
                    </div>
                  </Card>

                  {/* Bagian 2: SKEMA KOMISI OVERRIDE (1-TIER) */}
                  <div style={{ marginTop: '24px' }}>
                    <Card
                      title="Pengaturan Skema Komisi Override"
                      subtitle="Tentukan apakah master agent berhak menerima bonus komisi override berjenjang satu tier dari penjualan sub-agent mereka."
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '16px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--db-chart-area-fill)',
                            border: '1px solid var(--db-border)',
                          }}
                        >
                          <input
                            type="checkbox"
                            id="commission_override"
                            checked={commissionOverrideEnabled}
                            onChange={(e) => setCommissionOverrideEnabled(e.target.checked)}
                            style={{
                              width: '20px',
                              height: '20px',
                              marginTop: '2px',
                              cursor: 'pointer',
                            }}
                          />
                          <div>
                            <label
                              htmlFor="commission_override"
                              style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: 'var(--db-text-primary)',
                                cursor: 'pointer',
                                display: 'block',
                              }}
                            >
                              Aktifkan Skema Komisi Override (1-Tier)
                            </label>
                            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--db-text-muted)', lineHeight: '1.5' }}>
                              Jika diaktifkan, saat sub-agent berhasil closing jamaah, master agent (parent) akan otomatis mendapatkan bonus komisi sebesar persentase yang ditentukan di bawah ini dari nilai komisi sub-agent.
                            </p>
                          </div>
                        </div>

                        {commissionOverrideEnabled && (
                          <div style={{ paddingLeft: '4px' }}>
                            <FormInput
                              label="Persentase Override (%) *"
                              placeholder="Contoh: 10"
                              type="number"
                              value={commissionOverridePercentage}
                              onChange={(e) => setCommissionOverridePercentage(e.target.value)}
                              error={commissionError || undefined}
                              tooltip="Nilai antara 0 sampai 100%. Contoh: 10 berarti master agent mendapat 10% dari komisi sub-agent."
                              required={commissionOverrideEnabled}
                            />
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>

                  {/* Bagian 3: Target Bulanan Agen */}
                  <div style={{ marginTop: '24px' }}>
                    <Card
                      title="Target Bulanan Agen"
                      subtitle="Target ini akan tampil sebagai progress bar di Beranda Agen mitra Anda untuk memacu pencapaian closing jamaah."
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {targetSettingsError && (
                          <div className="db-alert db-alert--error" style={{ marginBottom: 0 }}>
                            <AlertCircle size={18} />
                            <span>{targetSettingsError}</span>
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                          <FormInput
                            label="Tanggal Mulai Periode"
                            type="date"
                            value={targetPeriodStart}
                            onChange={(e) => setTargetPeriodStart(e.target.value)}
                            tooltip="Awal periode perhitungan target."
                          />
                          <FormInput
                            label="Tanggal Selesai Periode"
                            type="date"
                            value={targetPeriodEnd}
                            onChange={(e) => setTargetPeriodEnd(e.target.value)}
                            tooltip="Akhir periode perhitungan target."
                          />
                          <FormInput
                            label="Target Jamaah"
                            type="number"
                            placeholder="Contoh: 15"
                            value={targetJamaah}
                            onChange={(e) => setTargetJamaah(e.target.value)}
                            tooltip="Jumlah target closing jamaah dalam periode."
                          />
                        </div>
                      </div>
                    </Card>
                  </div>

                  {/* Tombol Simpan Terpadu */}
                  <div className="db-form-actions" style={{ marginTop: '24px' }}>
                    <Button variant="primary" type="submit" disabled={submitting}>
                      <Save size={16} />
                      <span>{submitting ? 'Menyimpan Pengaturan...' : 'Simpan Semua Pengaturan Agen'}</span>
                    </Button>
                  </div>
                </form>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 6: DOMAIN & CUSTOM DOMAIN */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'domain' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Subdomain Default */}
                  <Card
                    title="Subdomain Default (Bawaan Sistem)"
                    subtitle="Alamat website default travel Anda di KlikUmroh.id. Selalu aktif dan berfungsi sebagai fallback permanen jika custom domain mengalami kendala DNS."
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px',
                          backgroundColor: 'var(--db-chart-area-fill)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--db-border)',
                          flexWrap: 'wrap',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <Globe size={22} style={{ color: 'var(--db-positive)' }} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--db-text-primary)' }}>
                              {defaultSubdomain ? defaultSubdomain.hostname : `${currentUser?.tenant_name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'travel'}.klikumroh.id`}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--db-text-muted)', marginTop: '2px' }}>
                              Subdomain default bawaan (Read-only, tidak dapat dihapus)
                            </div>
                          </div>
                        </div>
                        <Badge variant="positive">Aktif</Badge>
                      </div>
                    </div>
                  </Card>

                  {/* Form Tambah Custom Domain */}
                  <Card
                    title="Hubungkan Custom Domain Sendiri"
                    subtitle="Gunakan nama domain resmi milik biro travel Anda (misal: umroh.namatravel.com atau namatravel.id) untuk branding profesional."
                  >
                    <form onSubmit={handleAddCustomDomain}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <FormInput
                          label="Nama Custom Domain *"
                          placeholder="Contoh: umroh.albarakah.com atau albarakahtravel.id"
                          value={customDomainInput}
                          onChange={(e) => {
                            setCustomDomainInput(e.target.value);
                            setDomainError(null);
                          }}
                          error={domainError || undefined}
                          hint="Masukkan nama domain tanpa 'http://', 'https://', port (:), atau tanda slash (/)"
                          required
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                          <Button variant="primary" type="submit" disabled={addingDomain || !customDomainInput.trim()}>
                            <Plus size={16} />
                            <span>{addingDomain ? 'Mendaftarkan...' : 'Tambah Custom Domain'}</span>
                          </Button>
                        </div>
                      </div>
                    </form>
                  </Card>

                  {/* Daftar Custom Domain */}
                  {customDomains.length > 0 && (
                    <Card
                      title="Daftar Custom Domain Terdaftar"
                      subtitle="Kelola konfigurasi CNAME DNS dan verifikasi status domain travel Anda."
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {customDomains.map((dom) => (
                          <div
                            key={dom.id}
                            style={{
                              border: '1px solid var(--db-border)',
                              borderRadius: 'var(--radius-md)',
                              padding: '20px',
                              backgroundColor: 'var(--db-card-bg)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '16px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Link2 size={18} style={{ color: 'var(--db-text-muted)' }} />
                                <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--db-text-primary)' }}>
                                  {dom.hostname}
                                </span>
                              </div>

                              <div>
                                {dom.status === 'active' && <Badge variant="positive">Aktif</Badge>}
                                {dom.status === 'pending' && <Badge variant="neutral">Menunggu Verifikasi</Badge>}
                                {dom.status === 'failed' && <Badge variant="negative">Gagal</Badge>}
                              </div>
                            </div>

                            {/* Failure reason explanation */}
                            {dom.status === 'failed' && dom.verification_failure_reason && (
                              <div
                                style={{
                                  padding: '12px 14px',
                                  borderRadius: 'var(--radius-sm)',
                                  backgroundColor: 'var(--db-chart-area-fill)',
                                  borderLeft: '4px solid var(--db-negative)',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '10px',
                                }}
                              >
                                <AlertCircle size={16} style={{ color: 'var(--db-negative)', marginTop: '2px', flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-negative)', marginBottom: '2px' }}>
                                    Kendala Verifikasi DNS
                                  </div>
                                  <div style={{ fontSize: '13px', color: 'var(--db-text-primary)' }}>
                                    {dom.verification_failure_reason}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* CNAME Instruction Box */}
                            <div
                              style={{
                                backgroundColor: 'var(--db-chart-area-fill)',
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--db-border)',
                              }}
                            >
                              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--db-text-muted)', marginBottom: '8px' }}>
                                PANDUAN PENGATURAN DNS (CLOUDFLARE / REGISTRAR DOMAIN):
                              </div>
                              <div style={{ fontSize: '13px', color: 'var(--db-text-primary)', marginBottom: '10px' }}>
                                Buat <strong>CNAME Record</strong> di pengaturan DNS domain Anda yang mengarah ke target di bawah ini:
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '10px 14px',
                                  backgroundColor: 'var(--db-card-bg)',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--db-border)',
                                  fontFamily: 'monospace',
                                  fontSize: '13px',
                                  gap: '12px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <div>
                                  <span style={{ color: 'var(--db-text-muted)' }}>{dom.hostname}</span>
                                  <ArrowRight size={13} style={{ margin: '0 8px', color: 'var(--db-text-muted)', display: 'inline-block', verticalAlign: 'middle' }} />
                                  <strong style={{ color: 'var(--db-text-primary)' }}>cname.klikumroh.id</strong>
                                </div>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  onClick={handleCopyCNAME}
                                  style={{ padding: '6px 12px', fontSize: '12px', height: 'auto' }}
                                >
                                  {copiedTarget ? <Check size={14} /> : <Copy size={14} />}
                                  <span>{copiedTarget ? 'Tersalin' : 'Salin Target CNAME'}</span>
                                </Button>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', paddingTop: '4px' }}>
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => handleVerifyDomain(dom.id)}
                                disabled={verifyingDomainId === dom.id}
                              >
                                <RefreshCw size={15} className={verifyingDomainId === dom.id ? 'db-spin' : ''} />
                                <span>{verifyingDomainId === dom.id ? 'Memeriksa DNS...' : 'Verifikasi Sekarang'}</span>
                              </Button>

                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setDomainToDelete(dom)}
                                disabled={deletingDomainId === dom.id}
                                style={{ color: 'var(--db-negative)' }}
                              >
                                <Trash2 size={15} />
                                <span>Hapus</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Confirmation Modal */}
                  {domainToDelete && (
                    <Modal
                      isOpen={!!domainToDelete}
                      onClose={() => setDomainToDelete(null)}
                      title="Konfirmasi Hapus Custom Domain"
                      footer={
                        <>
                          <Button variant="secondary" onClick={() => setDomainToDelete(null)}>
                            Batal
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => domainToDelete && handleDeleteDomain(domainToDelete.id)}
                            disabled={deletingDomainId !== null}
                            style={{ backgroundColor: 'var(--db-negative)' }}
                          >
                            {deletingDomainId !== null ? 'Menghapus...' : 'Ya, Hapus'}
                          </Button>
                        </>
                      }
                    >
                      <p style={{ margin: 0, color: 'var(--db-text-primary)' }}>
                        Apakah Anda yakin ingin menghapus custom domain <strong>{domainToDelete.hostname}</strong>?
                        Setelah dihapus, akses ke domain ini tidak lagi diarahkan ke situs travel Anda.
                      </p>
                    </Modal>
                  )}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 7: TIM / MANAJEMEN PENGGUNA */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'team' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {teamSuccess && (
                    <div className="db-alert db-alert--success">
                      <CheckCircle2 size={18} />
                      <span>{teamSuccess}</span>
                    </div>
                  )}

                  {teamError && (
                    <div className="db-alert db-alert--error">
                      <AlertCircle size={18} />
                      <span>{teamError}</span>
                    </div>
                  )}

                  {/* Form Tambah Anggota Baru */}
                  <Card
                    title="Tambah Anggota Tim"
                    subtitle="Undang staf atau pengelola travel baru untuk mengelola operasional dashboard admin."
                  >
                    <form onSubmit={handleAddTeamMember}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <FormInput
                          label="Nama Lengkap *"
                          placeholder="Contoh: Ahmad Fadilah"
                          value={newMemberName}
                          onChange={(e) => {
                            setNewMemberName(e.target.value);
                            setTeamError(null);
                          }}
                          required
                        />

                        <FormInput
                          label="Alamat Email *"
                          type="email"
                          placeholder="Contoh: ahmad@travel.com"
                          value={newMemberEmail}
                          onChange={(e) => {
                            setNewMemberEmail(e.target.value);
                            setTeamError(null);
                          }}
                          required
                        />

                        <FormInput
                          label="Password *"
                          type="password"
                          placeholder="Minimal 8 karakter"
                          value={newMemberPassword}
                          onChange={(e) => {
                            setNewMemberPassword(e.target.value);
                            setTeamError(null);
                          }}
                          hint="Minimal 8 karakter untuk keamanan akses akun tim."
                          required
                        />

                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                          <Button variant="primary" type="submit" disabled={addingMember}>
                            <Plus size={16} />
                            <span>{addingMember ? 'Menambahkan...' : 'Tambah Anggota'}</span>
                          </Button>
                        </div>
                      </div>
                    </form>
                  </Card>

                  {/* List Anggota Tim */}
                  <Card
                    title="Daftar Anggota Tim"
                    subtitle="Kelola status akses dan keanggotaan staf admin travel Anda."
                  >
                    {loadingTeam ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--db-text-muted)' }}>
                        Memuat data tim...
                      </div>
                    ) : teamMembers.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--db-text-muted)' }}>
                        Belum ada anggota tim lain terdaftar.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {teamMembers.map((member) => {
                          const isSelf = member.id === currentUser?.id || member.email === currentUser?.email;
                          return (
                            <div
                              key={member.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '16px',
                                backgroundColor: 'var(--db-card-bg)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--db-border)',
                                flexWrap: 'wrap',
                                gap: '12px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div
                                  style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--db-bg-secondary)',
                                    color: 'var(--db-text-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                  }}
                                >
                                  {member.name ? member.name.slice(0, 2).toUpperCase() : 'ST'}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--db-text-primary)' }}>
                                    {member.name}
                                  </div>
                                  <div style={{ fontSize: '13px', color: 'var(--db-text-muted)', marginTop: '2px' }}>
                                    {member.email} • Bergabung {new Date(member.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                </div>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Badge variant={member.status === 'active' ? 'positive' : 'neutral'}>
                                  {member.status === 'active' ? 'Aktif' : 'Nonaktif'}
                                </Badge>

                                {isSelf ? (
                                  <span style={{ fontSize: '12px', color: 'var(--db-text-muted)', fontStyle: 'italic' }}>
                                    Akun Anda saat ini
                                  </span>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => handleToggleTeamMemberStatus(member)}
                                    disabled={togglingMemberId === member.id}
                                  >
                                    {togglingMemberId === member.id
                                      ? 'Memproses...'
                                      : member.status === 'active'
                                      ? 'Nonaktifkan'
                                      : 'Aktifkan'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* TAB 8: LANGGANAN & TAGIHAN */}
              {/* ------------------------------------------------------------- */}
              {activeTab === 'subscription' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {subInfo?.is_suspended ? (
                    <div
                      className="db-alert db-alert--error"
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}
                    >
                      <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>
                          Layanan Website Sedang Ditangguhkan
                        </strong>
                        <span style={{ fontSize: '13px' }}>
                          Masa aktif langganan Anda telah berakhir dan melewati batas toleransi masa tenggang 7 hari.
                          Website publik Anda saat ini menampilkan halaman penangguhan sementara. Silakan selesaikan
                          pembayaran tagihan perpanjangan di bawah ini untuk mengaktifkan kembali layanan.
                        </span>
                      </div>
                    </div>
                  ) : subInfo?.is_subscription_expired ? (
                    <div
                      className="db-alert db-alert--warning"
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}
                    >
                      <Clock size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <strong style={{ display: 'block', fontSize: '14px', marginBottom: '2px' }}>
                          Masa Aktif Berakhir — Dalam Masa Tenggang ({subInfo.grace_period_days_remaining ?? 0} Hari Tersisa)
                        </strong>
                        <span style={{ fontSize: '13px' }}>
                          Website publik Anda masih dapat diakses hingga masa tenggang berakhir. Segera selesaikan tagihan
                          perpanjangan paket agar calon jamaah tetap dapat mendaftar dan operasional travel tidak terganggu.
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* 1. TOP ROW: PAKET AKTIF (Dark Pine Card) + JADWAL PERPANJANGAN */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) 350px',
                      gap: '20px',
                      alignItems: 'stretch',
                    }}
                  >
                    {/* KARTU KIRI: PAKET AKTIF (Dark Pine Hero Card) */}
                    <div
                      style={{
                        backgroundColor: 'var(--db-sidebar-bg)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px 28px',
                        color: '#FFFFFF',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: 'var(--shadow-md)',
                      }}
                    >
                      <div>
                        {/* Upper row: Label & Status pill */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              letterSpacing: '1px',
                              textTransform: 'uppercase',
                              color: 'rgba(255, 255, 255, 0.65)',
                            }}
                          >
                            PAKET AKTIF
                          </span>

                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              backgroundColor: 'rgba(52, 211, 153, 0.15)',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                              color: '#A7F3D0',
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: subInfo?.status === 'pending'
                                  ? 'var(--db-status-contacted)'
                                  : subInfo?.is_suspended
                                  ? 'var(--db-negative)'
                                  : subInfo?.is_subscription_expired
                                  ? 'var(--db-rating-star)'
                                  : '#34D399',
                              }}
                            />
                            <span>
                              {subInfo?.status === 'pending'
                                ? 'Menunggu Pembayaran'
                                : subInfo?.is_suspended
                                ? 'Ditangguhkan'
                                : subInfo?.is_subscription_expired
                                ? 'Masa Tenggang'
                                : subInfo?.status === 'trial'
                                ? 'Masa Uji Coba'
                                : 'Aktif'}
                            </span>
                          </div>
                        </div>

                        {/* Nama Paket */}
                        <h2
                          style={{
                            fontFamily: 'var(--db-font-heading)',
                            fontSize: '22px',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            margin: '4px 0 20px 0',
                          }}
                        >
                          {subInfo?.current_plan_name || 'KlikUmroh Pro · 12 Bulan'}
                        </h2>

                        {/* 3 Metrik Kunci */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '16px',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>
                              Aktif hingga
                            </div>
                            <div
                              style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: '#FFFFFF',
                                marginTop: '4px',
                              }}
                            >
                              {subInfo?.status === 'pending'
                                ? 'Menunggu Aktivasi'
                                : subInfo?.subscription_expires_at
                                ? new Date(subInfo.subscription_expires_at).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                  })
                                : '-'}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>
                              Sisa masa aktif
                            </div>
                            <div
                              style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: '#FFFFFF',
                                marginTop: '4px',
                              }}
                            >
                              {subInfo?.status === 'pending'
                                ? 'Menunggu pembayaran'
                                : subInfo?.is_suspended
                                ? '0 hari'
                                : subInfo?.is_subscription_expired
                                ? `${subInfo.grace_period_days_remaining ?? 0} hari (tenggang)`
                                : `${subInfo?.days_remaining ?? 0} hari`}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)' }}>
                              Harga efektif / bulan
                            </div>
                            <div
                              style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: '#FFFFFF',
                                marginTop: '4px',
                              }}
                            >
                              Rp {effectiveMonthlyPrice.toLocaleString('id-ID')} / bln
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Progress bar periode berjalan */}
                      <div
                        style={{
                          borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                          paddingTop: '14px',
                          marginTop: '20px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12px',
                          }}
                        >
                          <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Periode berjalan</span>
                          <span style={{ fontWeight: 600, color: '#FFFFFF' }}>
                            {isSubPending
                              ? 'Menunggu Pembayaran'
                              : isSubExpired
                              ? 'Masa Aktif Berakhir'
                              : `Bulan ke-${currentMonthIndex} dari ${activePeriodMonths} bulan`}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            height: '7px',
                            marginTop: '8px',
                          }}
                        >
                          {Array.from({ length: activePeriodMonths }).map((_, idx) => {
                            const monthNum = idx + 1;
                            const isLit = !isSubPending && monthNum <= currentMonthIndex;

                            return (
                              <div
                                key={idx}
                                title={`Bulan ke-${monthNum}`}
                                style={{
                                  flex: 1,
                                  height: '100%',
                                  backgroundColor: isLit ? '#2DD4BF' : 'rgba(255, 255, 255, 0.15)',
                                  borderRadius: 'var(--radius-full)',
                                  transition: 'background-color 0.3s ease',
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* KARTU KANAN: JADWAL PERPANJANGAN */}
                    <div
                      style={{
                        backgroundColor: 'var(--db-card-bg)',
                        border: '1px solid var(--db-border)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--db-surface)',
                            color: 'var(--db-sidebar-active-highlight)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '16px',
                          }}
                        >
                          <CalendarClock size={22} />
                        </div>

                        <h3
                          style={{
                            fontFamily: 'var(--db-font-heading)',
                            fontSize: '16px',
                            fontWeight: 700,
                            color: 'var(--db-text-primary)',
                            marginBottom: '8px',
                          }}
                        >
                          Jadwal perpanjangan
                        </h3>

                        <p
                          style={{
                            margin: 0,
                            fontSize: '13px',
                            color: 'var(--db-text-muted)',
                            lineHeight: 1.6,
                          }}
                        >
                          {subInfo?.is_suspended ? (
                            'Layanan website sedang ditangguhkan karena masa aktif dan masa tenggang telah berakhir. Segera lakukan pembayaran tagihan perpanjangan di bawah untuk mengaktifkan kembali situs travel Anda.'
                          ) : subInfo?.is_subscription_expired ? (
                            `Masa aktif langganan Anda telah berakhir. Saat ini berada dalam toleransi masa tenggang (${subInfo.grace_period_days_remaining ?? 0} hari tersisa). Selesaikan pembayaran agar website tetap dapat diakses calon jamaah.`
                          ) : (
                            <>
                              Tagihan otomatis berikutnya akan diterbitkan pada{' '}
                              <strong>
                                {subInfo?.subscription_expires_at
                                  ? new Date(
                                      new Date(subInfo.subscription_expires_at).getTime() - 30 * 24 * 60 * 60 * 1000
                                    ).toLocaleDateString('id-ID', {
                                      day: 'numeric',
                                      month: 'long',
                                      year: 'numeric',
                                    })
                                  : 'H-30'}
                              </strong>{' '}
                              (H-30 sebelum masa aktif berakhir).
                            </>
                          )}
                        </p>
                      </div>

                      <div style={{ marginTop: '20px' }}>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            if (subInfo?.pending_verification) {
                              navigate(`/settings/subscription/payment/${subInfo.pending_verification.id}`);
                            } else {
                              navigate('/settings/subscription/checkout');
                            }
                          }}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            fontSize: '13px',
                          }}
                        >
                          <span>
                            {subInfo?.pending_verification
                              ? 'Lihat Instruksi Pembayaran'
                              : subInfo?.is_subscription_expired || subInfo?.is_suspended
                              ? 'Selesaikan Tagihan Sekarang'
                              : 'Perpanjang lebih awal'}
                          </span>
                          <ArrowRight size={15} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* ACTIVE PENDING INVOICE BANNER (IF ANY) */}
                  {subInfo?.pending_verification && (
                    <div
                      style={{
                        backgroundColor: 'var(--db-surface)',
                        border: '1px solid var(--db-sidebar-active-highlight)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '20px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '16px',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'var(--db-card-bg)',
                            border: '1px solid var(--db-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--db-sidebar-active-highlight)',
                            flexShrink: 0,
                          }}
                        >
                          <FileText size={22} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '15px', color: 'var(--db-text-primary)' }}>
                              Tagihan #{subInfo.pending_verification.id}
                            </strong>
                            <Badge variant="neutral">
                              {subInfo.pending_verification.proof_url ? 'Sedang Diverifikasi' : 'Menunggu Pembayaran'}
                            </Badge>
                          </div>
                          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--db-text-muted)' }}>
                            Paket: <strong>{subInfo.pending_verification.plan_name || `Paket #${subInfo.pending_verification.plan_id}`}</strong> · Total:{' '}
                            <strong style={{ color: 'var(--db-sidebar-active-highlight)' }}>
                              {new Intl.NumberFormat('id-ID', {
                                style: 'currency',
                                currency: 'IDR',
                                minimumFractionDigits: 0,
                              }).format(subInfo.pending_verification.final_amount)}
                            </strong>
                            {subInfo.pending_verification.proof_url
                              ? ' · Bukti diterima, dalam antrean verifikasi mutasi bank'
                              : ' · Menunggu transfer tepat hingga 3 digit terakhir'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Tombol Ganti Paket — hanya saat bukti belum diunggah */}
                        {!subInfo.pending_verification.proof_url && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => navigate('/settings/subscription/checkout')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                          >
                            <span>Ganti Paket</span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => navigate(`/settings/subscription/payment/${subInfo.pending_verification!.id}`)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                          <span>
                            {subInfo.pending_verification.proof_url
                              ? 'Lihat Status Verifikasi'
                              : 'Lihat Instruksi Pembayaran'}
                          </span>
                          <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* 2. RIWAYAT TAGIHAN */}
                  <div
                    style={{
                      backgroundColor: 'var(--db-card-bg)',
                      border: '1px solid var(--db-border)',
                      borderRadius: 'var(--radius-lg)',
                      padding: '24px 28px',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    {/* Header Riwayat Tagihan */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                        marginBottom: '20px',
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            fontFamily: 'var(--db-font-heading)',
                            fontSize: '18px',
                            fontWeight: 700,
                            color: 'var(--db-text-primary)',
                            margin: 0,
                          }}
                        >
                          Riwayat tagihan
                        </h3>
                        <p
                          style={{
                            margin: '4px 0 0 0',
                            fontSize: '13px',
                            color: 'var(--db-text-muted)',
                          }}
                        >
                          Daftar invoice dan status verifikasi pembayaran langganan
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleExportBillingCSV}
                        disabled={!subInfo?.payment_verifications || subInfo.payment_verifications.length === 0}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                      >
                        <Download size={15} />
                        <span>Unduh</span>
                      </Button>
                    </div>

                    {loadingSub ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '16px 0',
                          color: 'var(--db-text-muted)',
                        }}
                      >
                        <RefreshCw size={16} className="db-spin" />
                        <span>Memuat riwayat tagihan...</span>
                      </div>
                    ) : subInfo?.payment_verifications && subInfo.payment_verifications.length > 0 ? (
                      <div>
                        <div style={{ overflowX: 'auto' }}>
                          <table
                            style={{
                              width: '100%',
                              borderCollapse: 'collapse',
                              textAlign: 'left',
                              fontSize: '13px',
                            }}
                          >
                            <thead>
                              <tr
                                style={{
                                  borderBottom: '1px solid var(--db-border)',
                                  color: 'var(--db-text-muted)',
                                }}
                              >
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Invoice
                                </th>
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Tanggal
                                </th>
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Paket
                                </th>
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Total Bayar
                                </th>
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Bukti Bayar
                                </th>
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Status
                                </th>
                                <th style={{ padding: '12px 14px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  Keterangan
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {subInfo.payment_verifications.map((item) => (
                                <tr
                                  key={item.id}
                                  style={{
                                    borderBottom: '1px solid var(--db-border)',
                                  }}
                                >
                                  <td style={{ padding: '14px', fontWeight: 600 }}>
                                    <Link
                                      to={`/settings/subscription/payment/${item.id}`}
                                      style={{
                                        color: 'var(--db-sidebar-active-highlight)',
                                        textDecoration: 'none',
                                        fontWeight: 600,
                                      }}
                                    >
                                      #INV-{item.id}
                                    </Link>
                                  </td>
                                  <td style={{ padding: '14px' }}>
                                    {new Date(item.created_at).toLocaleDateString('id-ID', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })}
                                  </td>
                                  <td style={{ padding: '14px', fontWeight: 500 }}>
                                    {item.plan_name || `Paket #${item.plan_id}`}
                                  </td>
                                  <td style={{ padding: '14px', fontWeight: 600 }}>
                                    {new Intl.NumberFormat('id-ID', {
                                      style: 'currency',
                                      currency: 'IDR',
                                      minimumFractionDigits: 0,
                                    }).format(item.final_amount)}
                                  </td>
                                  <td style={{ padding: '14px' }}>
                                    {item.proof_url ? (
                                      <button
                                        type="button"
                                        onClick={() => setPreviewProofURL(`${API_BASE}${item.proof_url}`)}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          padding: 0,
                                          color: 'var(--db-sidebar-active-highlight)',
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          textDecoration: 'underline',
                                          fontSize: '13px',
                                          fontWeight: 500,
                                        }}
                                      >
                                        <span>Lihat Bukti</span>
                                      </button>
                                    ) : (
                                      <span style={{ color: 'var(--db-text-muted)' }}>-</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '14px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                      {item.status === 'pending' ? (
                                        <>
                                          <Badge variant="neutral">
                                            {item.proof_url ? 'Sedang Diverifikasi' : 'Menunggu Pembayaran'}
                                          </Badge>
                                          <Link
                                            to={`/settings/subscription/payment/${item.id}`}
                                            style={{
                                              fontSize: '11px',
                                              color: 'var(--db-sidebar-active-highlight)',
                                              textDecoration: 'underline',
                                              fontWeight: 500,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '3px',
                                            }}
                                          >
                                            <span>{item.proof_url ? 'Rincian & Bukti' : 'Bayar Sekarang'}</span>
                                            <ArrowRight size={11} />
                                          </Link>
                                        </>
                                      ) : item.status === 'approved' ? (
                                        <Badge variant="positive">Lunas</Badge>
                                      ) : (
                                        <>
                                          <Badge variant="negative">Perlu Perbaikan</Badge>
                                          <Link
                                            to={`/settings/subscription/payment/${item.id}`}
                                            style={{
                                              fontSize: '11px',
                                              color: 'var(--db-negative)',
                                              textDecoration: 'underline',
                                              fontWeight: 500,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '3px',
                                            }}
                                          >
                                            <span>Unggah Ulang</span>
                                            <ArrowRight size={11} />
                                          </Link>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: '14px', color: 'var(--db-text-muted)', fontSize: '12px' }}>
                                    {item.status === 'rejected' ? (
                                      <span style={{ color: 'var(--db-negative)' }}>
                                        {item.rejection_reason || 'Bukti transfer tidak sesuai. Silakan unggah bukti baru.'}
                                      </span>
                                    ) : item.status === 'approved' ? (
                                      'Pembayaran lunas & lisensi aktif'
                                    ) : item.proof_url ? (
                                      'Bukti diterima, antrean verifikasi mutasi bank'
                                    ) : (
                                      'Menunggu transfer tepat hingga 3 digit terakhir'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Table Footer */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingTop: '16px',
                            fontSize: '12px',
                            color: 'var(--db-text-muted)',
                          }}
                        >
                          <span>Menampilkan {subInfo.payment_verifications.length} transaksi</span>
                          <span>Halaman 1 dari 1</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--db-text-muted)', fontSize: '13px', padding: '12px 0' }}>
                        Belum ada riwayat transaksi pembayaran langganan.
                      </div>
                    )}
                  </div>

                  {/* Modal Preview Bukti Transfer */}
                  <Modal
                    isOpen={Boolean(previewProofURL)}
                    onClose={() => setPreviewProofURL(null)}
                    title="Bukti Transfer Perpanjangan"
                  >
                    <div style={{ textAlign: 'center' }}>
                      {previewProofURL && (
                        <img
                          src={previewProofURL}
                          alt="Bukti Transfer"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '65vh',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--db-border)',
                            objectFit: 'contain',
                          }}
                        />
                      )}
                      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" onClick={() => setPreviewProofURL(null)}>
                          Tutup
                        </Button>
                      </div>
                    </div>
                  </Modal>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
