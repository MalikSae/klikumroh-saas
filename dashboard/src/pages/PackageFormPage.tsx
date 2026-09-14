import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Save,
  ArrowLeft,
  AlertCircle,
  Trash2,
  Image as ImageIcon,
  Plus,
  Star,
  Info,
  BadgeDollarSign,
  ListChecks,
  Images,
  Send,
  FilePenLine,
  Package,
  AlignLeft,
  Route,
  Plane,
  Building2,
  CircleCheck,
  CircleX
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  getStandardMenuItems,
} from '../components';
import {
  type PackageItem,
  fetchPackageById,
  createPackage,
  updatePackage,
  getStoredUser,
  uploadPackagePhoto,
  deletePackagePhoto,
} from '../services/api';

import './PackageFormPage.css';

export const PackageFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState<boolean>(isEditing);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  
  const [editingPackage, setEditingPackage] = useState<PackageItem | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  
  interface HotelEntry {
    city: string;
    name: string;
    stars: number;
  }

  const [hotels, setHotels] = useState<HotelEntry[]>([
    { city: 'Makkah', name: '', stars: 5 },
    { city: 'Madinah', name: '', stars: 5 },
  ]);
  const [airline, setAirline] = useState<string>('');
  const [flightRoute, setFlightRoute] = useState<string>('');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    commission_amount: '',
    departure_date: '',
    quota: '',
    status: 'draft' as 'draft' | 'published' | 'archived',
    itinerary: '',
    facilities_included: '',
    facilities_excluded: '',
    terms_conditions: '',
  });

  const currentUser = getStoredUser();



  useEffect(() => {
    if (isEditing && id) {
      loadPackage(parseInt(id, 10));
    }
  }, [id, isEditing]);

  const loadPackage = async (packageId: number) => {
    try {
      setLoading(true);
      setFormError(null);
      const pkg = await fetchPackageById(packageId);
      setEditingPackage(pkg);
      setFormData({
        name: pkg.name,
        description: pkg.description || '',
        price: pkg.price !== null && pkg.price !== undefined ? String(pkg.price) : '',
        commission_amount: pkg.commission_amount !== null && pkg.commission_amount !== undefined ? String(pkg.commission_amount) : '',
        departure_date: pkg.departure_date ? pkg.departure_date.slice(0, 10) : '',
        quota: pkg.quota !== null && pkg.quota !== undefined ? String(pkg.quota) : '',
        status: pkg.status,
        itinerary: pkg.itinerary || '',
        facilities_included: pkg.facilities_included || '',
        facilities_excluded: pkg.facilities_excluded || '',
        terms_conditions: pkg.terms_conditions || '',
      });

      if (pkg.hotel_info) {
        try {
          const parsed = JSON.parse(pkg.hotel_info);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHotels(parsed.map((item: any) => ({
              city: item.city || '',
              name: item.name || '',
              stars: typeof item.stars === 'number' && item.stars >= 1 && item.stars <= 5 ? item.stars : 5,
            })));
          } else {
            throw new Error('Not array');
          }
        } catch {
          const lines = pkg.hotel_info.split('\n').map((l: string) => l.trim()).filter(Boolean);
          const parsedHotels: HotelEntry[] = [];
          lines.forEach((line: string) => {
            let stars = 5;
            const starMatch = line.match(/bintang\s*(\d)/i);
            if (starMatch) {
              const s = parseInt(starMatch[1], 10);
              if (s >= 1 && s <= 5) stars = s;
            }
            const match = line.match(/^([^:]+):\s*(.*)/);
            if (match) {
              const cleanName = match[2].replace(/\(Bintang\s*\d+\)/i, '').replace(/Bintang\s*\d+/i, '').trim();
              parsedHotels.push({ city: match[1].trim(), name: cleanName, stars });
            } else {
              const cleanName = line.replace(/\(Bintang\s*\d+\)/i, '').replace(/Bintang\s*\d+/i, '').trim();
              parsedHotels.push({ city: 'Makkah', name: cleanName, stars });
            }
          });
          setHotels(parsedHotels.length > 0 ? parsedHotels : [{ city: 'Makkah', name: '', stars: 5 }, { city: 'Madinah', name: '', stars: 5 }]);
        }
      } else {
        setHotels([{ city: 'Makkah', name: '', stars: 5 }, { city: 'Madinah', name: '', stars: 5 }]);
      }

      if (pkg.flight_info) {
        try {
          const parsed = JSON.parse(pkg.flight_info);
          if (parsed && typeof parsed === 'object' && (parsed.airline || parsed.route)) {
            setAirline(parsed.airline || '');
            setFlightRoute(parsed.route || '');
          } else {
            throw new Error('Not object');
          }
        } catch {
          const lines = pkg.flight_info.split('\n').map((l: string) => l.trim()).filter(Boolean);
          if (lines.length > 0) {
            setAirline(lines[0]);
            setFlightRoute(lines.slice(1).join('\n'));
          } else {
            setAirline('');
            setFlightRoute('');
          }
        }
      } else {
        setAirline('');
        setFlightRoute('');
      }
    } catch (err: any) {
      setFormError(err.message || 'Gagal memuat paket');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = async (e?: React.FormEvent, forceStatus?: 'draft' | 'published') => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Nama paket wajib diisi');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      const payload: Partial<PackageItem> = {
        name: formData.name.trim(),
        description: formData.description.trim() ? formData.description.trim() : null,
        price: formData.price ? parseFloat(formData.price) : null,
        commission_amount: formData.commission_amount ? parseFloat(formData.commission_amount) : null,
        departure_date: formData.departure_date ? new Date(formData.departure_date).toISOString() : null,
        quota: formData.quota ? parseInt(formData.quota, 10) : null,
        status: forceStatus || formData.status,
        itinerary: formData.itinerary.trim() ? formData.itinerary.trim() : null,
        facilities_included: formData.facilities_included.trim() ? formData.facilities_included.trim() : null,
        facilities_excluded: formData.facilities_excluded.trim() ? formData.facilities_excluded.trim() : null,
        hotel_info: (() => {
          const valid = hotels.filter((h) => h.city.trim() || h.name.trim());
          return valid.length > 0
            ? JSON.stringify(valid.map((h) => ({ city: h.city.trim(), name: h.name.trim(), stars: typeof h.stars === 'number' ? h.stars : 5 })))
            : null;
        })(),
        flight_info: (() => {
          const a = airline.trim();
          const r = flightRoute.trim();
          return a || r ? JSON.stringify({ airline: a, route: r }) : null;
        })(),
        terms_conditions: formData.terms_conditions.trim() ? formData.terms_conditions.trim() : null,
      };

      if (isEditing && id) {
        await updatePackage(parseInt(id, 10), payload);
        navigate('/packages');
      } else {
        const newPkg = await createPackage(payload);
        if (pendingPhotos.length > 0) {
          const uploadErrors: string[] = [];
          for (const file of pendingPhotos) {
            try {
              await uploadPackagePhoto(newPkg.id, file);
            } catch (err: any) {
              uploadErrors.push(err.message || 'Gagal mengunggah foto');
            }
          }
          if (uploadErrors.length > 0) {
            navigate(`/packages/${newPkg.id}/edit`);
            return;
          }
        }
        navigate('/packages');
      }
    } catch (err: any) {
      setFormError(err.message || 'Gagal menyimpan paket');
    } finally {
      setSubmitting(false);
    }
  };



  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.');
      return;
    }
    
    if (file.size > 8 * 1024 * 1024) {
      setFormError('Ukuran file maksimal 8MB.');
      return;
    }

    if (isEditing && editingPackage) {
      try {
        setUploadingPhoto(true);
        setFormError(null);
        await uploadPackagePhoto(editingPackage.id, file);
        await loadPackage(editingPackage.id);
      } catch (err: any) {
        setFormError(err.message || 'Gagal mengunggah foto');
      } finally {
        setUploadingPhoto(false);
        if (e.target) e.target.value = '';
      }
    } else {
      setPendingPhotos(prev => [...prev, file]);
      if (e.target) e.target.value = '';
    }
  };

  const handlePhotoDelete = async (photoId: number) => {
    if (!editingPackage) return;
    try {
      setUploadingPhoto(true);
      await deletePackagePhoto(editingPackage.id, photoId);
      await loadPackage(editingPackage.id);
    } catch (err: any) {
      setFormError(err.message || 'Gagal menghapus foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const menuItems = getStandardMenuItems('packages');

  return (
    <div className="db-main-layout">
      <Sidebar brandName="KlikUmroh.id" menuItems={menuItems} footerContent="KlikUmroh.id 1.0" />

      <div className="db-content-area pkg-content-area">
        <Topbar userName={currentUser?.name || 'Administrator'} userRole="Administrator" userInitial={currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : 'AD'} />

        <main className="pkg-form-container">
          {/* Header */}
          <div className="pkg-form-header">
            <div className="pkg-header-left">
              <button className="pkg-back-btn" onClick={() => navigate('/packages')}>
                <ArrowLeft size={16} />
              </button>
              <div className="pkg-header-title-box">
                <h1 className="pkg-header-title">{isEditing ? 'Edit paket umroh' : 'Tambah paket umroh'}</h1>
                <p className="pkg-header-subtitle">Isi informasi yang dibutuhkan calon jamaah dan agen.</p>
              </div>
            </div>
            <div className="pkg-header-actions">
              <button className="pkg-action-btn pkg-btn-cancel" onClick={() => navigate('/packages')}>
                Batal
              </button>
              <button className="pkg-action-btn pkg-btn-draft" onClick={() => handleFormSubmit(undefined, 'draft')} disabled={submitting}>
                <FilePenLine size={14} />
                <span>Simpan draft</span>
              </button>
              <button className="pkg-action-btn pkg-btn-publish" onClick={() => handleFormSubmit(undefined, 'published')} disabled={submitting}>
                <Save size={14} />
                <span>Simpan paket</span>
              </button>
            </div>
          </div>



          {formError && (
            <div className="db-alert db-alert--error" style={{ marginBottom: '18px' }}>
              <AlertCircle size={18} />
              <span>{formError}</span>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--db-text-muted)' }}>Memuat data paket...</div>
          ) : (
            <div className="pkg-form-columns">
              <div className="pkg-main-column">
                
                {/* INFORMASI */}
                <div id="section-informasi" className="pkg-card">
                  <div className="pkg-card-header">
                    <Info size={16} color="var(--db-text-primary)" />
                    <div className="pkg-card-header-copy">
                      <div className="pkg-card-title">Informasi utama</div>
                      <div className="pkg-card-subtitle">Nama dan ringkasan paket yang tampil di katalog.</div>
                    </div>
                  </div>
                  <div className="pkg-card-body">
                    <div className="pkg-input-group">
                      <label className="pkg-label">Nama paket *</label>
                      <div className="pkg-input-wrapper">
                        <Package size={14} color="var(--db-text-muted)" />
                        <input 
                          type="text" 
                          className="pkg-input" 
                          value={formData.name} 
                          onChange={(e) => setFormData({...formData, name: e.target.value})}
                          placeholder="Contoh: Umroh Syawal 9 Hari" 
                        />
                      </div>
                      <div className="pkg-hint">Gunakan nama yang mudah dibandingkan.</div>
                    </div>

                    <div className="pkg-input-group">
                      <label className="pkg-label">Deskripsi singkat</label>
                      <div className="pkg-input-wrapper" style={{ height: '74px', alignItems: 'flex-start' }}>
                        <AlignLeft size={14} color="var(--db-text-muted)" style={{ marginTop: '3px' }} />
                        <textarea 
                          className="pkg-input pkg-textarea" 
                          value={formData.description}
                          onChange={(e) => setFormData({...formData, description: e.target.value})}
                          placeholder="Tulis ringkasan fasilitas dan keunggulan utama paket." 
                        />
                      </div>
                      <div className="pkg-hint">Tampil di kartu katalog publik.</div>
                    </div>
                  </div>
                </div>

                {/* FASILITAS */}
                <div id="section-fasilitas" className="pkg-card">
                  <div className="pkg-card-header">
                    <ListChecks size={16} color="var(--db-text-primary)" />
                    <div className="pkg-card-header-copy">
                      <div className="pkg-card-title">Fasilitas dan itinerary</div>
                      <div className="pkg-card-subtitle">Jelaskan yang didapat jamaah dan alur perjalanan.</div>
                    </div>
                  </div>
                  <div className="pkg-card-body">
                    <div className="pkg-input-row">
                      <div className="pkg-input-group" style={{ flex: 1 }}>
                        <label className="pkg-label">Termasuk</label>
                        <div className="pkg-input-wrapper" style={{ height: '92px', alignItems: 'flex-start' }}>
                          <CircleCheck size={14} color="var(--db-text-muted)" style={{ marginTop: '3px' }} />
                          <textarea 
                            className="pkg-input pkg-textarea" 
                            value={formData.facilities_included}
                            onChange={(e) => setFormData({...formData, facilities_included: e.target.value})}
                            placeholder="Tiket pesawat PP&#10;Hotel Makkah dan Madinah&#10;Visa umroh" 
                          />
                        </div>
                        <div className="pkg-hint">Satu fasilitas per baris.</div>
                      </div>
                      <div className="pkg-input-group" style={{ flex: 1 }}>
                        <label className="pkg-label">Tidak termasuk</label>
                        <div className="pkg-input-wrapper" style={{ height: '92px', alignItems: 'flex-start' }}>
                          <CircleX size={14} color="var(--db-text-muted)" style={{ marginTop: '3px' }} />
                          <textarea 
                            className="pkg-input pkg-textarea" 
                            value={formData.facilities_excluded}
                            onChange={(e) => setFormData({...formData, facilities_excluded: e.target.value})}
                            placeholder="Paspor&#10;Vaksin meningitis&#10;Keperluan pribadi" 
                          />
                        </div>
                        <div className="pkg-hint">Satu fasilitas per baris.</div>
                      </div>
                    </div>

                    <div className="pkg-input-group">
                      <label className="pkg-label">Itinerary</label>
                      <div className="pkg-input-wrapper" style={{ height: '112px', alignItems: 'flex-start' }}>
                        <Route size={14} color="var(--db-text-muted)" style={{ marginTop: '3px' }} />
                        <textarea 
                          className="pkg-input pkg-textarea" 
                          value={formData.itinerary}
                          onChange={(e) => setFormData({...formData, itinerary: e.target.value})}
                          placeholder="Hari 1 — Jakarta ke Jeddah&#10;Hari 2 — Madinah dan check-in hotel&#10;Hari 3 — Ziarah Kota Madinah" 
                        />
                      </div>
                      <div className="pkg-hint">Tulis urutan perjalanan per hari.</div>
                    </div>
                  </div>
                </div>

                {/* HOTEL & PENERBANGAN */}
                <div className="pkg-card">
                  <div className="pkg-card-header">
                    <Plane size={16} color="var(--db-text-primary)" />
                    <div className="pkg-card-header-copy">
                      <div className="pkg-card-title">Akomodasi dan penerbangan</div>
                      <div className="pkg-card-subtitle">Hotel, bintang, dan rute maskapai.</div>
                    </div>
                  </div>
                  <div className="pkg-card-body">
                    <div className="pkg-hotels-header">
                      <div className="pkg-hotels-title">Daftar Hotel Penginapan</div>
                      <button type="button" className="pkg-add-hotel-btn" onClick={() => setHotels([...hotels, { city: '', name: '', stars: 5 }])}>
                        <Plus size={12} /> Tambah
                      </button>
                    </div>

                    {hotels.map((hotel, index) => (
                      <div key={index} className="pkg-hotel-item">
                        <div className="pkg-hotel-item-header">
                          <div className="pkg-hotel-item-city">
                            <Building2 size={13} color="var(--db-text-muted)" />
                            <input 
                              type="text" 
                              className="pkg-hotel-city-input"
                              placeholder="Makkah / Madinah"
                              value={hotel.city}
                              onChange={(e) => {
                                const newHotels = [...hotels];
                                newHotels[index].city = e.target.value;
                                setHotels(newHotels);
                              }}
                            />
                          </div>
                          <div className="pkg-hotel-actions">
                            <div className="pkg-hotel-stars">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star 
                                  key={star} 
                                  size={12} 
                                  className={star <= hotel.stars ? "star-active" : "star-inactive"}
                                  onClick={() => {
                                    const newHotels = [...hotels];
                                    newHotels[index].stars = star;
                                    setHotels(newHotels);
                                  }}
                                  style={{ cursor: 'pointer' }}
                                />
                              ))}
                            </div>
                            {hotels.length > 1 && (
                              <button type="button" className="pkg-hotel-remove" onClick={() => setHotels(hotels.filter((_, i) => i !== index))}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                        <input 
                          type="text" 
                          className="pkg-hotel-name-input"
                          placeholder="Nama Hotel (Contoh: Pullman Zamzam / Setaraf)"
                          value={hotel.name}
                          onChange={(e) => {
                            const newHotels = [...hotels];
                            newHotels[index].name = e.target.value;
                            setHotels(newHotels);
                          }}
                        />
                      </div>
                    ))}

                    <div className="pkg-divider"></div>

                    <div className="pkg-input-group">
                      <label className="pkg-label">Maskapai Penerbangan</label>
                      <div className="pkg-input-wrapper">
                        <Plane size={14} color="var(--db-text-muted)" />
                        <input 
                          type="text" 
                          className="pkg-input" 
                          value={airline}
                          onChange={(e) => setAirline(e.target.value)}
                          placeholder="Contoh: Saudia Airlines (SV)" 
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SIDE COLUMN */}
              <div className="pkg-side-column">
                
                {/* HARGA & KUOTA */}
                <div id="section-harga" className="pkg-card">
                  <div className="pkg-card-header">
                    <BadgeDollarSign size={16} color="var(--db-text-primary)" />
                    <div className="pkg-card-header-copy">
                      <div className="pkg-card-title">Harga &amp; Kuota</div>
                      <div className="pkg-card-subtitle">Skema harga dan alokasi kursi.</div>
                    </div>
                  </div>
                  <div className="pkg-card-body">
                    <div className="pkg-input-group">
                      <label className="pkg-label">Harga Mulai (IDR)</label>
                      <div className="pkg-input-wrapper">
                        <span className="pkg-input-prefix">Rp</span>
                        <input 
                          type="text" 
                          className="pkg-input" 
                          value={formData.price ? new Intl.NumberFormat('id-ID').format(Number(formData.price)) : ''}
                          onChange={(e) => setFormData({...formData, price: e.target.value.replace(/\D/g, '')})}
                          placeholder="32.500.000" 
                        />
                      </div>
                    </div>
                    
                    <div className="pkg-input-group">
                      <label className="pkg-label">Komisi Agen per Jamaah</label>
                      <div className="pkg-input-wrapper">
                        <span className="pkg-input-prefix">Rp</span>
                        <input 
                          type="text" 
                          className="pkg-input" 
                          value={formData.commission_amount ? new Intl.NumberFormat('id-ID').format(Number(formData.commission_amount)) : ''}
                          onChange={(e) => setFormData({...formData, commission_amount: e.target.value.replace(/\D/g, '')})}
                          placeholder="1.500.000" 
                        />
                      </div>
                    </div>

                    <div className="pkg-input-row">
                      <div className="pkg-input-group" style={{ flex: 1 }}>
                        <label className="pkg-label">Sisa Kuota</label>
                        <input 
                          type="number" 
                          className="pkg-input-simple" 
                          value={formData.quota}
                          onChange={(e) => setFormData({...formData, quota: e.target.value})}
                          placeholder="45" 
                        />
                      </div>
                      <div className="pkg-input-group" style={{ flex: 1 }}>
                        <label className="pkg-label">Tgl. Berangkat</label>
                        <input 
                          type="date" 
                          className="pkg-input-simple" 
                          value={formData.departure_date}
                          onChange={(e) => setFormData({...formData, departure_date: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* GALERI */}
                <div id="section-galeri" className="pkg-card">
                  <div className="pkg-card-header">
                    <Images size={16} color="var(--db-text-primary)" />
                    <div className="pkg-card-header-copy">
                      <div className="pkg-card-title">Galeri Foto</div>
                      <div className="pkg-card-subtitle">Foto brosur dan dokumentasi.</div>
                    </div>
                  </div>
                  <div className="pkg-card-body">
                    {/* File Upload */}
                    <label className="pkg-upload-area">
                      <ImageIcon size={24} color="var(--db-text-muted)" style={{ marginBottom: '8px' }} />
                      <span className="pkg-upload-text">Klik untuk unggah foto</span>
                      <span className="pkg-hint">JPG, PNG, WEBP (Max 8MB)</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} style={{ display: 'none' }} disabled={uploadingPhoto} />
                    </label>

                    {/* Photos Grid */}
                    <div className="pkg-gallery-grid">
                      {isEditing && editingPackage?.photos && editingPackage.photos.map((photo) => (
                        <div key={photo.id} className="pkg-gallery-item">
                          <img src={`http://localhost:8080${photo.file_path}`} alt="Galeri" />
                          <button type="button" className="pkg-gallery-del" onClick={() => handlePhotoDelete(photo.id)}><Trash2 size={12} /></button>
                        </div>
                      ))}
                      {!isEditing && pendingPhotos.map((file, idx) => (
                        <div key={idx} className="pkg-gallery-item">
                          <img src={URL.createObjectURL(file)} alt="Galeri pending" />
                          <button type="button" className="pkg-gallery-del" onClick={() => setPendingPhotos(pendingPhotos.filter((_, i) => i !== idx))}><Trash2 size={12}/></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* PUBLIKASI */}
                <div id="section-publikasi" className="pkg-card">
                  <div className="pkg-card-header">
                    <Send size={16} color="var(--db-text-primary)" />
                    <div className="pkg-card-header-copy">
                      <div className="pkg-card-title">Status Publikasi</div>
                      <div className="pkg-card-subtitle">Pilih status tayang paket di web.</div>
                    </div>
                  </div>
                  <div className="pkg-card-body">
                    <select 
                      className="pkg-input-simple"
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                    >
                      <option value="draft">Draft (Disembunyikan)</option>
                      <option value="published">Published (Tayang)</option>
                      <option value="archived">Archived (Diarsipkan)</option>
                    </select>
                  </div>
                </div>

              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
