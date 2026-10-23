import { useState, useEffect, useMemo, useRef } from 'react';
import qrcode from 'qrcode-generator';
import JsBarcode from 'jsbarcode';
import './admin.css';
import { taka, getCategories, fetchMasterColors, createMasterColor, deleteMasterColor, type MasterColor } from './api';
import { WhatsAppIcon } from './icons';

const KEY = 'dot_admin';
const getTok = () => localStorage.getItem(KEY) || '';
function qrSvg(text: string) {
  try { const qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }
  catch { return ''; }
}
function barcodeSvg(text: string) {
  const value = String(text || '').trim();
  if (!value) return '';
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value, { format: 'CODE128', displayValue: false, margin: 0, width: 1, height: 28, lineColor: '#111111', background: '#ffffff' });
    return svg.outerHTML;
  } catch { return ''; }
}
const slugify = (s: string) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
async function aFetch(path: string, opts: any = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': getTok(), ...(opts.headers || {}) },
  });
  if (res.status === 401 && !path.includes('/login')) {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event('admin-logout'));
  }
  return res;
}

const STATUSES = ['pending', 'incomplete', 'approved', 'hold', 'confirmed', 'shipped', 'delivered', 'cancelled', 'return'];
const COURIERS = ['Pathao', 'Steadfast', 'RedX', 'Sundarban', 'eCourier', 'Paperfly'];
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); return d + 'd ago';
}

function ago(d: string) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
  return fmt(d);
}

const BD_DISTRICTS = ['dhaka', 'chattogram', 'chittagong', 'gazipur', 'narayanganj', 'cumilla', 'comilla', 'sylhet', 'rajshahi', 'khulna', 'barishal', 'barisal', 'rangpur', 'mymensingh', 'bogura', 'bogra', 'jashore', 'jessore', 'narsingdi', 'tangail', 'savar', 'cox', 'feni', 'noakhali', 'dinajpur', 'pabna', 'kushtia', 'faridpur', 'gulshan', 'dhanmondi', 'uttara', 'mirpur'];
function detectDistrict(addr: string) {
  const a = (addr || '').toLowerCase();
  const hit = BD_DISTRICTS.find((d) => a.includes(d));
  return hit ? hit.charAt(0).toUpperCase() + hit.slice(1) : '';
}
function suggestCourier(district: string) {
  const d = district.toLowerCase();
  return ['dhaka', 'gazipur', 'narayanganj', 'savar', 'gulshan', 'dhanmondi', 'uttara', 'mirpur'].some((x) => d.includes(x)) ? 'Pathao' : 'Steadfast';
}
function originLabel(src: string) {
  const s = (src || 'direct').toLowerCase();
  if (s.includes('phone') || s === 'phone_call') return 'Phone Call';
  if (s.includes('whatsapp') || s === 'wa') return 'WhatsApp';
  if (s.includes('facebook') || s === 'fb') return 'Facebook';
  if (s.includes('instagram') || s === 'ig') return 'Instagram';
  if (s.includes('tiktok')) return 'TikTok';
  if (s.includes('google')) return 'Google';
  if (s.includes('youtube')) return 'YouTube';
  if (s.includes('landing')) return 'Landing Page';
  if (s === 'direct' || s === '') return 'Direct';
  return src;
}

function OriginBadge({ source, style }: { source: string; style?: React.CSSProperties }) {
  const s = (source || 'direct').toLowerCase();
  if (s.includes('whatsapp') || s === 'wa') {
    return (
      <span className="origin-chip origin-wa" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...style }}>
        <WhatsAppIcon size={13} variant="official" />
        <span>WhatsApp</span>
      </span>
    );
  }
  if (s.includes('phone') || s === 'phone_call') {
    return (
      <span className="origin-chip origin-phone" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
        <span>📞</span>
        <span>Phone Call</span>
      </span>
    );
  }
  return (
    <span className="origin-chip" style={style}>
      {originLabel(source)}
    </span>
  );
}

function exportCSV(orders: any[]) {
  const head = ['id', 'date', 'name', 'phone', 'area', 'address', 'items', 'subtotal', 'delivery', 'discount', 'coupon', 'total', 'status'];
  const rows = orders.map((o) => [
    o.id, o.createdAt, o.customer.name, o.customer.phone, o.customer.area || '', o.customer.address,
    o.items.map((it: any) => `${it.name} x${it.qty}`).join('; '),
    o.itemsTotal ?? o.total, o.delivery ?? 0, o.discount ?? 0, o.coupon || '', o.total, o.status,
  ]);
  const esc = (v: any) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'dot-orders-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function getBase64ByteSize(b64: string): number {
  if (!b64) return 0;
  const comma = b64.indexOf(',');
  const raw = comma >= 0 ? b64.slice(comma + 1) : b64;
  return Math.round((raw.length * 3) / 4);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

export async function processImageToWebpOrSvg(file: File): Promise<string> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  if (isSvg) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_BYTES = 100 * 1024; // strictly 100 KB limit
        
        // Progressive reduction steps to guarantee <= 100 KB with highest possible fidelity
        const steps = [
          { maxDim: 1400, quality: 0.82 },
          { maxDim: 1200, quality: 0.78 },
          { maxDim: 1080, quality: 0.72 },
          { maxDim: 960,  quality: 0.65 },
          { maxDim: 850,  quality: 0.58 },
          { maxDim: 750,  quality: 0.50 },
          { maxDim: 650,  quality: 0.42 },
          { maxDim: 550,  quality: 0.35 },
          { maxDim: 450,  quality: 0.30 },
          { maxDim: 360,  quality: 0.25 },
        ];

        let bestResult = '';
        let bestBytes = Infinity;

        for (const step of steps) {
          try {
            let width = img.naturalWidth || img.width;
            let height = img.naturalHeight || img.height;
            if (width > step.maxDim || height > step.maxDim) {
              if (width > height) {
                height = Math.round((height * step.maxDim) / width);
                width = step.maxDim;
              } else {
                width = Math.round((width * step.maxDim) / height);
                height = step.maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, width);
            canvas.height = Math.max(1, height);
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const webpDataUrl = canvas.toDataURL('image/webp', step.quality);
            const bytes = getBase64ByteSize(webpDataUrl);

            if (bytes < bestBytes) {
              bestBytes = bytes;
              bestResult = webpDataUrl;
            }

            if (bytes <= MAX_BYTES) {
              resolve(webpDataUrl);
              return;
            }
          } catch {
            // continue trying smaller step
          }
        }

        // Return best compressed version
        resolve(bestResult || (e.target?.result as string));
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadOptimizedImage(file: File): Promise<{ url: string; deduplicated?: boolean }> {
  const dataUrl = await processImageToWebpOrSvg(file);
  const res = await aFetch('/upload', {
    method: 'POST',
    body: JSON.stringify({ dataUrl })
  });
  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'Upload failed');
  }
  return data;
}

export function MediaPickerModal({
  title = 'Select Photo',
  currentUrl = '',
  extraImages = [],
  onSelect,
  onClose,
}: {
  title?: string;
  currentUrl?: string;
  extraImages?: string[];
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [mediaList, setMediaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(currentUrl || '');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await aFetch('/admin/media');
      const data = await res.json();
      const serverItems = Array.isArray(data)
        ? data.map((m: any) => ({
            url: m.url || ('/uploads/' + m.name),
            name: m.name || m.url,
            size: m.size || 0,
            modified: m.modified,
          }))
        : [];

      // Combine with extraImages (e.g. current product images)
      const seen = new Set<string>();
      const combined: any[] = [];

      for (const item of serverItems) {
        if (item.url && !seen.has(item.url)) {
          seen.add(item.url);
          combined.push(item);
        }
      }
      for (const url of (extraImages || [])) {
        if (url && !seen.has(url)) {
          seen.add(url);
          combined.unshift({
            url,
            name: url.split('/').pop() || url,
            size: 0,
          });
        }
      }
      setMediaList(combined);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const handleUploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setUploading(true);
    let lastUrl = '';
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      setUploadMsg(`⚡ Auto-converting ${f.name} to WebP ≤100KB (${i + 1}/${list.length})...`);
      try {
        const d = await uploadOptimizedImage(f);
        if (d.url) {
          lastUrl = d.url;
          setMediaList((prev) => [
            { url: d.url, name: f.name, size: 0, isNew: true },
            ...prev.filter((x) => x.url !== d.url),
          ]);
        }
      } catch (err: any) {
        alert(err.message || 'Upload failed');
      }
    }
    setUploading(false);
    setUploadMsg('');
    if (lastUrl) {
      setSelected(lastUrl);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mediaList;
    return mediaList.filter((m) => (m.name || '').toLowerCase().includes(q) || (m.url || '').toLowerCase().includes(q));
  }, [mediaList, search]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 4, 12, 0.82)',
        backdropFilter: 'blur(6px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(940px, 98vw)',
          height: 'min(86vh, 760px)',
          background: '#151226',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#120f20',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🖼️</span>
              <span>{title}</span>
              <span
                style={{
                  fontSize: 10.5,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: 'rgba(52, 211, 153, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                  fontWeight: 600,
                }}
              >
                ⚡ Auto WebP / SVG (≤ 100KB)
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
              Select a photo from your media library, or upload a new photo from your computer.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Action bar / Search & Computer Upload button */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            background: '#18142b',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search photos by name or filename..."
              style={{
                width: '100%',
                padding: '9px 12px',
                background: '#0d0b18',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
              }}
            />
          </div>

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="sa-btn primary"
            style={{
              cursor: uploading ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#7c3aed',
              borderColor: '#7c3aed',
              padding: '9px 16px',
              fontWeight: 700,
            }}
          >
            <span>📁 Upload from Computer</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) handleUploadFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className="sa-btn ghost"
            onClick={loadMedia}
            style={{ padding: '9px 14px' }}
            title="Refresh media list"
          >
            🔄 Refresh
          </button>
        </div>

        {uploading && (
          <div
            style={{
              padding: '10px 20px',
              background: 'linear-gradient(90deg, rgba(124, 58, 237, 0.25), rgba(52, 211, 153, 0.25))',
              borderBottom: '1px solid rgba(124, 58, 237, 0.35)',
              color: '#a7f3d0',
              fontSize: 12.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>⏳</span>
            <span>{uploadMsg || 'Compressing photo to WebP ≤100KB and uploading...'}</span>
          </div>
        )}

        {/* Gallery Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
              <div>Loading media library...</div>
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '50px 20px',
                background: '#120f21',
                borderRadius: 12,
                border: '1px dashed rgba(255, 255, 255, 0.15)',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>🖼️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {search ? 'No matching photos found' : 'No photos found in Media Library'}
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8', maxWidth: 440, margin: '0 auto 18px', lineHeight: 1.5 }}>
                {search
                  ? `No photos matched "${search}". Try another search or upload a photo directly from your device.`
                  : 'You have not uploaded any photos yet. Click below to choose a picture from your computer — it will automatically convert to WebP (≤100KB)!'}
              </p>
              <button
                type="button"
                className="sa-btn primary"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: '#7c3aed',
                  borderColor: '#7c3aed',
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>📁 Upload Photo from Computer</span>
              </button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span>Found <strong>{filtered.length}</strong> photos (Click to select, Double-click to choose instantly):</span>
                {selected && (
                  <span style={{ color: '#34d399', fontWeight: 600 }}>1 photo selected ✓</span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 }}>
                {filtered.map((m: any, idx: number) => {
                  const isSelected = selected === m.url;
                  const isWebp = (m.url || '').toLowerCase().endsWith('.webp');
                  const isSvg = (m.url || '').toLowerCase().endsWith('.svg');
                  const extLabel = isWebp ? 'WEBP' : isSvg ? 'SVG' : ((m.url || '').split('.').pop() || '').toUpperCase();

                  return (
                    <div
                      key={m.url || idx}
                      onClick={() => setSelected(m.url)}
                      onDoubleClick={() => {
                        onSelect(m.url);
                        onClose();
                      }}
                      style={{
                        position: 'relative',
                        background: '#0e0c18',
                        borderRadius: 10,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isSelected ? '2.5px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: isSelected ? '0 0 16px rgba(16, 185, 129, 0.45)' : 'none',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                      title={`${m.name || m.url}\n(Click to select, Double-click to apply)`}
                    >
                      <div style={{ width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', background: '#080611', position: 'relative' }}>
                        <img
                          src={m.url}
                          alt=""
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {isSelected && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              background: '#10b981',
                              color: '#fff',
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 800,
                              boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                            }}
                          >
                            ✓
                          </div>
                        )}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 4,
                            left: 4,
                            background: 'rgba(0,0,0,0.75)',
                            padding: '1px 5px',
                            borderRadius: 4,
                            fontSize: 9,
                            fontWeight: 700,
                            color: isWebp || isSvg ? '#34d399' : '#cbd5e1',
                          }}
                        >
                          {extLabel}
                        </div>
                      </div>

                      <div style={{ padding: '6px 8px', fontSize: 11, background: '#120f21' }}>
                        <div
                          style={{
                            color: '#fff',
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {m.name || m.url.split('/').pop()}
                        </div>
                        {m.size ? (
                          <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 1 }}>
                            {formatBytes(m.size)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#120f20',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            {selected ? (
              <>
                <img
                  src={selected}
                  alt=""
                  style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }}
                />
                <div style={{ minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Selected Image:</div>
                  <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selected}
                  </div>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 12, color: '#64748b' }}>No image currently selected</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="sa-btn ghost" onClick={onClose} style={{ padding: '8px 16px' }}>
              Cancel
            </button>
            <button
              type="button"
              className="sa-btn primary"
              disabled={!selected}
              onClick={() => {
                if (selected) {
                  onSelect(selected);
                  onClose();
                }
              }}
              style={{
                background: selected ? '#10b981' : '#334155',
                borderColor: selected ? '#10b981' : '#334155',
                padding: '8px 20px',
                fontWeight: 700,
                cursor: selected ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>✓</span>
              <span>Choose Photo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

let PRINT_BRANDING = { storeName: 'Store', logo: '' };
const PRINT_CSS = `*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:210mm;padding:18mm 16mm;margin:0 auto}.pg+.pg{border-top:1px dashed #ccc}
.doc-top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1a1a1a;padding-bottom:16px}
.brand{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1}.brand span{color:#c08a5e}.brand-logo{display:block;max-width:190px;max-height:64px;object-fit:contain;object-position:left center}
.brand-sub{font-size:10px;color:#999;letter-spacing:.16em;text-transform:uppercase;margin-top:6px}
.doc-meta{text-align:right}.doc-title{font-size:20px;font-weight:800;letter-spacing:.08em}
.doc-id{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;color:#444;margin-top:5px}
.doc-date{font-size:12px;color:#999;margin-top:3px}
.cols{display:flex;gap:28px;margin-top:22px}.col{flex:1}
.lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;margin-bottom:6px}
.col p{margin:0;font-size:13px;line-height:1.55;color:#333}.col .nm{font-size:15px;font-weight:700;color:#1a1a1a}
.pay{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#f3ede6;color:#8a5a2b;border-radius:5px;padding:5px 11px}
table{width:100%;border-collapse:collapse;margin-top:26px}
thead th{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#aaa;text-align:left;padding:0 0 9px;border-bottom:1.5px solid #1a1a1a}
tbody td{font-size:13px;padding:11px 2px;border-bottom:1px solid #f0f0f0;color:#333}
th.r,td.r{text-align:right}th.c,td.c{text-align:center}
.totbox{margin:18px 0 0 auto;width:270px}
.totrow{display:flex;justify-content:space-between;font-size:13px;padding:6px 0;color:#555}
.totrow.grand{border-top:2px solid #1a1a1a;margin-top:6px;padding-top:12px;font-size:18px;font-weight:800;color:#1a1a1a}
.foot{margin-top:34px;border-top:1px solid #eee;padding-top:14px;font-size:11.5px;color:#aaa;text-align:center;line-height:1.7}
.slip-to{border:1.5px solid #1a1a1a;border-radius:11px;padding:16px 20px;margin-top:22px}
.slip-to .nm{font-size:22px;font-weight:800;letter-spacing:-.01em}.slip-to p{margin:4px 0 0;font-size:14px;line-height:1.5;color:#333}
.cod{display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;color:#fff;border-radius:11px;padding:15px 20px;margin-top:14px}
.cod .k{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.75}.cod .v{font-size:27px;font-weight:800}
td.chk,th.chk{width:26px}td.chk i{display:inline-block;width:15px;height:15px;border:1.5px solid #bbb;border-radius:4px}
.qrbox{text-align:center}.qrbox svg{display:block;width:120px;height:120px;margin:0 0 0 auto}.qrbox .qid{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#444;margin-top:5px;letter-spacing:.02em}
.qrline{display:flex;align-items:center;gap:7px;justify-content:flex-end;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#bbb;margin-bottom:5px}
@media print{.pg{page-break-after:always;padding:14mm}.pg:last-child{page-break-after:auto}@page{size:A4;margin:0}}`;

const THERMAL_SLIP_CSS = `*{box-sizing:border-box}html,body{width:50mm;margin:0;padding:0;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:50mm;height:75mm;padding:2.4mm;margin:0 auto;overflow:hidden;page-break-after:always;break-after:page;display:flex;flex-direction:column;gap:1.2mm}
.pg:last-child{page-break-after:auto;break-after:auto}.doc-top{display:flex;justify-content:space-between;align-items:center;border-bottom:.3mm solid #111;padding:0 0 1.2mm;min-height:9mm}
.brand{font-size:11px;font-weight:800;line-height:1}.brand span{color:#555}.brand-logo{display:block;max-width:18mm;max-height:7mm;object-fit:contain;object-position:left center}
.brand-sub{font-size:5px;color:#555;letter-spacing:.08em;text-transform:uppercase;margin-top:.6mm}.doc-date{font-size:5.5px;color:#555;margin-top:.8mm}.qrbox{text-align:center;flex:none}.qrbox svg{display:block;width:13mm;height:13mm;margin:0 0 0 auto}.qrbox .qid{font-family:monospace;font-size:5px;color:#222;margin-top:.3mm;letter-spacing:0}
.qrline{font-size:4px;letter-spacing:.03em;text-transform:uppercase;color:#555;margin-bottom:.2mm}.slip-to{border:.25mm solid #333;border-radius:1mm;padding:1.3mm 1.6mm;margin:0;min-width:0}
.lbl{font-size:5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#555;margin-bottom:.4mm}.slip-to .nm{font-size:9px;font-weight:800;line-height:1.12;overflow-wrap:anywhere}.slip-to p{margin:.35mm 0 0;font-size:7px;line-height:1.15;color:#222;overflow-wrap:anywhere}
.courier-info{font-size:6px;line-height:1.1;overflow-wrap:anywhere}.courier-info .lbl{display:inline;margin:0 .8mm 0 0}.courier-info b{font-size:6px}.consignment{font-family:monospace;font-size:5.5px}
.cols{display:flex;gap:2mm;margin:0}.col{flex:1;min-width:0}.col p{margin:0;font-size:6px;line-height:1.15;color:#222}.col .nm{font-size:7px;font-weight:700;overflow-wrap:anywhere}
.cod{display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;border-radius:1mm;padding:1.2mm 1.6mm;margin:0;min-height:6mm}.cod .k{font-size:5px;letter-spacing:.04em;text-transform:uppercase}.cod .v{font-size:10px;font-weight:800}
table{width:100%;border-collapse:collapse;margin:0}thead th{font-size:5px;font-weight:700;text-transform:uppercase;color:#555;text-align:left;padding:0 0 .6mm;border-bottom:.2mm solid #555}tbody td{font-size:6px;padding:.5mm 0;border-bottom:.15mm solid #ddd;color:#222;line-height:1.1}th.r,td.r{text-align:right}
.courier-barcode-wrap{margin-top:auto;text-align:center;border-top:.2mm solid #bbb;padding-top:.8mm;min-height:11mm}.courier-barcode-label{font-size:5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#333}.courier-barcode{display:block;width:100%;height:7mm;margin:.5mm auto 0}.courier-barcode-id{font-family:monospace;font-size:5px;line-height:1;color:#222;margin-top:.3mm;letter-spacing:.02em}.foot{margin:0;border:0;padding:0;font-size:4.5px;color:#555;text-align:center;line-height:1.1}
@page{size:50mm 75mm;margin:0}@media print{html,body{width:50mm;height:auto}.pg{width:50mm;height:75mm;padding:2.4mm;overflow:hidden}}`;

function invoiceBody(o: any) {
  const brand = PRINT_BRANDING.logo ? `<img class="brand-logo" src="${PRINT_BRANDING.logo}" alt="${PRINT_BRANDING.storeName}"/>` : `<div class="brand">${PRINT_BRANDING.storeName}</div>`;
  const rows = o.items.map((it: any, i: number) => `<tr><td class="c">${i + 1}</td><td><div style="display:flex;align-items:center;gap:8px">${it.image ? `<img src="${it.image}" style="width:28px;height:28px;border-radius:4px;object-fit:cover;border:1px solid #eee;flex:none"/>` : ''}<span>${it.name}</span></div></td><td class="c">${it.qty}</td><td class="r">৳${it.price ?? Math.round(it.subtotal / it.qty)}</td><td class="r">৳${it.subtotal}</td></tr>`).join('');
  const cour = o.courier && o.courier.name ? `<div class="col"><div class="lbl">Courier</div><p class="nm">${o.courier.name}</p>${o.courier.consignment ? `<p>Tracking: ${o.courier.consignment}</p>` : ''}</div>` : '';
  const disc = o.discount ? `<div class="totrow"><span>Discount${o.coupon ? ' (' + o.coupon + ')' : ''}</span><span>&minus;৳${o.discount}</span></div>` : '';
  return `<div class="pg"><div class="doc-top"><div>${brand}<div class="brand-sub">${PRINT_BRANDING.storeName}</div></div><div class="doc-meta"><div class="doc-title">INVOICE</div><div class="doc-id">${o.id}</div><div class="doc-date">${new Date(o.createdAt).toLocaleString()}</div></div></div><div class="cols"><div class="col"><div class="lbl">Deliver to</div><p class="nm">${o.customer.name}</p><p>${o.customer.phone}</p><p>${o.customer.address}${o.customer.area ? ' (' + o.customer.area + ' dhaka)' : ''}</p></div><div class="col"><div class="lbl">Payment</div><span class="pay">${o.paymentStatus === 'paid' ? 'Paid' : 'Cash on delivery · unpaid'}</span></div>${cour}</div><table><thead><tr><th class="c">#</th><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table><div class="totbox"><div class="totrow"><span>Subtotal</span><span>৳${o.itemsTotal ?? o.total}</span></div><div class="totrow"><span>Delivery</span><span>${o.delivery ? '৳' + o.delivery : 'Free'}</span></div>${disc}<div class="totrow grand"><span>Order total</span><span>৳${o.total}</span></div><div class="totrow"><span>Amount due</span><span>৳${o.paymentStatus === 'paid' ? 0 : o.total}</span></div></div><div class="foot">Thank you for shopping with ${PRINT_BRANDING.storeName}.<br>This is a computer-generated invoice and needs no signature.</div></div>`;
}
function slipBody(o: any) {
  const brand = PRINT_BRANDING.logo ? `<img class="brand-logo" src="${PRINT_BRANDING.logo}" alt="${PRINT_BRANDING.storeName}"/>` : `<div class="brand">${PRINT_BRANDING.storeName}</div>`;
  const collectableAmount = o.paymentStatus === 'paid' ? 0 : Number(o.total || 0);
  const rows = o.items.map((it: any) => `<tr><td><b>${it.name}</b></td><td class="r">&times; ${it.qty}</td></tr>`).join('');
  const cour = o.courier?.name ? `<div class="courier-info"><span class="lbl">Courier</span><b>${o.courier.name}</b>${o.courier.consignment ? `<span class="consignment"> · ${o.courier.consignment}</span>` : ''}</div>` : '';
  const qr = `<div class="qrbox"><div class="qrline">scan &middot; pack &middot; return</div>${qrSvg(o.id)}<div class="qid">${o.id}</div></div>`;
  const courierCode = String(o.courier?.consignment || o.id || '').trim();
  const barcode = barcodeSvg(courierCode);
  const barcodeLabel = o.courier?.consignment ? `${o.courier.name || 'Courier'} tracking` : 'Store order reference';
  return `<div class="pg"><div class="doc-top"><div>${brand}<div class="brand-sub">packing slip · ${PRINT_BRANDING.storeName}</div><div class="doc-date">${new Date(o.createdAt).toLocaleDateString()}</div></div>${qr}</div><div class="slip-to"><div class="lbl">Ship to</div><div class="nm">${o.customer.name}</div><p>${o.customer.phone}</p><p>${o.customer.address}${o.customer.area ? ' (' + o.customer.area + ' dhaka)' : ''}</p></div>${cour}<div class="cod"><span class="k">${o.paymentStatus === 'paid' ? 'Paid · do not collect' : 'Collect on delivery'}</span><span class="v">৳${collectableAmount}</span></div><table><thead><tr><th>Item</th><th class="r">Qty</th></tr></thead><tbody>${rows}</tbody></table><div class="courier-barcode-wrap"><div class="courier-barcode-label">${barcodeLabel}</div>${barcode}<div class="courier-barcode-id">${courierCode}</div></div><div class="foot">${PRINT_BRANDING.storeName} · Thank you</div></div>`;
}
function printDoc(title: string, inner: string, format: 'A4' | 'label' = 'A4') {
  const printCss = format === 'label' ? THERMAL_SLIP_CSS : PRINT_CSS;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${printCss}</style></head><body>${inner}<script>window.onload=function(){window.print()}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}
function printInvoice(o: any) { printDoc(o.id, invoiceBody(o)); }
function printInvoices(list: any[]) { if (list.length) printDoc('invoices', list.map(invoiceBody).join('')); }
function printSlips(list: any[]) { if (list.length) printDoc('packing slips', list.map(slipBody).join(''), 'label'); }
const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const Badge = ({ s }: { s: string }) => <span className={'sa-badge b-' + s}>{s}</span>;
function useCountUp(target: number, ms = 850) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
    let raf = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); setN(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return n;
}
const Stat = ({ label, value, money }: { label: string; value: number; money?: boolean }) => {
  const n = useCountUp(value || 0);
  return <div className="sa-stat"><div className="v">{money ? taka(n) : n.toLocaleString('en-US')}</div><div className="l">{label}</div></div>;
};

const I = {
  home: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l7-6 7 6" /><path d="M5 8v8h10V8" /></svg>,
  orders: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 6h10l-.6 10H5.6L5 6z" /><path d="M7.5 6a2.5 2.5 0 0 1 5 0" /></svg>,
  products: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7l7-4 7 4v6l-7 4-7-4V7z" /><path d="M3 7l7 4 7-4" /></svg>,
  settings: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="10" r="2.4" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.6 4.6l1.4 1.4M14 14l1.4 1.4M15.4 4.6L14 6M6 14l-1.4 1.4" /></svg>,
  categories: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="11" y="3" width="6" height="6" rx="1" /><rect x="3" y="11" width="6" height="6" rx="1" /><rect x="11" y="11" width="6" height="6" rx="1" /></svg>,
  coupons: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1.5a1.5 1.5 0 0 0 0 3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1.5a1.5 1.5 0 0 0 0-3V7z" /></svg>,
  customers: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="7" r="3" /><path d="M4 17c0-3.2 2.7-5 6-5s6 1.8 6 5" /></svg>,
  integrations: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 3v4M13 3v4M4 7h12v3a6 6 0 0 1-12 0V7z" /><path d="M10 16v2" /></svg>,
  landings: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 2.5c2.5 2 3.8 5 3.8 8.5A3.8 3.8 0 0 1 10 14.8 3.8 3.8 0 0 1 6.2 11c0-3.5 1.3-6.5 3.8-8.5z" /><path d="M6.5 13.5 4 16l2.5.3M13.5 13.5 16 16l-2.5.3" /></svg>,
  media: <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="14" height="12" rx="2" /><circle cx="7.5" cy="8.5" r="1.4" /><path d="M4 14l4-3.5 3 2.5 3-3 2 2.5" /></svg>,
};

export function Admin() {
  const [authed, setAuthed] = useState(() => !!getTok());
  const [nav, setNav] = useState('dashboard');
  const [store, setStore] = useState('dot.');
  const [me, setMe] = useState<any>(null);
  const [orderTotal, setOrderTotal] = useState<number | null>(null);
  const [lastSeen, setLastSeen] = useState<number | null>(null);
  const [navq, setNavq] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const prevTotal = useRef<number | null>(null);
  useEffect(() => {
    const onLogout = () => { setAuthed(false); setMe(null); };
    window.addEventListener('admin-logout', onLogout);
    return () => window.removeEventListener('admin-logout', onLogout);
  }, []);
  useEffect(() => {
    if (!authed) return;
    fetch('/api/settings').then((r) => r.json()).then((s) => { const storeName = s.storeName || 'Store'; PRINT_BRANDING = { storeName, logo: s.logo || '' }; setStore(storeName); }).catch(() => {});
    aFetch('/admin/me').then((r) => (r.ok ? r.json() : null)).then((m) => { if (m) setMe(m); else { localStorage.removeItem(KEY); setAuthed(false); } }).catch(() => {});
  }, [authed]);
  useEffect(() => {
    if (!authed) return;
    const beep = () => { try { const a = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = a.createOscillator(); const g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = 0.08; o.start(); o.frequency.setValueAtTime(660, a.currentTime + 0.12); o.stop(a.currentTime + 0.24); } catch {} };
    const check = () => aFetch('/orders').then((r) => (r.ok ? r.json() : null)).then((o) => {
      if (!o) return; const n = o.length;
      setOrderTotal(n);
      if (prevTotal.current === null) setLastSeen((ls) => (ls === null ? n : ls));
      else if (n > prevTotal.current) { beep(); if (document.title.indexOf('🔴') < 0) document.title = '🔴 new order — dot. admin'; }
      prevTotal.current = n;
    }).catch(() => {});
    check();
    const t = setInterval(check, 25000);
    return () => clearInterval(t);
  }, [authed]);
  useEffect(() => { if (!authed) return; if (nav === 'orders' && orderTotal != null) { setLastSeen(orderTotal); document.title = 'dot. admin'; } }, [nav, orderTotal, authed]);
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  const role = me?.role || 'owner';
  const allowed = role === 'staff' ? ['dashboard', 'orders', 'scanner', 'customers']
    : role === 'manager' ? ['dashboard', 'orders', 'scanner', 'finance', 'whatsapp', 'customers', 'products', 'categories', 'landings', 'media', 'coupons', 'fraud', 'integrations', 'settings']
      : ['dashboard', 'orders', 'scanner', 'finance', 'whatsapp', 'backup', 'customers', 'products', 'categories', 'landings', 'media', 'coupons', 'fraud', 'staff', 'integrations', 'settings'];
  const cur = allowed.includes(nav) ? nav : 'dashboard';
  const newOrders = cur === 'orders' || lastSeen == null || orderTotal == null ? 0 : Math.max(0, orderTotal - lastSeen);
  const item = (id: string, icon: any, label: string, badge?: number) => allowed.includes(id) && (!navq || label.toLowerCase().includes(navq.toLowerCase()))
    ? <button className={cur === id ? 'on' : ''} onClick={() => { setNav(id); setMobileMenuOpen(false); }}>{icon}<span>{label}</span>{badge ? <i className="sa-ntf">{badge}</i> : null}</button>
    : null;
  return (
    <div className="sa">
      {/* Top Mobile Bar */}
      <header className="sa-mobile-header">
        <button
          type="button"
          className="sa-mobile-menu-btn"
          aria-label="Toggle navigation menu"
          onClick={() => setMobileMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileMenuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </>
            )}
          </svg>
        </button>

        <div className="sa-mobile-brand">
          <span className="sa-mobile-brand-name">{store}</span>
          <span className="sa-mobile-badge">ADMIN</span>
        </div>

        <div className="sa-mobile-actions">
          <a href="/" target="_blank" rel="noopener noreferrer" className="sa-mobile-view-store" title="View Store">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          {newOrders > 0 && (
            <button
              type="button"
              className="sa-mobile-ntf-pill"
              onClick={() => { setNav('orders'); setMobileMenuOpen(false); }}
              title={`${newOrders} new orders`}
            >
              <span className="sa-pulse-dot" />
              {newOrders} new
            </button>
          )}
        </div>
      </header>

      {/* Drawer Overlay Backdrop */}
      {mobileMenuOpen && (
        <div className="sa-drawer-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Navigation Sidebar / Drawer */}
      <aside className={`sa-side ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="sa-side-header-mob">
          <div className="sa-brand">{store}<em>admin</em></div>
          <button className="sa-side-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="sa-brand sa-brand-desktop">{store}<em>admin</em></div>
        <div className="sa-search-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.4-3.4" /></svg><input placeholder="Search" value={navq} onChange={(e) => setNavq(e.target.value)} /></div>
        <div className="sa-menu-label">Menu</div>
        <nav className="sa-nav">
          {item('dashboard', I.home, 'Home')}
          {item('orders', I.orders, 'Orders', newOrders)}
          {item('scanner', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1.5"/><line x1="7" y1="12" x2="17" y2="12"/></svg>, 'QR Scanner')}
          {item('finance', <FinanceIcon />, 'Finance & Ledger')}
          {item('whatsapp', <WhatsAppIcon size={18} variant="official" className="ci" />, 'WhatsApp Automation')}
          {item('backup', <BackupIcon />, 'Backup & Restore')}
          {item('customers', I.customers, 'Customers')}
          {item('products', I.products, 'Products')}
          {item('categories', I.categories, 'Categories')}
          {item('colors', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci"><circle cx="12" cy="12" r="10"/><path d="M12 2a7 7 0 0 0-7 7c0 3 2 4.5 4 4.5 1 0 2 1 2 2 0 1.5-1 2.5-1 4.5a2 2 0 0 0 2 2 10 10 0 0 0 0-20z"/></svg>, 'Color Palette')}
          {item('landings', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>, 'Landing Pages')}
          {item('media', I.media, 'Media')}
          {item('coupons', I.coupons, 'Coupons')}
          {item('reviews', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/></svg>, 'Customer Reviews')}
          {item('fraud', <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, 'Fraud Detector')}
          {item('staff', I.customers, 'Staff')}
          {item('integrations', I.integrations, 'Integrations')}
          {item('settings', I.settings, 'Settings')}
        </nav>
        <div className="sa-side-foot">
          {me && <div className="sa-who">{me.name} · <span className="dim">{me.role}</span></div>}
          <a onClick={() => { location.href = '/'; }}>↗ View store</a>
          <button onClick={() => { localStorage.removeItem(KEY); setAuthed(false); }}>Log out</button>
        </div>
      </aside>
      <main className="sa-main">
        {cur === 'dashboard' && <Dashboard onNav={setNav} />}
        {cur === 'orders' && <OrdersAdmin />}
        {cur === 'scanner' && <ScannerAdmin />}
        {cur === 'finance' && <FinanceAdmin />}
        {cur === 'whatsapp' && <WhatsAppAdmin />}
        {cur === 'backup' && <BackupAdmin />}
        {cur === 'customers' && <CustomersAdmin />}
        {cur === 'products' && <ProductsAdmin />}
        {cur === 'categories' && <CategoriesAdmin />}
        {cur === 'colors' && <ColorsAdmin />}
        {cur === 'landings' && <LandingsAdmin />}
        {cur === 'media' && <MediaAdmin />}
        {cur === 'coupons' && <CouponsAdmin />}
        {cur === 'reviews' && <ReviewsAdmin />}
        {cur === 'fraud' && <FraudDetectorAdmin />}
        {cur === 'staff' && <StaffAdmin />}
        {cur === 'integrations' && <IntegrationsAdmin />}
        {cur === 'settings' && <SettingsAdmin />}
      </main>

      {/* Fixed Bottom App Navigation Bar */}
      <nav className="sa-bottom-nav" aria-label="Quick mobile navigation">
        <button
          type="button"
          className={`sa-bnav-btn ${cur === 'dashboard' && !mobileMenuOpen ? 'active' : ''}`}
          onClick={() => { setNav('dashboard'); setMobileMenuOpen(false); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`sa-bnav-btn ${cur === 'orders' && !mobileMenuOpen ? 'active' : ''}`}
          onClick={() => { setNav('orders'); setMobileMenuOpen(false); }}
        >
          <div className="sa-bnav-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/>
              <circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
            </svg>
            {newOrders > 0 && <span className="sa-bnav-badge">{newOrders}</span>}
          </div>
          <span>Orders</span>
        </button>

        <button
          type="button"
          className={`sa-bnav-btn ${cur === 'scanner' && !mobileMenuOpen ? 'active' : ''}`}
          onClick={() => { setNav('scanner'); setMobileMenuOpen(false); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
            <rect x="7" y="7" width="10" height="10" rx="1.5"/>
            <line x1="7" y1="12" x2="17" y2="12"/>
          </svg>
          <span>Scan</span>
        </button>

        <button
          type="button"
          className={`sa-bnav-btn ${cur === 'customers' && !mobileMenuOpen ? 'active' : ''}`}
          onClick={() => { setNav('customers'); setMobileMenuOpen(false); }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Customers</span>
        </button>

        <button
          type="button"
          className={`sa-bnav-btn ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="1.5"/>
            <circle cx="19" cy="12" r="1.5"/>
            <circle cx="5" cy="12" r="1.5"/>
          </svg>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}

function Video1OtpVerify({
  tempToken,
  maskedEmail,
  countdown,
  onResend,
  onSuccess,
  onBack,
}: {
  tempToken: string;
  maskedEmail: string;
  countdown: number;
  onResend: () => Promise<void>;
  onSuccess: (token: string, expiresAt?: number) => void;
  onBack: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const [stage, setStage] = useState<'input' | 'floating' | 'imploding' | 'success'>('input');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [authResult, setAuthResult] = useState<{ token: string; expiresAt?: number } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const float3DPositions = [
    { x: -75, y: -45, z: 90, rx: 25, ry: -30 },
    { x: -28, y: -65, z: 65, rx: -20, ry: 25 },
    { x: 30, y: -60, z: 95, rx: 30, ry: -25 },
    { x: 78, y: -40, z: 75, rx: -25, ry: 35 },
    { x: -45, y: 45, z: 80, rx: 20, ry: 40 },
    { x: 50, y: 48, z: 90, rx: -30, ry: -30 },
  ];

  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.9);
      });
    } catch {}
  };

  const handleVerify = async (code: string) => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otp: code }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Verification code is invalid');

      setAuthResult({ token: d.token, expiresAt: d.expiresAt });

      // Step 1: 3D Floating Numbers
      setStage('floating');
      playChime();

      // Step 2: Numbers converge & implode into neon green particle orb
      setTimeout(() => setStage('imploding'), 850);

      // Step 3: Blooms into Success checkmark
      setTimeout(() => setStage('success'), 1600);

      // Auto-continue after 3.2s
      setTimeout(() => {
        onSuccess(d.token, d.expiresAt);
      }, 3400);

    } catch (e: any) {
      setErr(e.message || 'Verification failed');
      setStage('input');
    } finally {
      setBusy(false);
    }
  };

  const applyCode = (raw: string) => {
    const cleaned = String(raw || '').replace(/\D/g, '').slice(0, 6);
    if (!cleaned) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < cleaned.length; i++) {
      next[i] = cleaned[i];
    }
    setDigits(next);
    const targetIdx = Math.min(5, cleaned.length);
    setActiveIdx(targetIdx);
    inputRefs.current[targetIdx]?.focus();
    if (cleaned.length === 6) {
      handleVerify(cleaned);
    }
  };

  const onDigitChange = (idx: number, val: string) => {
    const digitsOnly = val.replace(/\D/g, '');
    if (digitsOnly.length > 1) {
      applyCode(digitsOnly);
      return;
    }
    const char = digitsOnly.slice(-1);
    const next = [...digits];
    next[idx] = char;
    setDigits(next);
    if (char) {
      if (idx < 5) {
        setActiveIdx(idx + 1);
        inputRefs.current[idx + 1]?.focus();
      } else {
        const full = next.join('');
        if (full.length === 6) handleVerify(full);
      }
    }
  };

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[idx] && idx > 0) {
        const next = [...digits];
        next[idx - 1] = '';
        setDigits(next);
        setActiveIdx(idx - 1);
        inputRefs.current[idx - 1]?.focus();
      } else {
        const next = [...digits];
        next[idx] = '';
        setDigits(next);
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      setActiveIdx(idx - 1);
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      setActiveIdx(idx + 1);
      inputRefs.current[idx + 1]?.focus();
    } else if (e.key === 'Enter') {
      const full = digits.join('');
      if (full.length === 6) handleVerify(full);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    applyCode(pasted);
  };

  const handlePasteClipboard = async () => {
    let text = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch {}
    if (!text) {
      text = window.prompt('Paste your 6-digit verification code here (Ctrl+V):') || '';
    }
    applyCode(text);
  };

  const replay = () => {
    setStage('floating');
    playChime();
    setTimeout(() => setStage('imploding'), 850);
    setTimeout(() => setStage('success'), 1600);
  };

  return (
    <div className="v1-card">
      <div className="v1-ambient-glow" />

      {stage === 'input' && (
        <>
          <div className="v1-badge-pill">
            <span className="v1-pulse-dot" />
            <span>Two-Step Verification</span>
          </div>

          <div className="v1-shield-wrapper">
            <div className="v1-shield-aura" />
            <div className="v1-shield-ring" />
            <div className="v1-shield-core">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 8v4" />
                <circle cx="12" cy="16" r="0.8" fill="currentColor" />
              </svg>
            </div>
          </div>

          <h2 className="v1-title">Enter Verification Code</h2>
          <p className="v1-subtitle">
            We've sent a 6-digit security code to
            <span className="v1-email-tag">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {maskedEmail}
            </span>
          </p>

          <div className="v1-inputs-wrap" onPaste={onPaste}>
            {digits.map((d, i) => (
              <div
                key={i}
                className={'v1-digit-box' + (activeIdx === i ? ' active' : '') + (d ? ' filled' : '')}
                onClick={() => {
                  setActiveIdx(i);
                  inputRefs.current[i]?.focus();
                }}
              >
                <input
                  ref={(el) => (inputRefs.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  value={d}
                  autoFocus={i === 0}
                  onFocus={() => setActiveIdx(i)}
                  onChange={(e) => onDigitChange(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  onPaste={onPaste}
                />
                <span className="v1-digit-num">{d}</span>
                {activeIdx === i && !d && <span className="v1-caret" />}
              </div>
            ))}
          </div>

          <div className="v1-quick-actions">
            <button type="button" className="v1-paste-btn" onClick={handlePasteClipboard}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
              Paste code
            </button>
          </div>

          {err && <div className="err2 v1-error-shake" style={{ marginBottom: 14 }}>{err}</div>}

          <button
            className="v1-verify-btn"
            disabled={busy || digits.join('').length !== 6}
            onClick={() => handleVerify(digits.join(''))}
          >
            {busy ? (
              <span className="v1-spinner-label">
                <span className="v1-btn-spinner" /> Verifying…
              </span>
            ) : (
              <span>Verify & Continue →</span>
            )}
          </button>

          <div className="v1-footer-row">
            <a className="v1-back-link" onClick={onBack}>
              ← Back to login
            </a>
            <div className="v1-resend-wrap">
              {countdown > 0 ? (
                <span className="v1-timer-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Resend in {countdown}s
                </span>
              ) : (
                <button type="button" className="v1-resend-active-btn" onClick={onResend}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  Resend code
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {(stage === 'floating' || stage === 'imploding') && (
        <div className="v1-arena-3d">
          {digits.map((d, i) => {
            const pos = float3DPositions[i] || { x: 0, y: 0, z: 0, rx: 0, ry: 0 };
            return (
              <span
                key={i}
                className={'v1-float-num' + (stage === 'imploding' ? ' imploding' : '')}
                style={{
                  transform: stage === 'floating'
                    ? `translate3d(${pos.x}px, ${pos.y}px, ${pos.z}px) rotateX(${pos.rx}deg) rotateY(${pos.ry}deg)`
                    : 'translate3d(0, 0, 0) scale(0)',
                }}
              >
                {d || '•'}
              </span>
            );
          })}

          {stage === 'imploding' && (
            <div className="v1-orb-wrapper">
              <div className="v1-orb-core" />
              <div className="v1-orb-ring-1" />
              <div className="v1-orb-ring-2" />
            </div>
          )}
        </div>
      )}

      {stage === 'success' && (
        <div className="v1-success-wrap">
          <div className="v1-icon-card">
            <svg className="v1-sparkle sp1" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"/></svg>
            <svg className="v1-sparkle sp2" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"/></svg>
            <svg className="v1-sparkle sp3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"/></svg>
            <svg className="v1-sparkle sp4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 34, height: 34 }}>
              <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 40, animation: 'v1CheckDraw 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards' }} />
            </svg>
          </div>

          <h2 className="v1-title" style={{ fontSize: 21 }}>Verified successfully</h2>
          <p className="v1-subtitle" style={{ margin: '0 0 10px' }}>Your identity has been verified.</p>

          <div className="v1-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 15, height: 15 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Verified and secure
          </div>

          <button
            className="v1-continue-btn"
            onClick={() => {
              if (authResult) onSuccess(authResult.token, authResult.expiresAt);
            }}
          >
            Continue
          </button>

          <button className="v1-replay-btn" onClick={replay}>
            REPLAY ANIMATION
          </button>
        </div>
      )}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'login' | 'otp' | 'forgot' | 'reset'>('login');
  const [u, setU] = useState('owner');
  const [p, setP] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [err, setErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Step 1: Submit username + password
  const submitLogin = async () => {
    setErr(''); setSuccessMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Login failed');
      
      // If OTP required, switch to OTP screen
      if (d.otpRequired) {
        setTempToken(d.tempToken);
        setMaskedEmail(d.emailMasked || 'your email');
        setMode('otp');
        setOtp('');
        setCountdown(60);
        return;
      }

      // Direct login if email disabled
      localStorage.setItem(KEY, d.token);
      if (d.expiresAt) localStorage.setItem('dot_admin_exp', String(d.expiresAt));
      onDone();
    } catch (e: any) { setErr(e.message || 'Login failed'); }
    finally { setBusy(false); }
  };

  // Resend OTP
  const resendOtp = async () => {
    if (countdown > 0) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/admin/resend-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tempToken }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to resend code');
      setCountdown(60);
      setSuccessMsg('A new verification code has been sent!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (e: any) { setErr(e.message || 'Resend failed'); }
    finally { setBusy(false); }
  };

  // Forgot password request
  const submitForgot = async () => {
    setErr(''); setSuccessMsg(''); setBusy(true);
    try {
      const r = await fetch('/api/admin/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernameOrEmail: u }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Account not found');
      setResetToken(d.resetToken);
      setMaskedEmail(d.emailMasked);
      setMode('reset');
      setOtp('');
      setNewPassword('');
    } catch (e: any) { setErr(e.message || 'Failed to request password reset'); }
    finally { setBusy(false); }
  };

  // Reset password submit
  const submitReset = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/admin/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resetToken, otp: otp.trim(), newPassword }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed to change password');
      setSuccessMsg('Password updated! Please log in with your new password.');
      setMode('login');
      setP('');
    } catch (e: any) { setErr(e.message || 'Reset failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="sa-login">
      {mode === 'otp' ? (
        <Video1OtpVerify
          tempToken={tempToken}
          maskedEmail={maskedEmail}
          countdown={countdown}
          onResend={resendOtp}
          onBack={() => { setMode('login'); setErr(''); }}
          onSuccess={(token, expiresAt) => {
            localStorage.setItem(KEY, token);
            if (expiresAt) localStorage.setItem('dot_admin_exp', String(expiresAt));
            onDone();
          }}
        />
      ) : (
        <div className="sa-login-card" style={{ maxWidth: 420 }}>
          <div className="sa-brand big">dot<span>.</span><em>admin</em></div>
          
          {mode === 'login' && (
            <>
              <p>Sign in to manage your store.</p>
              <input placeholder="Username" value={u} onChange={(e) => setU(e.target.value)} />
              <input type="password" placeholder="Password" value={p} onChange={(e) => setP(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitLogin()} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '-4px 0 12px' }}>
                <a style={{ fontSize: 12.5, color: '#8b5cf6', cursor: 'pointer', textDecoration: 'none' }} onClick={() => { setMode('forgot'); setErr(''); setSuccessMsg(''); }}>Forgot password?</a>
              </div>
              {err && <div className="err2" style={{ marginBottom: 12 }}>{err}</div>}
              {successMsg && <div style={{ color: '#4ade80', fontSize: 13, marginBottom: 12 }}>{successMsg}</div>}
              <button className="sa-btn full" disabled={busy || !u || !p} onClick={submitLogin}>{busy ? 'Authenticating…' : 'Sign in'}</button>
              <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 14 }}>🔒 48-hour secure sessions with 2FA email verification</p>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Reset Password</h2>
              <p style={{ fontSize: 13.5, color: '#94a3b8', marginBottom: 16 }}>Enter your admin username or email to receive a password reset code.</p>
              <input placeholder="Username or Email" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitForgot()} style={{ marginBottom: 14 }} />
              {err && <div className="err2" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="sa-btn full" disabled={busy || !u} onClick={submitForgot} style={{ marginBottom: 10 }}>{busy ? 'Sending code…' : 'Send Reset Code'}</button>
              <div style={{ marginTop: 12, fontSize: 12.5 }}>
                <a style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={() => { setMode('login'); setErr(''); }}>← Back to login</a>
              </div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Set New Password</h2>
              <p style={{ fontSize: 13.5, color: '#94a3b8', marginBottom: 14 }}>Enter the 6-digit code sent to <b style={{ color: '#e2e8f0' }}>{maskedEmail}</b> and your new password.</p>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit reset code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                style={{ marginBottom: 10, textAlign: 'center', letterSpacing: 4, fontWeight: 600 }}
              />
              <input
                type="password"
                placeholder="New password (min 4 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitReset()}
                style={{ marginBottom: 14 }}
              />
              {err && <div className="err2" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="sa-btn full" disabled={busy || otp.length !== 6 || newPassword.length < 4} onClick={submitReset} style={{ marginBottom: 10 }}>{busy ? 'Updating…' : 'Update Password'}</button>
              <div style={{ marginTop: 12, fontSize: 12.5 }}>
                <a style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={() => { setMode('login'); setErr(''); }}>← Back to login</a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const FinanceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci">
    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
  </svg>
);
const BackupIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="ci">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

function Dashboard({ onNav }: { onNav?: (tab: string) => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [period, setPeriod] = useState<'today' | 'yesterday' | '7d' | 'this_month' | 'all'>('7d');
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue');
  const [sel, setSel] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const load = (silent = false) => {
    aFetch('/orders')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setOrders(Array.isArray(d) ? d : []))
      .catch(() => { if (!silent) setOrders([]); });
    fetch('/api/products')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => { if (!silent) setProducts([]); });
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 5000);
    const onOrdersUpdated = () => load(true);
    window.addEventListener('admin-orders-updated', onOrdersUpdated);
    return () => {
      clearInterval(t);
      window.removeEventListener('admin-orders-updated', onOrdersUpdated);
    };
  }, []);

  // Time period filtering
  const filteredOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    const now = new Date();
    return list.filter((o) => {
      const d = new Date(o.createdAt);
      if (period === 'today') {
        return d.toDateString() === now.toDateString();
      }
      if (period === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return d.toDateString() === y.toDateString();
      }
      if (period === '7d') {
        return now.getTime() - d.getTime() <= 7 * 86400000;
      }
      if (period === 'this_month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true; // 'all'
    });
  }, [orders, period]);

  // Operational Funnel Counts
  const funnel = useMemo(() => {
    const pending = filteredOrders.filter((o) => o.status === 'pending' || o.status === 'incomplete').length;
    const confirmed = filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'approved').length;
    const transit = filteredOrders.filter((o) => ['shipped', 'hold'].includes(o.status)).length;
    const delivered = filteredOrders.filter((o) => o.status === 'delivered').length;
    const returns = filteredOrders.filter((o) => o.status === 'return').length;
    const cancelled = filteredOrders.filter((o) => o.status === 'cancelled').length;
    return { pending, confirmed, transit, delivered, returns, cancelled, total: filteredOrders.length };
  }, [filteredOrders]);

  // Executive Financial Metrics
  const deliveredOrders = useMemo(() => filteredOrders.filter((o) => o.status === 'delivered'), [filteredOrders]);
  const deliveredRevenue = useMemo(() => deliveredOrders.reduce((s, o) => s + o.total, 0), [deliveredOrders]);

  const inTransitOrders = useMemo(() => filteredOrders.filter((o) => ['shipped', 'hold'].includes(o.status)), [filteredOrders]);
  const inTransitRevenue = useMemo(() => inTransitOrders.reduce((s, o) => s + o.total, 0), [inTransitOrders]);

  const activeOrders = useMemo(() => filteredOrders.filter((o) => o.status !== 'cancelled'), [filteredOrders]);
  const grossSales = useMemo(() => activeOrders.reduce((s, o) => s + o.total, 0), [activeOrders]);

  const pendingCount = useMemo(() => filteredOrders.filter((o) => o.status === 'pending' || o.status === 'incomplete').length, [filteredOrders]);

  const completed = useMemo(() => filteredOrders.filter((o) => ['delivered', 'cancelled', 'return'].includes(o.status)), [filteredOrders]);
  const successRate = useMemo(() => {
    if (!completed.length) return deliveredOrders.length > 0 ? 100 : null;
    return Math.round((deliveredOrders.length / completed.length) * 100);
  }, [completed, deliveredOrders]);

  const aov = useMemo(() => (activeOrders.length ? Math.round(grossSales / activeOrders.length) : 0), [activeOrders, grossSales]);

  const lostOrders = useMemo(() => filteredOrders.filter((o) => ['cancelled', 'return'].includes(o.status)), [filteredOrders]);
  const lostAmount = useMemo(() => lostOrders.reduce((s, o) => s + o.total, 0), [lostOrders]);

  const lowStockProducts = useMemo(() => (Array.isArray(products) ? products : []).filter((p) => p.stock != null && p.stock <= 5 && !p.soldOut), [products]);

  // Dynamic Chart Generation
  const chartDays = useMemo(() => {
    const daysCount = period === 'today' || period === 'yesterday' ? 1 : period === 'this_month' ? 30 : 7;
    const days: { label: string; rev: number; count: number }[] = [];
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayOrders = activeOrders.filter((o) => (o.createdAt || '').slice(0, 10) === key);
      const rev = dayOrders.reduce((s, o) => s + o.total, 0);
      days.push({
        label: d.toLocaleDateString('en-GB', { day: 'numeric', month: daysCount > 7 ? 'numeric' : undefined }),
        rev,
        count: dayOrders.length,
      });
    }
    return days;
  }, [activeOrders, period]);

  const maxChartVal = useMemo(() => {
    if (chartMetric === 'orders') return Math.max(1, ...chartDays.map((d) => d.count));
    return Math.max(1, ...chartDays.map((d) => d.rev));
  }, [chartDays, chartMetric]);

  const peakDay = useMemo(() => {
    if (!chartDays.length) return null;
    return chartDays.reduce((max, d) => (d.rev > max.rev ? d : max), chartDays[0]);
  }, [chartDays]);

  const avgDailyRev = useMemo(() => {
    if (!chartDays.length) return 0;
    const total = chartDays.reduce((s, d) => s + d.rev, 0);
    return Math.round(total / chartDays.length);
  }, [chartDays]);

  // Sales Channel & Ad Attribution
  const channelStats = useMemo(() => {
    const map: Record<string, { label: string; rev: number; count: number }> = {};
    activeOrders.forEach((o) => {
      const src = originLabel(o.source);
      if (!map[src]) map[src] = { label: src, rev: 0, count: 0 };
      map[src].rev += o.total;
      map[src].count++;
    });
    const list = Object.values(map).sort((a, b) => b.rev - a.rev);
    return list;
  }, [activeOrders]);

  // Logistics & Courier Performance
  const courierBreakdown = useMemo(() => {
    const map: Record<string, { name: string; total: number; delivered: number; transit: number; rev: number }> = {};
    filteredOrders.forEach((o) => {
      const name = o.courier?.name || 'Unassigned';
      if (!map[name]) map[name] = { name, total: 0, delivered: 0, transit: 0, rev: 0 };
      map[name].total++;
      if (o.status === 'delivered') map[name].delivered++;
      if (['shipped', 'hold'].includes(o.status)) map[name].transit++;
      if (o.status !== 'cancelled') map[name].rev += o.total;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredOrders]);

  // Top Selling Products
  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; rev: number; image?: string }> = {};
    activeOrders.forEach((o) => {
      (o.items || []).forEach((it: any) => {
        if (!map[it.name]) map[it.name] = { name: it.name, qty: 0, rev: 0, image: it.image };
        map[it.name].qty += it.qty || 1;
        map[it.name].rev += it.subtotal || (it.price * (it.qty || 1));
      });
    });
    return Object.values(map).sort((a, b) => b.rev - a.rev).slice(0, 5);
  }, [activeOrders]);

  return (
    <>
      {/* Top Header with Date Period Switcher & Live Indicator */}
      <div className="sa-top" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0 }}>Executive Business Dashboard</h1>
            <span className="sa-live-badge"><span className="pulse-dot" /> Live Data</span>
          </div>
          <p className="dim small" style={{ margin: '4px 0 0' }}>
            Real-time cash flow, delivery pipeline, marketing channels &amp; warehouse intelligence
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="sa-period-tabs">
            <button className={period === 'today' ? 'on' : ''} onClick={() => setPeriod('today')}>Today</button>
            <button className={period === 'yesterday' ? 'on' : ''} onClick={() => setPeriod('yesterday')}>Yesterday</button>
            <button className={period === '7d' ? 'on' : ''} onClick={() => setPeriod('7d')}>7 Days</button>
            <button className={period === 'this_month' ? 'on' : ''} onClick={() => setPeriod('this_month')}>This Month</button>
            <button className={period === 'all' ? 'on' : ''} onClick={() => setPeriod('all')}>All Time</button>
          </div>
          <button className="sa-btn small" onClick={() => load()} title="Reload latest data">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Real-time Order Pipeline Funnel */}
      <div className="dash-funnel-strip">
        <div className="dash-funnel-card f-pending" onClick={() => onNav?.('orders')} title="Click to view pending orders">
          <div className="dash-funnel-top">
            <span className="dash-funnel-icon">🟡</span>
            <span className="dash-funnel-count" style={{ color: '#fbbf24' }}>{funnel.pending}</span>
          </div>
          <div className="dash-funnel-label">Pending Orders</div>
          <div className="dash-funnel-sub">Needs call &amp; approval</div>
        </div>

        <div className="dash-funnel-card f-confirmed" onClick={() => onNav?.('orders')} title="Click to view approved orders">
          <div className="dash-funnel-top">
            <span className="dash-funnel-icon">🔵</span>
            <span className="dash-funnel-count" style={{ color: '#60a5fa' }}>{funnel.confirmed}</span>
          </div>
          <div className="dash-funnel-label">Approved &amp; Ready</div>
          <div className="dash-funnel-sub">Ready to pack &amp; book</div>
        </div>

        <div className="dash-funnel-card f-transit" onClick={() => onNav?.('orders')} title="Click to view shipped orders">
          <div className="dash-funnel-top">
            <span className="dash-funnel-icon">🚚</span>
            <span className="dash-funnel-count" style={{ color: '#a78bfa' }}>{funnel.transit}</span>
          </div>
          <div className="dash-funnel-label">In Courier Transit</div>
          <div className="dash-funnel-sub">Shipped with rider</div>
        </div>

        <div className="dash-funnel-card f-delivered" onClick={() => onNav?.('orders')} title="Click to view delivered orders">
          <div className="dash-funnel-top">
            <span className="dash-funnel-icon">🟢</span>
            <span className="dash-funnel-count" style={{ color: '#34d399' }}>{funnel.delivered}</span>
          </div>
          <div className="dash-funnel-label">Delivered Orders</div>
          <div className="dash-funnel-sub">Cash safely collected</div>
        </div>

        <div className="dash-funnel-card f-return" onClick={() => onNav?.('orders')} title="Click to view return orders">
          <div className="dash-funnel-top">
            <span className="dash-funnel-icon">🔄</span>
            <span className="dash-funnel-count" style={{ color: '#fb7185' }}>{funnel.returns}</span>
          </div>
          <div className="dash-funnel-label">Returns Received</div>
          <div className="dash-funnel-sub">Returned parcels</div>
        </div>

        <div className="dash-funnel-card f-cancelled" onClick={() => onNav?.('orders')} title="Click to view cancelled orders">
          <div className="dash-funnel-top">
            <span className="dash-funnel-icon">❌</span>
            <span className="dash-funnel-count" style={{ color: '#94a3b8' }}>{funnel.cancelled}</span>
          </div>
          <div className="dash-funnel-label">Cancelled Orders</div>
          <div className="dash-funnel-sub">Rejected / cancelled</div>
        </div>
      </div>

      {/* 6 Executive Financial Stat Cards */}
      <div className="sa-exec-grid">
        {/* Delivered / Realized Cash */}
        <div className="sa-exec-card card-delivered">
          <div className="exec-card-head">
            <span className="exec-card-title">Realized Revenue</span>
            <span className="exec-card-pill p-delivered">Cash Collected</span>
          </div>
          <div className="exec-card-val" style={{ color: '#34d399' }}>{taka(deliveredRevenue)}</div>
          <div className="exec-card-sub">{deliveredOrders.length} orders safely delivered &amp; collected</div>
        </div>

        {/* In Courier Transit */}
        <div className="sa-exec-card card-transit">
          <div className="exec-card-head">
            <span className="exec-card-title">Pipeline Cash</span>
            <span className="exec-card-pill p-transit">In Transit</span>
          </div>
          <div className="exec-card-val" style={{ color: '#60a5fa' }}>{taka(inTransitRevenue)}</div>
          <div className="exec-card-sub">{inTransitOrders.length} parcels currently with courier</div>
        </div>

        {/* Gross Sales */}
        <div className="sa-exec-card card-gross">
          <div className="exec-card-head">
            <span className="exec-card-title">Gross Sales</span>
            <span className="exec-card-pill p-gross">Active Demand</span>
          </div>
          <div className="exec-card-val" style={{ color: '#c4b5fd' }}>{taka(grossSales)}</div>
          <div className="exec-card-sub">{activeOrders.length} active orders placed in period</div>
        </div>

        {/* Delivery Success Rate */}
        <div className="sa-exec-card card-rate">
          <div className="exec-card-head">
            <span className="exec-card-title">Delivery Success Rate</span>
            <span className="exec-card-pill p-rate">{successRate == null ? 'Pending' : successRate >= 75 ? 'Optimal' : 'Needs Focus'}</span>
          </div>
          <div className="exec-card-val" style={{ color: successRate == null ? '#94a3b8' : successRate >= 75 ? '#2dd4bf' : successRate >= 50 ? '#fbbf24' : '#f87171' }}>
            {successRate == null ? 'No data' : `${successRate}%`}
          </div>
          {successRate != null && (
            <div className="rate-mini-bar">
              <div className="rate-mini-bar-fill" style={{ width: `${successRate}%` }} />
            </div>
          )}
          <div className="exec-card-sub" style={{ marginTop: 6 }}>
            {completed.length ? `${deliveredOrders.length} delivered · ${lostOrders.length} lost/returned` : 'Awaiting completed shipments'}
          </div>
        </div>

        {/* Average Order Value */}
        <div className="sa-exec-card card-aov">
          <div className="exec-card-head">
            <span className="exec-card-title">Avg Order Value (AOV)</span>
            <span className="exec-card-pill p-aov">Cart Basket</span>
          </div>
          <div className="exec-card-val" style={{ color: '#818cf8' }}>{taka(aov)}</div>
          <div className="exec-card-sub">Average cart value per buying customer</div>
        </div>

        {/* Lost / Return & Cancel */}
        <div className="sa-exec-card card-loss">
          <div className="exec-card-head">
            <span className="exec-card-title">Lost Sales</span>
            <span className="exec-card-pill p-loss">Cancel / Return</span>
          </div>
          <div className="exec-card-val" style={{ color: '#f87171' }}>{taka(lostAmount)}</div>
          <div className="exec-card-sub">{lostOrders.length} orders cancelled or returned</div>
        </div>
      </div>

      {/* Row 2: Sales Trend Chart & Sales Channel Attribution */}
      <div className="dash-section-head">
        <div className="dash-section-title">📊 Revenue &amp; Channel Attribution</div>
      </div>
      <div className="dash-grid-2">
        {/* Interactive Chart */}
        <div className="sa-card">
          <div className="sa-card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Sales &amp; Order Volume Trend</h2>
            <div style={{ display: 'flex', gap: 6, background: '#181624', padding: 2, borderRadius: 8 }}>
              <button className={'chart-mode-btn' + (chartMetric === 'revenue' ? ' on' : '')} onClick={() => setChartMetric('revenue')}>
                Revenue (৳)
              </button>
              <button className={'chart-mode-btn' + (chartMetric === 'orders' ? ' on' : '')} onClick={() => setChartMetric('orders')}>
                Orders
              </button>
            </div>
          </div>
          <div className="chart" style={{ height: 210 }}>
            {chartDays.map((d, i) => {
              const currentVal = chartMetric === 'orders' ? d.count : d.rev;
              const fillPct = Math.round((currentVal / maxChartVal) * 100);
              return (
                <div className="bar" key={i}>
                  <div className="barwrap" title={`${d.label}: ${taka(d.rev)} (${d.count} orders)`}>
                    <div className="barfill" style={{ height: Math.max(3, fillPct) + '%' }} />
                  </div>
                  <span>{d.label}</span>
                </div>
              );
            })}
          </div>
          <div className="chart-summary-footer">
            <div className="chart-summary-stat">
              <span>Peak Day:</span> <strong>{peakDay ? `${peakDay.label} (${taka(peakDay.rev)})` : 'N/A'}</strong>
            </div>
            <div className="chart-summary-stat">
              <span>Daily Avg:</span> <strong>{taka(avgDailyRev)}</strong>
            </div>
            <div className="chart-summary-stat">
              <span>Period Volume:</span> <strong>{activeOrders.length} orders</strong>
            </div>
          </div>
        </div>

        {/* Sales by Traffic / Ad Source */}
        <div className="sa-card">
          <div className="sa-card-h">
            <h2>Traffic &amp; Ad Attribution</h2>
          </div>
          <div className="channel-list">
            {channelStats.length === 0 && <div className="sa-empty">No channel data in this period.</div>}
            {channelStats.map((ch) => {
              const pct = grossSales > 0 ? Math.round((ch.rev / grossSales) * 100) : 0;
              return (
                <div className="channel-item" key={ch.label}>
                  <div className="channel-row-top">
                    <span><b>{ch.label}</b> · {ch.count} order{ch.count !== 1 ? 's' : ''}</span>
                    <span className="mono">{taka(ch.rev)} ({pct}%)</span>
                  </div>
                  <div className="channel-bar-bg">
                    <div className="channel-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Courier Logistics & Top Products / Inventory Alerts */}
      <div className="dash-section-head">
        <div className="dash-section-title">🚚 Logistics &amp; Product Intelligence</div>
        {onNav && (
          <button className="sa-btn small" onClick={() => onNav('scanner')}>
            📦 Open QR Scanner →
          </button>
        )}
      </div>
      <div className="dash-grid-2">
        {/* Courier Performance Card */}
        <div className="sa-card">
          <div className="sa-card-h">
            <h2>Courier Delivery Breakdown</h2>
          </div>
          <div className="courier-breakdown-list">
            {courierBreakdown.length === 0 && <div className="sa-empty">No shipments in this period.</div>}
            {courierBreakdown.map((c) => (
              <div className="courier-b-row" key={c.name}>
                <div>
                  <b style={{ color: '#fff', fontSize: 13.5 }}>{c.name}</b>
                  <div className="dim small" style={{ marginTop: 2 }}>
                    {c.total} shipment{c.total !== 1 ? 's' : ''} · {c.delivered} delivered · {c.transit} in transit
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ color: '#34d399', fontWeight: 600 }}>{taka(c.rev)}</div>
                  <div className="dim small">{c.total ? Math.round((c.delivered / c.total) * 100) : 0}% success</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Selling Products & Low Stock Warnings */}
        <div className="sa-card">
          <div className="sa-card-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Products &amp; Stock Health</h2>
            {lowStockProducts.length > 0 && (
              <span className="stock-pill-low">⚠️ {lowStockProducts.length} Low Stock</span>
            )}
          </div>
          <div className="stock-alert-box">
            {lowStockProducts.length > 0 && (
              <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', marginBottom: 6 }}>
                  Critical Inventory Warnings
                </div>
                {lowStockProducts.slice(0, 3).map((p) => (
                  <div className="stock-alert-item" key={p.id}>
                    <span style={{ color: '#fecdd3' }}>{p.name}</span>
                    <span className="stock-pill-low">Only {p.stock} left</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
              Top Selling Products
            </div>
            {topProducts.length === 0 && <div className="sa-empty">No sales in this period.</div>}
            {topProducts.map((p) => (
              <div className="stock-alert-item" key={p.name}>
                <span>{p.name} <span className="dim small">({p.qty} sold)</span></span>
                <span className="mono" style={{ color: '#a78bfa', fontWeight: 600 }}>{taka(p.rev)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Recent Orders Table (Clickable to open Order Modal) */}
      <div className="dash-section-head">
        <div className="dash-section-title">📋 Recent Orders Activity</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="sa-btn small primary"
            onClick={() => setShowCreateModal(true)}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              border: 'none',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              cursor: 'pointer'
            }}
          >
            ➕ নতুন অর্ডার (Phone / WhatsApp)
          </button>
          {onNav && (
            <button className="sa-btn small" onClick={() => onNav('orders')}>
              View All Orders ({orders.length}) →
            </button>
          )}
        </div>
      </div>
      <div className="sa-card">
        <table className="sa-table rows">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Origin</th>
              <th>Courier</th>
              <th>Status</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.slice(0, 8).map((o) => (
              <tr key={o.id} onClick={() => setSel(o)} style={{ cursor: 'pointer' }}>
                <td className="mono" style={{ fontWeight: 600 }}>{o.id}</td>
                <td className="dim small">{ago(o.createdAt)}</td>
                <td>
                  <b>{o.customer.name}</b>
                  <div className="dim small">{o.customer.phone}</div>
                </td>
                <td><span className="sa-tag-source">🌐 {originLabel(o.source)}</span><div className="dim small" style={{ marginTop: 4 }}>Channel: {o.attribution?.channel || 'Untracked'}</div>{o.attribution?.medium && <div className="dim small">Medium: {o.attribution.medium}</div>}</td>
                <td>
                  {o.courier?.name ? (
                    <span>{o.courier.name}{o.courier.consignment ? ` #${o.courier.consignment}` : ''}</span>
                  ) : (
                    <span className="dim">Unassigned</span>
                  )}
                </td>
                <td><Badge s={o.status} /></td>
                <td className="r mono" style={{ fontWeight: 700 }}>{taka(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOrders.length === 0 && <div className="sa-empty">No orders found for this period.</div>}
      </div>

      {/* Create Order Modal & Order Modal Drawer */}
      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newOrder) => {
            setShowCreateModal(false);
            window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: newOrder }));
            load(true);
            setSel(newOrder);
          }}
        />
      )}
      {sel && <OrderDrawer o={sel} orders={orders} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(true); }} />}
    </>
  );
}

const cleanItemDisplay = (item: any) => {
  if (!item) return { title: 'Product', variant: '', qty: 1 };
  const raw = String(item.name || item.title || '').trim();
  const qty = item.qty || item.quantity || 1;

  let title = raw;
  let variant = String(item.variantTitle || item.variant || '').trim();

  // If title has separator "—" or " - ", split title and variant
  if (!variant && (raw.includes('—') || raw.includes(' - '))) {
    const parts = raw.split(/\s*[-—]\s*/);
    title = parts[0].trim();
    variant = parts.slice(1).join(' · ').trim();
  }

  // Remove repetitive parenthetical text from title
  if (title.includes('(')) {
    const cleaned = title.replace(/\(.*?\)/g, '').trim();
    if (cleaned.length > 2) title = cleaned;
  }

  // Clean variant text from redundant parentheses
  if (variant.includes('(')) {
    const m = variant.match(/\(([\w\.\s\"\'\-]+)\)/);
    if (m && m[1].length < 25) {
      variant = m[1].trim();
    } else {
      const cleanedV = variant.replace(/\(.*?\)/g, '').trim();
      if (cleanedV.length > 1) variant = cleanedV;
    }
  }

  return { title: title || raw, variant, qty };
};

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'delivered':
      return { bg: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'rgba(16, 185, 129, 0.35)', dot: '#10b981' };
    case 'shipped':
      return { bg: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd', border: 'rgba(139, 92, 246, 0.35)', dot: '#8b5cf6' };
    case 'confirmed':
      return { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.35)', dot: '#0ea5e9' };
    case 'cancelled':
      return { bg: 'rgba(244, 63, 94, 0.15)', color: '#f87171', border: 'rgba(244, 63, 94, 0.35)', dot: '#ef4444' };
    case 'pending':
      return { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.35)', dot: '#f59e0b' };
    case 'incomplete':
      return { bg: 'rgba(251, 146, 60, 0.15)', color: '#fb923c', border: 'rgba(251, 146, 60, 0.35)', dot: '#f97316' };
    default:
      return { bg: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', border: 'rgba(255, 255, 255, 0.15)', dot: '#64748b' };
  }
};

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: (newOrder: any) => void }) {
  const [source, setSource] = useState<'phone_call' | 'whatsapp' | 'facebook' | 'manual'>('phone_call');
  const [status, setStatus] = useState('confirmed');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [thana, setThana] = useState('');
  const [area, setArea] = useState<'inside' | 'outside'>('outside');
  const [note, setNote] = useState('');
  const [adminNote, setAdminNote] = useState('');

  // Products
  const [catalog, setCatalog] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([
    {
      id: 'pmv7bramh',
      name: 'ম্যাজিক লাভ লক কনডম (৬.৭ ইঞ্চি)',
      price: 999,
      qty: 1,
      image: '/landing/package-6-7.jpg',
    }
  ]);
  const [selectedCatalogId, setSelectedCatalogId] = useState('');

  // Pricing
  const [delivery, setDelivery] = useState(0); // Free delivery default for landing promo
  const [discount, setDiscount] = useState(0);

  // Fraud check
  const [fraud, setFraud] = useState<any>(null);
  const [fraudLoading, setFraudLoading] = useState(false);
  const [fraudMsg, setFraudMsg] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCatalog(data);
      })
      .catch(() => {});
  }, []);

  const handleAddressChange = (val: string) => {
    setAddress(val);
    const d = detectDistrict(val);
    if (d && !district) {
      setDistrict(d);
      setArea(d.toLowerCase() === 'dhaka' ? 'inside' : 'outside');
    }
  };

  const runFraudCheck = async () => {
    const clean = phone.trim().replace(/\D/g, '');
    if (!clean || clean.length < 11) {
      setFraudMsg('সঠিক ১১ ডিজিটের ফোন নম্বর দিন');
      return;
    }
    setFraudLoading(true);
    setFraudMsg('কুরিয়ার ডেলিভারি হিস্ট্রি চেক করা হচ্ছে...');
    setFraud(null);
    try {
      const res = await aFetch('/fraud-check?phone=' + encodeURIComponent(clean));
      if (res.ok) {
        const data = await res.json();
        setFraud(data);
        setFraudMsg('');
      } else {
        setFraudMsg('কুরিয়ার হিস্ট্রি পাওয়া যায়নি');
      }
    } catch {
      setFraudMsg('কানেকশন সমস্যা');
    } finally {
      setFraudLoading(false);
    }
  };

  const handleAddPreset = (presetItem: any) => {
    setItems((prev) => [...prev, { ...presetItem }]);
  };

  const handleAddCatalogProduct = () => {
    if (!selectedCatalogId) return;
    const prod = catalog.find((p) => p.id === selectedCatalogId);
    if (!prod) return;
    setItems((prev) => [
      ...prev,
      {
        id: prod.id,
        name: prod.name,
        price: prod.price,
        qty: 1,
        image: prod.image || (Array.isArray(prod.images) ? prod.images[0] : ''),
      }
    ]);
    setSelectedCatalogId('');
  };

  const handleUpdateItem = (index: number, patch: any) => {
    setItems((prev) => prev.map((it, idx) => (idx === index ? { ...it, ...patch } : it)));
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const computedItemsTotal = items.reduce((s, it) => s + (Number(it.price || 0) * Math.max(1, Number(it.qty || 1))), 0);
  const grandTotal = Math.max(0, computedItemsTotal + Number(delivery || 0) - Number(discount || 0));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const clean = phone.trim().replace(/\D/g, '');
    if (!clean || clean.length < 11) {
      setError('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন');
      return;
    }
    if (items.length === 0) {
      setError('কমপক্ষে একটি পণ্য সিলেক্ট করুন');
      return;
    }
    setBusy(true);
    try {
      const res = await aFetch('/admin/orders', {
        method: 'POST',
        body: JSON.stringify({
          source,
          status,
          customer: {
            name: name.trim() || 'Phone Customer',
            phone: clean,
            address: address.trim(),
            district: district.trim(),
            thana: thana.trim(),
            area,
            note: note.trim(),
          },
          adminNote: adminNote.trim(),
          items,
          delivery,
          discount,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'অর্ডার তৈরি করতে সমস্যা হয়েছে');
      }
      const newOrder = await res.json();
      onCreated(newOrder);
    } catch (err: any) {
      setError(err.message || 'অর্ডার তৈরি করতে সমস্যা হয়েছে');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sa-modal-wrap" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="sa-modal" style={{ width: 'min(760px, 96%)', maxHeight: '92vh', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="sa-modal-h" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🛍️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, color: '#fff' }}>নতুন অর্ডার তৈরি করুন (Manual / Phone / WhatsApp)</h3>
              <div className="dim small" style={{ marginTop: 2 }}>ফোনে বা হোয়াটসঅ্যাপে আসা অর্ডার সরাসরি সিস্টেমে এন্ট্রি করুন</div>
            </div>
          </div>
          <button className="sa-btn-subtle" onClick={onClose} style={{ fontSize: 20, color: '#94a3b8', padding: '4px 10px', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
          <div className="sa-modal-b" style={{ padding: '20px 24px', overflowY: 'auto', gap: 18 }}>
            {error && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                ⚠️ {error}
              </div>
            )}

            {/* 1. Order Source Selection */}
            <div>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'block' }}>
                অর্ডারের উৎস (Order Source)
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { key: 'phone_call', icon: <span style={{ fontSize: 13 }}>📞</span>, label: 'ফোন কল (Phone Call)', color: '#3b82f6' },
                  { key: 'whatsapp', icon: <WhatsAppIcon size={16} variant="official" />, label: 'হোয়াটসঅ্যাপ (WhatsApp)', color: '#25D366' },
                  { key: 'facebook', icon: <span style={{ fontSize: 13 }}>📘</span>, label: 'ফেসবুক মেসেঞ্জার (Facebook)', color: '#6366f1' },
                  { key: 'manual', icon: <span style={{ fontSize: 13 }}>🛍️</span>, label: 'ডিরেক্ট / ম্যানুয়াল (Manual)', color: '#8b5cf6' },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSource(s.key as any)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: source === s.key ? `2px solid ${s.color}` : '1px solid rgba(255,255,255,0.12)',
                      background: source === s.key ? 'rgba(255,255,255,0.12)' : '#181624',
                      color: source === s.key ? '#ffffff' : '#94a3b8',
                      fontWeight: source === s.key ? 700 : 500,
                      cursor: 'pointer',
                      fontSize: 13,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {s.icon}
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Customer Information */}
            <div style={{ background: '#181624', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>👤</span> কাস্টমার তথ্য (Customer Details)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>গ্রাহকের নাম</label>
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>মোবাইল নম্বর <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="tel"
                      required
                      placeholder="01XXXXXXXXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <button
                      type="button"
                      className="sa-btn secondary"
                      onClick={runFraudCheck}
                      disabled={fraudLoading || phone.length < 11}
                      title="কুরিয়ার ডেলিভারি সাকসেস হিস্ট্রি চেক করুন"
                      style={{ whiteSpace: 'nowrap', fontSize: 12, padding: '0 10px' }}
                    >
                      {fraudLoading ? 'Checking…' : '🔍 চেক হিস্ট্রি'}
                    </button>
                  </div>
                </div>
              </div>

              {fraudMsg && (
                <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>ℹ {fraudMsg}</div>
              )}
              {fraud && (
                <div style={{ marginBottom: 14 }}>
                  <MultiCourierFraudReport fraud={fraud} />
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>সম্পূর্ণ ডেলিভারি ঠিকানা</label>
                <textarea
                  placeholder="রোড, বাড়ি, এলাকা বা থানা ও জেলার নাম লিখুন..."
                  rows={2}
                  value={address}
                  onChange={(e) => handleAddressChange(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>জেলা (District)</label>
                  <input
                    type="text"
                    placeholder="e.g. Dhaka, Chittagong"
                    value={district}
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      if (e.target.value.toLowerCase() === 'dhaka') setArea('inside');
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>থানা / উপজেলা (Thana)</label>
                  <input
                    type="text"
                    placeholder="e.g. Mirpur, Sadar"
                    value={thana}
                    onChange={(e) => setThana(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>ডেলিভারি এরিয়া</label>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => { setArea('inside'); setDelivery(60); }}
                      style={{
                        flex: 1,
                        padding: '8px 6px',
                        borderRadius: 6,
                        border: area === 'inside' ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                        background: area === 'inside' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: area === 'inside' ? '#93c5fd' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      ঢাকা (৳৬০)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setArea('outside'); setDelivery(120); }}
                      style={{
                        flex: 1,
                        padding: '8px 6px',
                        borderRadius: 6,
                        border: area === 'outside' ? '1.5px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                        background: area === 'outside' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        color: area === 'outside' ? '#93c5fd' : '#94a3b8',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      ঢাকার বাইরে (৳১২০)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Items Selection */}
            <div style={{ background: '#181624', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>📦 পণ্যের তালিকা (Products)</span>
                <span style={{ fontSize: 12, color: '#a78bfa' }}>{items.length} item(s)</span>
              </div>

              {/* Quick Preset Buttons for Love Lock */}
              <div style={{ marginBottom: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: '#94a3b8', alignSelf: 'center', marginRight: 4 }}>কুইক অ্যাড:</span>
                {[
                  { id: 'lovelock-6-7', name: 'লাভ লক ম্যাজিক কনডম (৬.৭ ইঞ্চি)', price: 999, image: '/landing/package-6-7.jpg' },
                  { id: 'lovelock-5-7', name: 'লাভ লক ম্যাজিক কনডম (৫.৭ ইঞ্চি)', price: 999, image: '/landing/package-5-7.jpg' },
                  { id: 'lovelock-combo-2', name: 'লাভ লক ২ পিস স্পেশাল কম্বো', price: 1799, image: '/landing/banner-product.png' },
                ].map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="sa-btn-subtle"
                    onClick={() => handleAddPreset(p)}
                    style={{ fontSize: 11.5, padding: '4px 10px', background: 'rgba(255,255,255,0.06)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    + {p.name} ({taka(p.price)})
                  </button>
                ))}
              </div>

              {/* Items List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: '#13111c',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.06)'
                    }}
                  >
                    {it.image && (
                      <img src={it.image} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input
                        type="text"
                        value={it.name}
                        onChange={(e) => handleUpdateItem(idx, { name: e.target.value })}
                        style={{ background: 'transparent', border: 'none', padding: 0, fontWeight: 600, fontSize: 13, color: '#f1f5f9' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>মূল্য: ৳</span>
                      <input
                        type="number"
                        value={it.price}
                        onChange={(e) => handleUpdateItem(idx, { price: Number(e.target.value) || 0 })}
                        style={{ width: 80, padding: '4px 8px', fontSize: 13, textAlign: 'right' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>পরিমাণ:</span>
                      <input
                        type="number"
                        min="1"
                        value={it.qty}
                        onChange={(e) => handleUpdateItem(idx, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        style={{ width: 55, padding: '4px 6px', fontSize: 13, textAlign: 'center' }}
                      />
                    </div>
                    <span style={{ width: 75, textAlign: 'right', fontWeight: 700, color: '#34d399', fontSize: 13.5 }}>
                      {taka((it.price || 0) * (it.qty || 1))}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: 4 }}
                      title="Remove"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>

              {/* Add from Store Catalog */}
              {catalog.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={selectedCatalogId}
                    onChange={(e) => setSelectedCatalogId(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">-- ক্যাটালগ থেকে অন্য কোনো পণ্য যোগ করুন --</option>
                    {catalog.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {taka(p.price)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="sa-btn secondary"
                    disabled={!selectedCatalogId}
                    onClick={handleAddCatalogProduct}
                  >
                    + Add Product
                  </button>
                </div>
              )}
            </div>

            {/* 4. Pricing Calculation */}
            <div style={{ background: '#181624', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                💰 মূল্য ও চার্জ হিসাব (Pricing Summary)
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                  <span>পণ্যের মোট মূল্য (Items Subtotal):</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{taka(computedItemsTotal)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#94a3b8' }}>ডেলিভারি চার্জ:</span>
                    <button type="button" className="sa-btn-subtle" onClick={() => setDelivery(0)} style={{ fontSize: 11, padding: '2px 6px', background: delivery === 0 ? '#10b981' : 'rgba(255,255,255,0.06)', color: '#fff' }}>ফ্রি (৳০)</button>
                    <button type="button" className="sa-btn-subtle" onClick={() => setDelivery(60)} style={{ fontSize: 11, padding: '2px 6px', background: delivery === 60 ? '#3b82f6' : 'rgba(255,255,255,0.06)', color: '#fff' }}>ঢাকা (৳৬০)</button>
                    <button type="button" className="sa-btn-subtle" onClick={() => setDelivery(120)} style={{ fontSize: 11, padding: '2px 6px', background: delivery === 120 ? '#3b82f6' : 'rgba(255,255,255,0.06)', color: '#fff' }}>বাইরে (৳১২০)</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>৳</span>
                    <input
                      type="number"
                      value={delivery}
                      onChange={(e) => setDelivery(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 75, padding: '3px 8px', textAlign: 'right' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8' }}>ডিসকাউন্ট (Discount):</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>−৳</span>
                    <input
                      type="number"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 75, padding: '3px 8px', textAlign: 'right', color: '#f87171' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>সর্বমোট বিল (Total COD):</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#34d399' }}>{taka(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* 5. Status & Admin Note */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>অর্ডার স্ট্যাটাস</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="confirmed">✓ Confirmed (কনফার্মড - কুরিয়ারে বুক করার প্রস্তুত)</option>
                  <option value="pending">⏳ Pending (পেন্ডিং - পরে নিশ্চিত করবেন)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4, display: 'block' }}>অ্যাডমিন / কলার নোট</label>
                <input
                  type="text"
                  placeholder="e.g. কাস্টমার বিকেলে কল দিতে বলেছে"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="sa-modal-f" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" className="sa-btn ghost" onClick={onClose} disabled={busy}>
              বাতিল (Cancel)
            </button>
            <button
              type="submit"
              className="sa-btn primary"
              disabled={busy}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontWeight: 700,
                padding: '10px 24px',
                fontSize: 15,
                border: 'none',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                cursor: 'pointer'
              }}
            >
              {busy ? 'অর্ডার তৈরি হচ্ছে…' : '✓ অর্ডার সেভ করুন (Create Order)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrdersAdmin() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [range, setRange] = useState('all');
  const [sort, setSort] = useState('new');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const prevCount = useRef<number | null>(null);
  const [toast, setToast] = useState('');
  const load = (silent = false) => {
    if (!silent) setLoading(true);
    return aFetch('/orders')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const arr = Array.isArray(d) ? d : [];
        if (prevCount.current !== null && arr.length > prevCount.current) {
          try {
            const a = new (window.AudioContext || (window as any).webkitAudioContext)();
            const o = a.createOscillator();
            const g = a.createGain();
            o.connect(g);
            g.connect(a.destination);
            o.frequency.value = 880;
            g.gain.value = 0.08;
            o.start();
            o.frequency.setValueAtTime(660, a.currentTime + 0.12);
            o.stop(a.currentTime + 0.24);
          } catch {}
        }
        prevCount.current = arr.length;
        setOrders(arr);
        setLoading(false);
      })
      .catch(() => {
        if (!silent) setOrders([]);
        setLoading(false);
      });
  };
  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 3500);
    const onOrdersUpdated = () => load(true);
    window.addEventListener('admin-orders-updated', onOrdersUpdated);
    return () => {
      clearInterval(t);
      window.removeEventListener('admin-orders-updated', onOrdersUpdated);
    };
  }, []);
  const [prodMap, setProdMap] = useState<Record<string, any>>({});
  useEffect(() => { fetch('/api/products').then((r) => r.json()).then((ps: any[]) => { const m: any = {}; ps.forEach((p) => (m[p.id] = p)); setProdMap(m); }).catch(() => {}); }, []);
  const [courierOpts, setCourierOpts] = useState<string[]>(COURIERS);
  useEffect(() => { aFetch('/admin/integrations').then((r) => (r.ok ? r.json() : null)).then((d) => { const labels = (d?.couriers || []).filter((c: any) => c.enabled).map((c: any) => c.label).filter(Boolean); if (labels.length) setCourierOpts(labels); }).catch(() => {}); }, []);
  const [syncingId, setSyncingId] = useState<string>('');
  const [syncingAll, setSyncingAll] = useState(false);
  const [selectedCourierMap, setSelectedCourierMap] = useState<Record<string, string>>({});
  const [bookingId, setBookingId] = useState<string>('');

  const defaultCourierFor = (o: any) => {
    const dist = o.customer?.district || detectDistrict(o.customer?.address || '');
    const sugg = suggestCourier(dist);
    if (courierOpts.includes(sugg)) return sugg;
    return courierOpts[0] || 'Pathao';
  };

  const handleSendToCourier = async (o: any) => {
    const courierName = selectedCourierMap[o.id] || defaultCourierFor(o);
    setBookingId(o.id);
    try {
      const r = await aFetch('/admin/courier/book', {
        method: 'POST',
        body: JSON.stringify({ orderId: o.id, courierName })
      }).then((x) => x.json());
      if (r.ok) {
        setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, status: 'shipped', courier: r.courier || { name: courierName } } : x)));
      } else {
        alert('Booking failed: ' + (r.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Booking failed: ' + (e.message || 'error'));
    } finally {
      setBookingId('');
    }
  };

  const syncSingleOrder = async (id: string) => {
    setSyncingId(id);
    try {
      const r = await aFetch('/admin/courier/sync', { method: 'POST', body: JSON.stringify({ orderId: id }) }).then((x) => x.json());
      if (r.ok) {
        setOrders((os) => os.map((x) => (x.id === id ? { ...x, status: r.status || x.status, courier: r.courier || x.courier } : x)));
      }
    } catch {}
    finally { setSyncingId(''); }
  };
  const syncAllCouriers = async () => {
    setSyncingAll(true);
    try {
      const r = await aFetch('/admin/courier/sync-all', { method: 'POST' }).then((x) => x.json());
      if (r.ok && Array.isArray(r.orders)) {
        setOrders(r.orders);
      }
    } catch {}
    finally { setSyncingAll(false); }
  };
  const phoneCount = useMemo(() => { const m: Record<string, number> = {}; (Array.isArray(orders) ? orders : []).forEach((o) => { const p = o?.customer?.phone; if (p) m[p] = (m[p] || 0) + 1; }); return m; }, [orders]);
  const successByPhone = useMemo(() => { const m: Record<string, { d: number; c: number }> = {}; (Array.isArray(orders) ? orders : []).forEach((o) => { const p = o?.customer?.phone; if (!p) return; if (!m[p]) m[p] = { d: 0, c: 0 }; if (o.status === 'delivered') m[p].d++; else if (o.status === 'cancelled') m[p].c++; }); return m; }, [orders]);
  const ratioFor = (phone: string) => { const r = successByPhone[phone]; if (!r || r.d + r.c === 0) return null; return Math.round((r.d / (r.d + r.c)) * 100); };
  const quickStatus = async (id: string, status: string) => {
    setOrders((os) => (Array.isArray(os) ? os : []).map((x) => (x.id === id ? { ...x, status } : x)));
    setSel((prev: any) => (prev && prev.id === id ? { ...prev, status } : prev));
    setToast(`Order #${id} → ${status}`);
    setTimeout(() => setToast(''), 2500);
    try {
      const res = await aFetch('/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: { id, status } }));
      }
    } catch {}
  };
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    const now = Date.now();
    const list = (Array.isArray(orders) ? orders : []).filter((o) => {
      if (filter !== 'all' && o.status !== filter) return false;
      if (range !== 'all' && now - new Date(o.createdAt).getTime() > parseInt(range, 10) * 86400000) return false;
      if (query && !(o.id + ' ' + (o.customer?.name || '') + ' ' + (o.customer?.phone || '') + ' ' + (o.source || '')).toLowerCase().includes(query)) return false;
      return true;
    });
    return list.sort((a, b) => sort === 'high' ? b.total - a.total : sort === 'old' ? (a.createdAt < b.createdAt ? -1 : 1) : (a.createdAt > b.createdAt ? -1 : 1));
  }, [orders, filter, range, sort, q]);
  const PAGE = 25;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, range, sort, q]);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE));
  const curPage = Math.min(page, pageCount);
  const paged = shown.slice((curPage - 1) * PAGE, curPage * PAGE);
  const pickedIds = Object.keys(picked).filter((k) => picked[k]);
  const allChecked = paged.length > 0 && paged.every((o) => picked[o.id]);
  const toggleAll = () => { const n = { ...picked }; if (allChecked) paged.forEach((o) => delete n[o.id]); else paged.forEach((o) => (n[o.id] = true)); setPicked(n); };
  const bulkBookCouriers = async () => {
    if (!pickedIds.length) return;
    setSyncingAll(true);
    try {
      const res = await aFetch('/admin/courier/bulk-book', {
        method: 'POST',
        body: JSON.stringify({ orderIds: pickedIds }),
      }).then((r) => r.json());
      if (res.ok) {
        const successes = (res.results || []).filter((x: any) => x.ok).length;
        setToast(`${successes} order(s) booked & shipped with courier!`);
        setTimeout(() => setToast(''), 4000);
        setPicked({});
        load();
      } else {
        alert('Bulk booking error: ' + (res.error || 'Failed'));
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setSyncingAll(false);
    }
  };

  const bulkDeleteOrders = async () => {
    if (!pickedIds.length) return;
    if (!confirm(`Are you sure you want to delete ${pickedIds.length} selected order(s)? This cannot be undone.`)) return;
    await Promise.all(pickedIds.map((id) => aFetch('/orders/' + id, { method: 'DELETE' })));
    setPicked({});
    setToast(`${pickedIds.length} order(s) deleted`);
    setTimeout(() => setToast(''), 3000);
    load();
  };

  const bulk = async (status: string) => {
    if (!pickedIds.length) return;
    if (status === 'shipped') {
      await bulkBookCouriers();
      return;
    }
    await Promise.all(pickedIds.map((id) => aFetch('/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status }) })));
    setPicked({});
    load();
  };
  const bulkCourier = async (name: string) => {
    if (!pickedIds.length || !name) return;
    await Promise.all(pickedIds.map((id) => { const o = (Array.isArray(orders) ? orders : []).find((x) => x.id === id); const courier = { ...(o?.courier || {}), name }; return aFetch('/orders/' + id, { method: 'PATCH', body: JSON.stringify({ courier }) }); }));
    setPicked({}); load();
  };
  const pickedOrders = (Array.isArray(orders) ? orders : []).filter((o) => picked[o.id]);
  const shownTotal = useMemo(() => shown.reduce((s, o) => s + o.total, 0), [shown]);
  const liveTotal = useMemo(() => shown.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0), [shown]);
  const courierRatio = useMemo(() => {
    const c: Record<string, number> = {};
    shown.forEach((o) => { const n = o.courier && o.courier.name ? o.courier.name : 'unassigned'; c[n] = (c[n] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [shown]);
  return (
    <>
      <div className="sa-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>Orders</h1>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(34, 197, 94, 0.3)', fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }}></span>
            Live Updates Active
          </span>
          {toast && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#8b5cf6', color: '#fff', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              ✓ {toast}
            </span>
          )}
        </div>
        <div className="sa-toprow">
          <div className="sa-search-wrap">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="sa-search-ico"><path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" /></svg>
            <input className="sa-search" placeholder="Search ID, name, phone, source…" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="sa-search-clear" type="button" onClick={() => setQ('')}>×</button>}
          </div>
          <button
            className="sa-btn-create-order"
            onClick={() => setShowCreateModal(true)}
            type="button"
          >
            <span style={{ fontSize: 14 }}>➕</span>
            <span>নতুন অর্ডার (Phone / WhatsApp)</span>
          </button>
          <button className="sa-btn ghost" onClick={syncAllCouriers} disabled={syncingAll} title="Fetch latest status for all active courier shipments">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={syncingAll ? 'spin' : ''} style={{ width: 13, height: 13, marginRight: 6 }}><path d="M13.5 7a5.5 5.5 0 0 0-9.4-3L2 6" /><path d="M2.5 9a5.5 5.5 0 0 0 9.4 3L14 10" /><path d="M2 2.5V6h3.5M14 13.5V10h-3.5" /></svg>
            {syncingAll ? 'Syncing…' : 'Sync Couriers'}
          </button>
          <button className="sa-btn ghost" onClick={() => exportCSV(Array.isArray(orders) ? orders : [])}>Export CSV</button>
        </div>
      </div>
      <div className="sa-toolbar">
        <div className="sa-filters">
          {['all', ...STATUSES].map((s) => {
            const cnt = s === 'all' ? (Array.isArray(orders) ? orders.length : 0) : (Array.isArray(orders) ? orders : []).filter((o) => o.status === s).length;
            return (
              <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
                <span>{s === 'all' ? 'All' : s}</span>
                <span className="sa-filter-count">{cnt}</span>
              </button>
            );
          })}
        </div>
        <div className="sa-rightctl">
          <select className="sa-mini" value={range} onChange={(e) => setRange(e.target.value)}><option value="all">All time</option><option value="1">Today</option><option value="7">7 days</option><option value="30">30 days</option></select>
          <select className="sa-mini" value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Newest</option><option value="old">Oldest</option><option value="high">Highest ৳</option></select>
        </div>
      </div>
      {pickedIds.length > 0 && (
        <div className="sa-bulk">
          <span>{pickedIds.length} selected</span>
          <button
            type="button"
            onClick={bulkBookCouriers}
            disabled={syncingAll}
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', fontWeight: 700, border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            🚚 Bulk Ship &amp; Book Courier
          </button>
          <select className="bulksel" value="" onChange={(e) => { if (e.target.value) bulk(e.target.value); }}>
            <option value="">Change status…</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="bulksel" value="" onChange={(e) => { if (e.target.value) bulkCourier(e.target.value); }}>
            <option value="">Assign courier…</option>
            {courierOpts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => printSlips(pickedOrders)}>Print slip</button>
          <button onClick={() => printInvoices(pickedOrders)}>Print invoice</button>
          <button onClick={() => setPicked({})}>Clear</button>
        </div>
      )}
      <div className="sa-summary">
        <div className="sumtotal">
          <div className="sumtotal-main">
            <b>{taka(shownTotal)}</b>
            <span className="sumtotal-badge">{shown.length} order{shown.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="sumtotal-sub">{taka(liveTotal)} net (excluding cancelled)</div>
        </div>
        <div className="courierratio">
          {courierRatio.map(([name, n]) => (
            <span key={name} className="crchip">
              <span className={`crchip-dot cr-${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`} />
              <span className="crchip-name">{name}</span>
              <b className="crchip-count">{n}</b>
              <span className="crchip-pct">{shown.length ? Math.round((n / shown.length) * 100) : 0}%</span>
            </span>
          ))}
        </div>
      </div>
      <div className="sa-card ogwrap">
        <div className="ogrid-head">
          <span><input type="checkbox" checked={allChecked} onChange={toggleAll} /></span>
          <span>Order & Date</span>
          <span>Customer</span>
          <span>Item & Option</span>
          <span className="r">Total</span>
          <span style={{ textAlign: 'center' }}>Status</span>
          <span>Courier</span>
          <span style={{ textAlign: 'center' }}>Trust Score</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>
        {paged.map((o) => {
          const first = o.items[0];
          const img = first?.image || prodMap[first?.id]?.image;
          const ratio = ratioFor(o.customer?.phone || '');
          const cleanItem = cleanItemDisplay(first);
          const stStyle = getStatusBadgeStyle(o.status);
          const phone = o.customer?.phone ? String(o.customer.phone).trim() : '';
          const cleanPhone = phone.replace(/\D/g, '').replace(/^88/, '');
          const district = o.customer?.district || detectDistrict(o.customer?.address || '');

          return (
            <div className="ogrid-row" key={o.id} onClick={() => setSel(o)}>
              {/* 1. Checkbox */}
              <span className="og-cell-check" onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" checked={!!picked[o.id]} onChange={(e) => setPicked((p) => ({ ...p, [o.id]: e.target.checked }))} />
              </span>

              {/* 2. Order & Date */}
              <div className="og-cell-order" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: '#c4b5fd' }}>
                    #{o.id.replace('DOT-', '')}
                  </span>
                  {Date.now() - new Date(o.createdAt).getTime() < 86400000 && (
                    <span style={{ background: '#8b5cf6', color: '#fff', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4 }}>
                      NEW
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                  {timeAgo(o.createdAt)}
                </div>
                <div style={{ fontSize: 10.5, color: '#64748b' }}>
                  {new Date(o.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
                <div style={{ marginTop: 2 }}>
                  <OriginBadge source={o.source} style={{ fontSize: 10, padding: '2px 6px' }} />
                  <div className="traffic-attribution">Channel · {o.attribution?.channel || 'Untracked'}{o.attribution?.medium ? ` / ${o.attribution.medium}` : ''}</div>
                </div>
              </div>

              {/* 3. Customer */}
              <div className="og-cell-cust" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, color: '#f1f5f9' }}>
                    {o.customer?.name || 'Customer'}
                  </span>
                  {phoneCount[o.customer?.phone] > 1 && (
                    <span style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)', fontSize: 9.5, padding: '1px 5px', borderRadius: 4, fontWeight: 700 }}>
                      Repeat
                    </span>
                  )}
                </div>

                {phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 1 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#94a3b8' }}>
                      {phone}
                    </span>
                    <a
                      href={`tel:${cleanPhone}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'inline-flex', alignItems: 'center', color: '#94a3b8' }}
                      title="Call customer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                    </a>
                    <a
                      href={`https://wa.me/88${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'inline-flex', alignItems: 'center' }}
                      title="Chat on WhatsApp"
                    >
                      <WhatsAppIcon size={14} variant="official" />
                    </a>
                  </div>
                )}

                {district && (
                  <div style={{ fontSize: 11, color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 175 }} title={o.customer?.address}>
                    {district}
                  </div>
                )}
              </div>

              {/* 4. Items & Variant */}
              <div className="og-cell-items" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {img ? (
                  <img src={img} alt="" style={{ width: 40, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.12)', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 40, height: 48, borderRadius: 8, background: '#1c1830', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4b5fd', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {(cleanItem.title || 'P')[0]}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cleanItem.title}>
                    {cleanItem.title}
                  </div>
                  {cleanItem.variant && (
                    <div>
                      <span style={{ background: '#1c1830', border: '1px solid rgba(139, 92, 246, 0.25)', color: '#c4b5fd', fontSize: 10.5, padding: '1px 6px', borderRadius: 4, fontWeight: 500, display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cleanItem.variant}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Qty: <strong style={{ color: '#fff' }}>{cleanItem.qty || 1}</strong>
                    {o.items.length > 1 && (
                      <span style={{ marginLeft: 6, color: '#a78bfa', fontWeight: 600 }}>
                        +{o.items.length - 1} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 5. Total */}
              <div className="og-cell-total" style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'right' }}>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                  {taka(o.total)}
                </span>
                <span style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap' }} title="Cash on Delivery">
                  COD
                </span>
              </div>

              {/* 6. Status Dropdown */}
              <div className="og-cell-status" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'center' }}>
                <select
                  className="rowsel"
                  value={o.status}
                  onChange={(e) => quickStatus(o.id, e.target.value)}
                  style={{
                    background: stStyle.bg,
                    color: stStyle.color,
                    border: `1px solid ${stStyle.border}`,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(stStyle.color)}' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                  }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} style={{ background: '#120f21', color: '#fff' }}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* 7. Courier */}
              <div className="og-cell-courier" onClick={(e) => e.stopPropagation()} style={{ minWidth: 0 }}>
                {o.courier && o.courier.name && o.courier.consignment ? (
                  <div className="courier-booked-wrap">
                    <div className="courier-booked-top">
                      <span className="courier-name">{o.courier.name}</span>
                      <span className="courier-cons mono" title="Consignment tracking code">
                        #{o.courier.consignment}
                      </span>
                      <button
                        className="courier-sync-btn"
                        title="Sync live status from courier"
                        disabled={syncingId === o.id}
                        onClick={() => syncSingleOrder(o.id)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className={syncingId === o.id ? 'spin' : ''} style={{ width: 11, height: 11 }}>
                          <path d="M13.5 7a5.5 5.5 0 0 0-9.4-3L2 6" />
                          <path d="M2.5 9a5.5 5.5 0 0 0 9.4 3L14 10" />
                          <path d="M2 2.5V6h3.5M14 13.5V10h-3.5" />
                        </svg>
                        <span>{syncingId === o.id ? '…' : 'Sync'}</span>
                      </button>
                    </div>
                    {o.courier.liveStatus && (
                      <div className="courier-live-tag" title={o.courier.liveStatus}>
                        <span className="c-dot" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                          {o.courier.liveStatus}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="courier-send-wrap">
                    <select
                      className="courier-pick-sel"
                      value={selectedCourierMap[o.id] || defaultCourierFor(o)}
                      onChange={(e) => setSelectedCourierMap((prev) => ({ ...prev, [o.id]: e.target.value }))}
                    >
                      {courierOpts.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <button
                      className="courier-send-btn"
                      disabled={bookingId === o.id}
                      onClick={() => handleSendToCourier(o)}
                      title="Send order to courier"
                    >
                      {bookingId === o.id ? (
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" className="spin" style={{ width: 12, height: 12 }}><path d="M13.5 7a5.5 5.5 0 0 0-9.4-3L2 6" /><path d="M2.5 9a5.5 5.5 0 0 0 9.4 3L14 10" /><path d="M2 2.5V6h3.5M14 13.5V10h-3.5" /></svg>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}>
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                          Send
                        </span>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* 8. Trust Score */}
              <div className="og-cell-score" style={{ display: 'flex', justifyContent: 'center' }}>
                <span className={'ratio-chip ' + (ratio == null ? 'neutral' : ratio >= 80 ? 'good' : ratio >= 50 ? 'mid' : 'bad')} style={{ fontSize: 11, padding: '3px 8px' }}>
                  {ratio == null ? 'New Buyer' : `${ratio}% (${ratio >= 80 ? 'Safe' : 'Risk'})`}
                </span>
              </div>

              {/* 9. Actions */}
              <div className="og-cell-acts rowacts" onClick={(e) => e.stopPropagation()}>
                {o.status === 'incomplete' && (
                  <>
                    <button
                      className="eye-btn"
                      title="1-Click Confirm (Convert to Confirmed Order)"
                      style={{ color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.12)' }}
                      onClick={() => quickStatus(o.id, 'confirmed')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button
                      className="eye-btn"
                      title="Delete Incomplete Lead"
                      style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.12)' }}
                      onClick={async () => {
                        if (confirm(`Delete incomplete lead for "${o.customer?.name || o.customer?.phone || o.id}"?`)) {
                          await aFetch('/orders/' + o.id, { method: 'DELETE' });
                          setToast('Incomplete lead deleted');
                          setTimeout(() => setToast(''), 3000);
                          load(true);
                        }
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </>
                )}
                <button className="eye-btn" title="View order details" onClick={() => setSel(o)}>
                  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 9s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" /><circle cx="9" cy="9" r="2.4" /></svg>
                </button>
                <button className="eye-btn" title="Print invoice" onClick={() => printInvoice(o)}>
                  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 7V2.5h8V7M5 13H3.5V7.5h11V13H13M5 11h8v4.5H5z" /></svg>
                </button>
                {phone && (
                  <a
                    className="eye-btn eye-btn-wa"
                    title={o.status === 'incomplete' ? "Send WhatsApp Recovery Message" : "WhatsApp customer"}
                    href={`https://wa.me/88${cleanPhone}${o.status === 'incomplete' ? `?text=${encodeURIComponent(`আসসালামু আলাইকুম ${o.customer?.name || 'গ্রাহক'}! metrroma.com থেকে লক্ষ্য করলাম "${cleanItem.title || 'আমাদের পণ্য'}" এর অর্ডারটি আপনি সম্পন্ন করেননি। আপনি কি ক্যাশ অন ডেলিভারিতে অর্ডারটি কনফার্ম করতে চান? মোট মূল্য: ৳${o.total}।`)}` : ''}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <WhatsAppIcon size={16} variant="official" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
        {loading && <div className="ogskel-wrap">{[0, 1, 2, 3, 4, 5].map((i) => <div className="ska ogskel-row" key={i} />)}</div>}
        {!loading && shown.length === 0 && <div className="sa-empty">No orders here.</div>}
        {pageCount > 1 && (
          <div className="ogpager">
            <button disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>← prev</button>
            <span>{(curPage - 1) * PAGE + 1}–{Math.min(curPage * PAGE, shown.length)} of {shown.length}</span>
            <button disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)}>next →</button>
          </div>
        )}
      </div>
      {showCreateModal && (
        <CreateOrderModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newOrder) => {
            setShowCreateModal(false);
            window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: newOrder }));
            load(true);
            setSel(newOrder);
          }}
        />
      )}
      {sel && <OrderDrawer o={sel} orders={orders} onClose={() => setSel(null)} onSaved={() => { setSel(null); load(true); }} />}
    </>
  );
}

function MultiCourierFraudReport({ fraud }: { fraud: any }) {
  if (!fraud) return null;
  const rawCouriers = Array.isArray(fraud.couriers) ? fraud.couriers : [];
  const rv = fraud.riskVerdict;

  // Filter out any accidental summary row and sort active couriers first
  const couriers = [...rawCouriers]
    .filter((c: any) => String(c.courier || '').toLowerCase() !== 'summary')
    .sort((a: any, b: any) => (b.total || 0) - (a.total || 0));

  const totalDelivered = couriers.reduce((acc: number, c: any) => acc + (Number(c.delivered) || 0), 0);
  const totalCancelled = couriers.reduce((acc: number, c: any) => acc + (Number(c.cancelled) || 0), 0);
  const totalFinished = totalDelivered + totalCancelled;
  const totalOrders = couriers.reduce((acc: number, c: any) => acc + (Number(c.total) || 0), 0);
  const activeCount = couriers.filter((c: any) => (c.total || 0) > 0).length;

  // Accurate rates based on actual completed deliveries:
  const rate = totalFinished > 0
    ? Math.round((totalDelivered / totalFinished) * 100)
    : (fraud.rate != null ? fraud.rate : (totalOrders > 0 ? 100 : null));

  const returnRate = totalFinished > 0
    ? Math.round((totalCancelled / totalFinished) * 100)
    : (fraud.returnRate != null ? fraud.returnRate : (rate != null ? Math.max(0, 100 - rate) : null));

  const deliveredPct = totalFinished > 0 ? (rate || 0) : (totalOrders > 0 ? 100 : 0);
  const cancelledPct = totalFinished > 0 ? (returnRate || 0) : 0;

  // If customer has successful deliveries and 0 cancellations, they are 100% verified safe!
  const isVerifiedSafe = totalDelivered > 0 && totalCancelled === 0;
  const effectiveRisk = isVerifiedSafe
    ? 'low'
    : (rate != null && rate >= 80 ? 'low' : (rate != null && rate >= 60 ? 'medium' : (fraud.risk === 'low' ? 'low' : 'high')));

  const effectiveLabel = isVerifiedSafe
    ? 'Verified Buyer'
    : (rv?.label || (effectiveRisk === 'low' ? 'Safe Customer' : effectiveRisk === 'medium' ? 'Medium Risk' : 'High Risk Alert'));

  const effectiveAction = isVerifiedSafe
    ? '✓ 100% Success · OK to ship'
    : (rv?.action || (effectiveRisk === 'low' ? '✓ OK to ship' : '⚠ Caution needed'));

  const effectiveReasons = isVerifiedSafe
    ? [`100% Delivery Success Rate (${totalDelivered} delivered · 0 returned)`]
    : (rv?.reasons && rv.reasons.length > 0 ? rv.reasons : []);

  return (
    <div className="sa-fraud-card">
      {/* 1. Risk Verdict Header Banner */}
      <div className={'sa-fraud-verdict-banner ' + (effectiveRisk === 'low' ? 'safe' : effectiveRisk === 'medium' ? 'mid' : 'danger')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>
            {effectiveRisk === 'low' ? '🛡️' : effectiveRisk === 'medium' ? '⚠️' : '⛔'}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: effectiveRisk === 'low' ? '#34d399' : effectiveRisk === 'medium' ? '#fbbf24' : '#f87171' }}>
                {effectiveLabel}
              </span>
              <span className={'sa-fraud-pill ' + (effectiveRisk === 'low' ? 'safe' : effectiveRisk === 'medium' ? 'mid' : 'danger')} style={{ fontSize: 11 }}>
                {effectiveAction}
              </span>
            </div>
            {effectiveReasons.length > 0 && (
              <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                {effectiveReasons.join(' · ')}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="dim" style={{ fontSize: 12 }}>Overall Courier History:</span>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
            {totalOrders} Orders · <span style={{ color: '#34d399' }}>{totalDelivered} Delivered</span> · <span style={{ color: totalCancelled > 0 ? '#f43f5e' : '#94a3b8' }}>{totalCancelled} Returned</span>
          </div>
        </div>
      </div>

      {/* 2. Visual Overview & Stat Boxes */}
      <div className="sa-fraud-overview">
        {/* Left Visual Progress Box */}
        <div className="sa-fraud-donut-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>
              {rate != null ? `${rate}%` : '—'} Delivered
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: (returnRate || 0) > 0 ? '#f43f5e' : '#94a3b8', textTransform: 'uppercase' }}>
              {returnRate != null ? `${returnRate}%` : '0%'} Return
            </span>
          </div>
          <div className="sa-fraud-progress-bar">
            <div className="sa-fraud-bar-delivered" style={{ width: `${Math.min(100, deliveredPct)}%` }} />
            <div className="sa-fraud-bar-cancelled" style={{ width: `${Math.min(100, cancelledPct)}%` }} />
          </div>
          <div className="dim small" style={{ marginTop: 8, fontSize: 11 }}>
            {activeCount > 0 ? `Aggregated across ${activeCount} courier networks` : 'No delivery history recorded'}
          </div>
        </div>

        {/* Right 4 Stat Cards */}
        <div className="sa-fraud-stats">
          <div className="sa-fraud-stat-box">
            <span className="sa-fraud-stat-lbl">Delivery Success</span>
            <span className="sa-fraud-stat-val" style={{ color: rate == null ? '#94a3b8' : rate >= 80 ? '#34d399' : rate >= 60 ? '#fbbf24' : '#f87171' }}>
              {rate == null ? 'No History' : `${rate}%`}
            </span>
          </div>
          <div className="sa-fraud-stat-box">
            <span className="sa-fraud-stat-lbl">Return / Cancel Rate</span>
            <span className="sa-fraud-stat-val" style={{ color: returnRate == null ? '#94a3b8' : returnRate > 25 ? '#f43f5e' : returnRate > 10 ? '#fbbf24' : '#34d399' }}>
              {returnRate == null ? '0%' : `${returnRate}%`}
            </span>
          </div>
          <div className="sa-fraud-stat-box">
            <span className="sa-fraud-stat-lbl">Total Finished</span>
            <span className="sa-fraud-stat-val">
              {totalDelivered + totalCancelled}
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#94a3b8' }}>
                ({totalDelivered} Del · {totalCancelled} Ret)
              </span>
            </span>
          </div>
          <div className="sa-fraud-stat-box">
            <span className="sa-fraud-stat-lbl">Customer Profile</span>
            <span className="sa-fraud-stat-val" style={{ fontSize: 14 }}>
              {effectiveRisk === 'low' ? '✓ Verified Buyer' : effectiveRisk === 'medium' ? '⚠ Moderate Returns' : '⛔ High Return Alert'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Detailed Courier Breakdown Table */}
      {couriers.length > 0 ? (
        <div className="sa-fraud-tbl-wrap">
          <table className="sa-fraud-tbl">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Courier / Source</th>
                <th style={{ textAlign: 'center' }}>Total Parcels</th>
                <th style={{ textAlign: 'center' }}>Success (Received)</th>
                <th style={{ textAlign: 'center' }}>Return (Cancelled)</th>
                <th style={{ textAlign: 'center' }}>Success %</th>
                <th style={{ textAlign: 'center' }}>Return %</th>
              </tr>
            </thead>
            <tbody>
              {couriers.map((c: any, idx: number) => {
                const cLower = String(c.courier || '').toLowerCase();
                const icon = cLower.includes('steadfast') ? '🚚' :
                             cLower.includes('pathao') ? '🛵' :
                             cLower.includes('redx') ? '📦' :
                             cLower.includes('carrybee') ? '🐝' :
                             cLower.includes('paperfly') ? '✈️' :
                             cLower.includes('internal') || cLower.includes('store') ? '🏪' : '📫';
                const hasOrders = Number(c.total || 0) > 0;
                return (
                  <tr key={idx} style={{ opacity: hasOrders ? 1 : 0.45 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {c.logo ? (
                          <img src={c.logo} alt={c.courier} className="sa-fraud-logo" />
                        ) : (
                          <span style={{ fontSize: 16 }}>{icon}</span>
                        )}
                        <span style={{ fontWeight: 600, color: hasOrders ? '#f1f5f9' : '#94a3b8' }}>
                          {c.courier}
                        </span>
                      </div>
                      {c.notice && (
                        <div className="dim" style={{ fontSize: 10.5, color: '#f59e0b', marginTop: 3, maxWidth: 360, lineHeight: 1.3 }}>
                          ℹ {c.notice}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: hasOrders ? 700 : 400 }}>
                      {c.total}
                    </td>
                    <td style={{ textAlign: 'center', color: c.delivered > 0 ? '#34d399' : '#94a3b8', fontWeight: c.delivered > 0 ? 700 : 400 }}>
                      {c.delivered > 0 ? `✓ ${c.delivered}` : '0'}
                    </td>
                    <td style={{ textAlign: 'center', color: c.cancelled > 0 ? '#f43f5e' : '#94a3b8', fontWeight: c.cancelled > 0 ? 700 : 400 }}>
                      {c.cancelled > 0 ? `✕ ${c.cancelled}` : '0'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={'sa-fraud-pill ' + (c.total === 0 ? 'muted' : c.rate >= 80 ? 'safe' : c.rate >= 60 ? 'mid' : 'danger')}>
                        {c.total > 0 ? `${c.rate}%` : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={'sa-fraud-pill ' + (c.total === 0 ? 'muted' : c.returnRate > 25 ? 'danger' : c.returnRate > 10 ? 'mid' : 'safe')}>
                        {c.total > 0 ? `${c.returnRate}%` : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <span style={{ fontWeight: 700, color: '#fff' }}>Total Across All Couriers</span>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700, color: '#fff' }}>{totalOrders}</td>
                <td style={{ textAlign: 'center', color: '#34d399', fontWeight: 700 }}>✓ {totalDelivered}</td>
                <td style={{ textAlign: 'center', color: totalCancelled > 0 ? '#f43f5e' : '#94a3b8', fontWeight: 700 }}>
                  {totalCancelled > 0 ? `✕ ${totalCancelled}` : '0'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={'sa-fraud-pill ' + (rate == null ? 'muted' : rate >= 80 ? 'safe' : rate >= 60 ? 'mid' : 'danger')}>
                    {rate != null ? `${rate}%` : '—'}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={'sa-fraud-pill ' + (returnRate == null ? 'muted' : returnRate > 25 ? 'danger' : returnRate > 10 ? 'mid' : 'safe')}>
                    {returnRate != null ? `${returnRate}%` : '0%'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : totalOrders === 0 ? (
        <div className="dim small" style={{ marginTop: 8, textAlign: 'center', padding: '12px 0' }}>
          No previous courier delivery records found for this phone number.
        </div>
      ) : null}
    </div>
  );
}

function OrderDrawer({ o, orders, onClose, onSaved }: { o: any; orders?: any[]; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(o.status);
  const [cour, setCour] = useState(o.courier || { name: '', consignment: '', phone: '', url: '' });
  const [note, setNote] = useState(o.adminNote || '');
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Editable customer fields
  const [custName, setCustName] = useState(o.customer?.name || '');
  const [custPhone, setCustPhone] = useState(o.customer?.phone || '');
  const [custPhone2, setCustPhone2] = useState(o.customer?.phone2 || '');
  const [custAddress, setCustAddress] = useState(o.customer?.address || '');
  const [custDistrict, setCustDistrict] = useState(o.customer?.district || detectDistrict(o.customer?.address || ''));
  const [custThana, setCustThana] = useState(o.customer?.thana || '');
  const [custArea, setCustArea] = useState(o.customer?.area || '');
  const [custNote, setCustNote] = useState(o.customer?.note || '');

  // Editable items
  const [items, setItems] = useState<any[]>(() =>
    Array.isArray(o.items)
      ? o.items.map((it: any) => ({
          ...it,
          price: it.price || (it.qty ? Math.round(it.subtotal / it.qty) : it.subtotal) || 0,
          qty: it.qty || 1,
          subtotal: it.subtotal || ((it.price || 0) * (it.qty || 1)),
        }))
      : []
  );

  // Editable pricing
  const [delivery, setDelivery] = useState<number>(o.delivery != null ? o.delivery : (o.customer?.area === 'inside' ? 60 : 120));
  const [discount, setDiscount] = useState<number>(o.discount || 0);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>(o.paymentStatus === 'paid' ? 'paid' : 'unpaid');

  // Catalog products for "Add Product"
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [selectedProdId, setSelectedProdId] = useState('');

  const setC = (k: string) => (e: any) => setCour((c: any) => ({ ...c, [k]: e.target.value }));
  const suggestion = suggestCourier(custDistrict);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [acc, setAcc] = useState('');
  const [booking, setBooking] = useState('');
  const [fraud, setFraud] = useState<any>(null);
  const [fraudMsg, setFraudMsg] = useState('');

  // Customer history calculation
  const custOrders = useMemo(() => (orders || []).filter((x: any) => x.customer?.phone === custPhone), [orders, custPhone]);
  const totalOrders = custOrders.length || 1;
  const totalRevenue = custOrders.reduce((s: number, x: any) => s + (x.status !== 'cancelled' ? x.total : 0), 0) || o.total;
  const avgOrderValue = Math.round(totalRevenue / totalOrders);

  const computedItemsTotal = useMemo(() => items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 1)), 0), [items]);
  const grandTotal = useMemo(() => Math.max(0, computedItemsTotal + Number(delivery || 0) - Number(discount || 0)), [computedItemsTotal, delivery, discount]);

  const checkFraud = async () => {
    setFraudMsg('checking courier history…'); setFraud(null);
    try {
      const r = await aFetch('/admin/fraud/check', { method: 'POST', body: JSON.stringify({ phone: custPhone }) }).then((x) => x.json());
      if (r.error) setFraudMsg(r.error);
      else { setFraud(r); setFraudMsg(''); }
    } catch { setFraudMsg('check failed'); }
  };

  useEffect(() => {
    aFetch('/admin/integrations').then((r) => (r.ok ? r.json() : { couriers: [] })).then((d) => setAccounts((d.couriers || []).filter((c: any) => c.enabled))).catch(() => {});
    fetch('/api/products').then((r) => r.json()).then(setAllProducts).catch(() => {});
  }, []);

  const updateQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const newQty = Math.max(1, (it.qty || 1) + delta);
        return { ...it, qty: newQty, subtotal: (it.price || 0) * newQty };
      })
    );
  };

  const updatePrice = (idx: number, newPrice: number) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const p = Math.max(0, newPrice);
        return { ...it, price: p, subtotal: p * (it.qty || 1) };
      })
    );
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) {
      if (!confirm('Are you sure you want to remove the only product from this order?')) return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddProduct = () => {
    if (!selectedProdId) return;
    const prod = allProducts.find((p) => p.id === selectedProdId);
    if (!prod) return;
    const existingIdx = items.findIndex((it) => it.id === prod.id || it.name === prod.name);
    if (existingIdx >= 0) {
      updateQty(existingIdx, 1);
    } else {
      setItems((prev) => [
        ...prev,
        {
          id: prod.id,
          name: prod.name,
          price: prod.price || 0,
          qty: 1,
          subtotal: prod.price || 0,
          image: prod.images?.[0] || prod.image || '',
        },
      ]);
    }
    setSelectedProdId('');
  };

  const handleQuickStatus = async (newStatus: string) => {
    setStatus(newStatus);
    setSaveMsg(`Saving ${newStatus}…`);
    try {
      const r = await aFetch('/orders/' + o.id, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) {
        setSaveMsg(`Status updated to ${newStatus} ✓`);
        window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: { id: o.id, status: newStatus } }));
        setTimeout(() => setSaveMsg(''), 2500);
      }
    } catch {
      setSaveMsg('Failed to update status');
    }
  };

  const book = async () => {
    if (!acc) return;
    setBooking('booking…');
    try {
      const r = await aFetch('/admin/courier/book', { method: 'POST', body: JSON.stringify({ orderId: o.id, accountId: acc }) }).then((x) => x.json());
      if (r.ok) {
        setBooking('booked ✓ ' + (r.consignment ? '#' + r.consignment : ''));
        window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: { id: o.id, status: 'shipped' } }));
        setTimeout(onSaved, 800);
      }
      else setBooking('failed: ' + (r.error || r.body || r.status));
    } catch (e: any) { setBooking('failed: ' + (e.message || 'error')); }
  };

  const syncLive = async () => {
    setBooking('syncing live status…');
    try {
      const r = await aFetch('/admin/courier/sync', { method: 'POST', body: JSON.stringify({ orderId: o.id }) }).then((x) => x.json());
      if (r.ok) {
        if (r.courier) setCour(r.courier);
        if (r.status) setStatus(r.status);
        setBooking('synced ✓ ' + (r.liveStatus ? r.liveStatus : '') + (r.status ? ' → ' + r.status : ''));
        window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: { id: o.id, status: r.status } }));
        setTimeout(onSaved, 900);
      } else setBooking('sync failed: ' + (r.error || ''));
    } catch { setBooking('sync failed'); }
  };

  const save = async () => {
    setBusy(true);
    setSaveMsg('');
    try {
      const response = await aFetch('/orders/' + o.id, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          courier: cour,
          adminNote: note,
          customer: {
            name: custName,
            phone: custPhone,
            phone2: custPhone2,
            address: custAddress,
            district: custDistrict,
            thana: custThana,
            area: custArea,
            note: custNote,
          },
          items,
          itemsTotal: computedItemsTotal,
          delivery: Number(delivery || 0),
          discount: Number(discount || 0),
          total: grandTotal,
          paymentStatus,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Could not save order changes');
      }
      setSaveMsg('Saved successfully! ✓');
      setIsEditing(false);
      window.dispatchEvent(new CustomEvent('admin-orders-updated', { detail: { id: o.id, status } }));
      setTimeout(() => {
        onSaved();
      }, 500);
    } catch (e: any) {
      setSaveMsg('Error saving order: ' + (e.message || 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  const formattedDate = new Date(o.createdAt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  return (
    <div className="sa-order-modal-wrap" onClick={onClose}>
      <div className="sa-order-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="sa-om-head">
          <div className="sa-om-head-left">
            <div className="sa-om-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <div className="sa-om-title-row">
                <h2>Order {o.id}</h2>
                <span className={'sa-badge b-' + status}>{status}</span>
                {isEditing && (
                  <span style={{ fontSize: 11, background: '#7c3aed', color: '#fff', padding: '2px 8px', borderRadius: 10, fontWeight: 700, marginLeft: 6 }}>
                    ✏️ Edit Mode Active
                  </span>
                )}
              </div>
              <div className="sa-om-subtitle">
                {formattedDate} · Cash on Delivery (COD) · {originLabel(o.source)}
              </div>
            </div>
          </div>
          <div className="sa-om-head-acts">
            <button
              type="button"
              className={`sa-btn sa-mini ${isEditing ? 'primary' : 'ghost'}`}
              onClick={() => setIsEditing(!isEditing)}
              title="Toggle Edit Mode (Address, Products, Prices)"
            >
              {isEditing ? '✓ View Order' : '✏️ Edit Order'}
            </button>
            <a className="sa-btn ghost sa-mini" href={'tel:' + custPhone} title="Call customer">
              📞 Call
            </a>
            <a className="sa-btn ghost sa-mini" href={'https://wa.me/88' + custPhone.replace(/\D/g, '')} target="_blank" rel="noreferrer" title="Chat on WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <WhatsAppIcon size={14} variant="official" /> WhatsApp
            </a>
            <button className="sa-btn ghost sa-mini" onClick={() => printInvoice(o)} title="Print invoice">
              🖨️ Print
            </button>
            <button className="sa-om-close" onClick={onClose} title="Close">×</button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="sa-om-body">
          {saveMsg && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, color: '#34d399', fontSize: 13, fontWeight: 600 }}>
              {saveMsg}
            </div>
          )}

          {/* Incomplete / Abandoned Order Recovery Bar */}
          {status === 'incomplete' && (
            <div style={{
              marginBottom: 16,
              padding: '16px 20px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.06) 100%)',
              border: '1px solid rgba(249, 115, 22, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 4px 20px rgba(249, 115, 22, 0.1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 22 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#fb923c', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>অসম্পূর্ণ অর্ডার (Abandoned Checkout Lead)</span>
                      <span style={{ fontSize: 10.5, background: '#ea580c', color: '#fff', padding: '1px 8px', borderRadius: 999, fontWeight: 800 }}>DRAFT</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#fdba74', marginTop: 2 }}>
                      কাস্টমার চেকআউটে পণ্য ও নম্বর প্রদান করেছিল কিন্তু অর্ডার চূড়ান্ত করেনি। সরাসরি যোগাযোগ করে দ্রুত অর্ডার কনফার্ম করুন।
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickStatus('confirmed')}
                  style={{
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                  }}
                >
                  ✓ অর্ডার কনফার্ম করুন
                </button>
              </div>

              {/* Recovery Action Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, paddingTop: 4 }}>
                {custPhone && (
                  <a
                    href={`https://wa.me/88${custPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `আসসালামু আলাইকুম ${custName || 'প্রিয় গ্রাহক'}! metrroma.com থেকে লক্ষ্য করলাম আপনি "${items[0]?.name || 'আমাদের পণ্য'}" অর্ডার করার চেষ্টা করেছিলেন কিন্তু অর্ডারটি সম্পন্ন হয়নি। আপনি কি ক্যাশ অন ডেলিভারিতে অর্ডারটি কনফার্ম করতে চান? মোট মূল্য: ৳${grandTotal}।`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'rgba(37, 211, 102, 0.15)',
                      border: '1px solid rgba(37, 211, 102, 0.4)',
                      color: '#25d366',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      textDecoration: 'none'
                    }}
                  >
                    <WhatsAppIcon size={16} variant="official" />
                    <span>WhatsApp রিকভারি মেসেজ পাঠান</span>
                  </a>
                )}
                {custPhone && (
                  <a
                    href={`tel:${custPhone}`}
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      textDecoration: 'none'
                    }}
                  >
                    <span>📞 সরাসরি গ্রাহককে কল দিন</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Card: FRAUD CONTROLS */}
          <div className="sa-om-card sa-om-fraud">
            <div className="sa-om-card-h">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ci"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              FRAUD CONTROLS &amp; SECURITY
            </div>
            <div className="sa-om-fraud-row">
              <div className="sa-om-chip">
                <span>📞 {custPhone}</span>
                <button className="sa-btn-subtle" onClick={checkFraud}>Check History</button>
              </div>
              {o.source && (
                <div className="sa-om-chip">
                  <span>🌐 {originLabel(o.source)}</span>
                  <span className="sa-tag-source">Storefront</span>
                </div>
              )}
              {totalOrders > 1 && (
                <div className="sa-om-chip sa-om-chip-green">
                  <span>Repeat Customer · {totalOrders} Orders</span>
                </div>
              )}
            </div>
            {fraudMsg && <div className="dim small" style={{ marginTop: 8 }}>{fraudMsg}</div>}
            {fraud && <MultiCourierFraudReport fraud={fraud} />}
          </div>

          {/* 2-Column Grid */}
          <div className="sa-om-grid">
            {/* GENERAL */}
            <div className="sa-om-card">
              <div className="sa-om-card-h">GENERAL</div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Date created</span>
                <span className="sa-om-v">{formattedDate}</span>
              </div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Fulfillment Status</span>
                <div className="sa-om-v" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select className="sa-om-select" value={status} onChange={(e) => handleQuickStatus(e.target.value)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {['pending', 'confirmed', 'shipped', 'delivered', 'hold', 'cancelled'].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleQuickStatus(s)}
                        style={{
                          padding: '3px 8px',
                          borderRadius: 5,
                          fontSize: 11,
                          fontWeight: status === s ? 700 : 500,
                          background: status === s ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                          color: status === s ? '#fff' : '#cbd5e1',
                          border: status === s ? '1px solid #a78bfa' : '1px solid rgba(255,255,255,0.12)',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {status === s ? '✓ ' : ''}{s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Customer</span>
                <span className="sa-om-v">{custName}</span>
              </div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Payment</span>
                <span className="sa-om-v">Cash on Delivery (COD)</span>
              </div>
            </div>

            {/* BILLING / CONTACT (Editable) */}
            <div className="sa-om-card">
              <div className="sa-om-card-header-row">
                <div className="sa-om-card-h" style={{ margin: 0 }}>BILLING &amp; CONTACT</div>
                <button
                  type="button"
                  className={`sa-om-edit-badge ${isEditing ? 'active' : ''}`}
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? '✓ Done Editing' : '✏️ Edit Contact'}
                </button>
              </div>

              {isEditing ? (
                <div>
                  <div className="sa-om-field">
                    <label>Customer Name</label>
                    <input
                      type="text"
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      placeholder="Customer name"
                    />
                  </div>
                  <div className="sa-om-field">
                    <label>Mobile Number (Primary)</label>
                    <input
                      type="text"
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                      placeholder="01XXXXXXXXX"
                    />
                  </div>
                  <div className="sa-om-field">
                    <label>Secondary Mobile (Optional)</label>
                    <input
                      type="text"
                      value={custPhone2}
                      onChange={(e) => setCustPhone2(e.target.value)}
                      placeholder="Alternative phone"
                    />
                  </div>
                  <div className="sa-om-field">
                    <label>Delivery Address</label>
                    <textarea
                      rows={2}
                      value={custAddress}
                      onChange={(e) => {
                        setCustAddress(e.target.value);
                        if (!custDistrict) setCustDistrict(detectDistrict(e.target.value));
                      }}
                      placeholder="Full delivery address..."
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="sa-om-field">
                      <label>District</label>
                      <input
                        type="text"
                        value={custDistrict}
                        onChange={(e) => setCustDistrict(e.target.value)}
                        placeholder="District"
                      />
                    </div>
                    <div className="sa-om-field">
                      <label>Thana / Area</label>
                      <input
                        type="text"
                        value={custThana}
                        onChange={(e) => setCustThana(e.target.value)}
                        placeholder="Thana"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="sa-om-kv">
                    <span className="sa-om-k">Customer Name</span>
                    <span className="sa-om-v"><b>{custName}</b></span>
                  </div>
                  <div className="sa-om-kv">
                    <span className="sa-om-k">Mobile Number</span>
                    <span className="sa-om-v">
                      <a href={'tel:' + custPhone} className="sa-link-clean">📞 {custPhone}</a>
                      {custPhone2 ? ` / ${custPhone2}` : ''}
                    </span>
                  </div>
                  <div className="sa-om-kv">
                    <span className="sa-om-k">Delivery Address</span>
                    <span className="sa-om-v">{custAddress}</span>
                  </div>
                  <div className="sa-om-kv">
                    <span className="sa-om-k">District &amp; Area</span>
                    <span className="sa-om-v">
                      📍 {[custThana, custDistrict].filter(Boolean).join(', ') || 'Bangladesh'}
                      {custArea ? ` (${custArea} dhaka)` : ''}
                    </span>
                  </div>
                  {o.deviceId && (
                    <div className="sa-om-kv">
                      <span className="sa-om-k">Device Fingerprint</span>
                      <span className="sa-om-v mono dim" style={{ fontSize: 11 }}>📱 {o.deviceId}</span>
                    </div>
                  )}
                  {o.ip && (
                    <div className="sa-om-kv">
                      <span className="sa-om-k">Client IP</span>
                      <span className="sa-om-v mono dim" style={{ fontSize: 11 }}>🌐 {o.ip}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SHIPPING & COURIER */}
            <div className="sa-om-card">
              <div className="sa-om-card-h">SHIPPING &amp; COURIER</div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Shipping To</span>
                <span className="sa-om-v">{custAddress}</span>
              </div>
              {accounts.length > 0 && (
                <div className="sa-om-courier-book">
                  <select value={acc} onChange={(e) => setAcc(e.target.value)} className="sa-om-select">
                    <option value="">One-click book via…</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                  <button type="button" className="sa-btn sa-mini" disabled={!acc} onClick={book}>Book Courier</button>
                </div>
              )}
              {booking && <div className="dim small" style={{ margin: '4px 0' }}>{booking}</div>}
              <div className="sa-om-frow" style={{ marginTop: 8 }}>
                <input placeholder="Courier (Steadfast, Pathao...)" value={cour.name} onChange={setC('name')} />
                <input placeholder="Consignment / tracking no." value={cour.consignment} onChange={setC('consignment')} />
              </div>
              {custDistrict && !cour.name && (
                <button type="button" className="sa-link" style={{ marginTop: 4, padding: 0 }} onClick={() => setCour((c: any) => ({ ...c, name: suggestion }))}>
                  📍 {custDistrict} → suggest {suggestion}
                </button>
              )}
              {cour.consignment && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" className="sa-btn ghost sa-mini" onClick={syncLive}>
                    ⟳ Sync live status{cour.liveStatus ? ` · ${cour.liveStatus}` : ''}
                  </button>
                </div>
              )}
              {cour.liveStatus && (
                <div className="sa-om-courier-live-info">
                  <span className="sa-badge b-live">{cour.liveStatus}</span>
                  {cour.lastSync && <span className="dim small">Synced {timeAgo(cour.lastSync)}</span>}
                </div>
              )}
              {cour.riderNote && (
                <div className="sa-om-rider-box">
                  <div className="sa-om-rider-title">🛵 Rider / Delivery Note</div>
                  <div className="sa-om-rider-text">{cour.riderNote}</div>
                </div>
              )}
            </div>

            {/* ORDER ATTRIBUTION & NOTES */}
            <div className="sa-om-card">
              <div className="sa-om-card-h">ORDER ATTRIBUTION &amp; NOTES</div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Origin / Source</span>
                <span className="sa-om-v"><span className="sa-tag-source">🌐 {originLabel(o.source)}</span></span>
              </div>
              <div className="sa-om-kv"><span className="sa-om-k">Marketing channel</span><span className="sa-om-v">{o.attribution?.channel || 'Untracked'}{o.attribution?.medium ? ` · ${o.attribution.medium}` : ''}</span></div>
              {o.attribution?.campaign && <div className="sa-om-kv"><span className="sa-om-k">Campaign</span><span className="sa-om-v">{o.attribution.campaign}</span></div>}
              {o.attribution?.referrer && <div className="sa-om-kv"><span className="sa-om-k">Referrer</span><span className="sa-om-v">{o.attribution.referrer}</span></div>}
              <div className="sa-om-kv"><span className="sa-om-k">Marketing channel</span><span className="sa-om-v">{o.attribution?.channel || 'Untracked'}{o.attribution?.medium ? ` · ${o.attribution.medium}` : ''}</span></div>
              {o.attribution?.campaign && <div className="sa-om-kv"><span className="sa-om-k">Campaign</span><span className="sa-om-v">{o.attribution.campaign}</span></div>}
              {o.attribution?.referrer && <div className="sa-om-kv"><span className="sa-om-k">Referrer</span><span className="sa-om-v">{o.attribution.referrer}</span></div>}
              <div className="sa-om-kv">
                <span className="sa-om-k">Customer Note</span>
                {isEditing ? (
                  <textarea
                    rows={2}
                    value={custNote}
                    onChange={(e) => setCustNote(e.target.value)}
                    placeholder="Customer note / instructions..."
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                ) : (
                  <span className="sa-om-v">{custNote ? <span style={{ color: '#fbbf24' }}>{custNote}</span> : <span className="dim">None</span>}</span>
                )}
              </div>
              <div className="sa-om-kv">
                <span className="sa-om-k">Staff Private Note</span>
                <div className="sa-om-v">
                  <textarea placeholder="Staff private note..." value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Card: CUSTOMER HISTORY */}
          <div className="sa-om-card sa-om-history">
            <div className="sa-om-card-h">CUSTOMER HISTORY</div>
            <div className="sa-om-stats-row">
              <div className="sa-om-stat-box">
                <div className="sa-om-stat-num">{totalOrders}</div>
                <div className="sa-om-stat-label">TOTAL ORDERS</div>
              </div>
              <div className="sa-om-stat-box">
                <div className="sa-om-stat-num">{taka(totalRevenue)}</div>
                <div className="sa-om-stat-label">TOTAL REVENUE</div>
              </div>
              <div className="sa-om-stat-box">
                <div className="sa-om-stat-num">{taka(avgOrderValue)}</div>
                <div className="sa-om-stat-label">AVG ORDER VALUE</div>
              </div>
            </div>
          </div>

          {/* Card: ITEMS (Editable) */}
          <div className="sa-om-card">
            <div className="sa-om-card-header-row">
              <div className="sa-om-card-h" style={{ margin: 0 }}>
                ORDER ITEMS ({items.length})
              </div>
              <button
                type="button"
                className={`sa-om-edit-badge ${isEditing ? 'active' : ''}`}
                onClick={() => setIsEditing(!isEditing)}
              >
                {isEditing ? '✓ Done Editing' : '✏️ Edit Items & Prices'}
              </button>
            </div>

            <div className="sa-om-items-list">
              {items.map((it: any, idx: number) => (
                <div className="sa-om-item-row" key={it.id || idx}>
                  <div className="sa-om-item-left">
                    {it.image ? <img src={it.image} alt="" className="sa-om-item-thumb" /> : <div className="sa-om-item-thumb empty">📦</div>}
                    <div className="sa-om-item-info">
                      <div className="sa-om-item-name">{it.name}</div>
                      {(it.variantTitle || it.color || it.size) && (
                        <div style={{ marginTop: 2 }}>
                          <span style={{ background: '#1c1830', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c4b5fd', fontSize: 11, padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                            {it.variantTitle || [it.color ? `Color: ${it.color}` : '', it.size ? `Size: ${it.size}` : ''].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                          <span className="dim small">Unit ৳:</span>
                          <input
                            type="number"
                            className="sa-item-price-input"
                            value={it.price}
                            onChange={(e) => updatePrice(idx, parseInt(e.target.value, 10) || 0)}
                            min="0"
                          />
                        </div>
                      ) : (
                        <div className="dim small">{taka(it.price || 0)} × {it.qty}</div>
                      )}
                    </div>
                  </div>

                  <div className="sa-om-item-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="sa-qty-ctrl">
                          <button type="button" className="sa-qty-btn" onClick={() => updateQty(idx, -1)}>−</button>
                          <span className="sa-qty-val">{it.qty}</span>
                          <button type="button" className="sa-qty-btn" onClick={() => updateQty(idx, 1)}>+</button>
                        </div>
                        <b style={{ minWidth: 65, textAlign: 'right' }}>{taka((it.price || 0) * (it.qty || 1))}</b>
                        <button
                          type="button"
                          className="sa-remove-item-btn"
                          onClick={() => removeItem(idx)}
                          title="Remove item"
                        >
                          🗑️
                        </button>
                      </div>
                    ) : (
                      <b>{taka((it.price || 0) * (it.qty || 1))}</b>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Product Section (in Edit Mode) */}
            {isEditing && (
              <div className="sa-add-prod-box">
                <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>➕ Add Product:</span>
                <select value={selectedProdId} onChange={(e) => setSelectedProdId(e.target.value)}>
                  <option value="">-- Select product from catalog --</option>
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {taka(p.price)} {p.stock != null ? `(${p.stock} in stock)` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sa-btn small primary"
                  disabled={!selectedProdId}
                  onClick={handleAddProduct}
                >
                  Add to Order
                </button>
              </div>
            )}

            {/* Calculation / Pricing */}
            <div className="sa-om-calc" style={{ marginTop: 14 }}>
              <div className="sa-om-calc-row">
                <span className="dim">Items Subtotal</span>
                <span>{taka(computedItemsTotal)}</span>
              </div>

              <div className="sa-om-calc-row">
                <span className="dim">
                  Shipping Fee {custArea ? `(${custArea} dhaka)` : ''}
                </span>
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      className="sa-btn-subtle"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => setDelivery(60)}
                    >
                      Dhaka (৳60)
                    </button>
                    <button
                      type="button"
                      className="sa-btn-subtle"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => setDelivery(120)}
                    >
                      Outside (৳120)
                    </button>
                    <button
                      type="button"
                      className="sa-btn-subtle"
                      style={{ fontSize: 11, padding: '2px 6px' }}
                      onClick={() => setDelivery(0)}
                    >
                      Free (৳0)
                    </button>
                    <input
                      type="number"
                      className="sa-item-price-input"
                      value={delivery}
                      onChange={(e) => setDelivery(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      min="0"
                    />
                  </div>
                ) : (
                  <span>{delivery ? taka(delivery) : 'Free'}</span>
                )}
              </div>

              <div className="sa-om-calc-row" style={{ color: '#a78bfa' }}>
                <span>Discount / Adjustment</span>
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>−৳</span>
                    <input
                      type="number"
                      className="sa-item-price-input"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      min="0"
                    />
                  </div>
                ) : (
                  <span>{discount ? `−${taka(discount)}` : '৳0'}</span>
                )}
              </div>

              <div className="sa-om-calc-row sa-om-calc-total">
                <span>Grand Total Amount</span>
                <b>{taka(grandTotal)}</b>
              </div>

              <div className="sa-om-calc-row" style={{ paddingTop: 6 }}>
                <span className="dim">Payment Method</span>
                {isEditing ? (
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value === 'paid' ? 'paid' : 'unpaid')}
                    aria-label="Customer payment status"
                    style={{ minWidth: 140, padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,.35)', background: '#171421', color: '#f8fafc' }}
                  >
                    <option value="unpaid">Cash on Delivery · Unpaid</option>
                    <option value="paid">Cash on Delivery · Paid</option>
                  </select>
                ) : (
                  <span className={'sa-badge ' + (paymentStatus === 'paid' ? 'b-delivered' : 'b-pending')}>
                    Cash on Delivery · {paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sa-om-foot">
          <div className="sa-om-foot-left">
            <button className="sa-btn ghost" onClick={() => printInvoice({ ...o, customer: { ...o.customer, name: custName, phone: custPhone, address: custAddress }, items, delivery, discount, total: grandTotal })}>
              Print Invoice
            </button>
            <button className="sa-btn ghost" onClick={() => printSlips([{ ...o, paymentStatus, customer: { ...o.customer, name: custName, phone: custPhone, address: custAddress }, items, delivery, discount, total: grandTotal }])}>
              Print Packing Slip
            </button>
          </div>
          <div className="sa-om-foot-right">
            <button className="sa-btn ghost" onClick={onClose}>Close</button>
            <button className="sa-btn primary" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
function ProductsAdmin() {
  const [products, setProducts] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'instock' | 'lowstock' | 'soldout'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'stock-asc' | 'stock-desc' | 'price-asc' | 'price-desc' | 'name-asc'>('newest');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedVariantId, setExpandedVariantId] = useState<string | null>(null);
  const [stockFeedback, setStockFeedback] = useState<{ [id: string]: string }>({});

  const load = () => {
    setLoading(true);
    return fetch('/api/products')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        setProducts(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => {
        setProducts([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    getCategories().then((c) => setCats(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  const del = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    await aFetch('/products/' + id, { method: 'DELETE' });
    load();
  };

  const dup = (p: any) => {
    const { id, slug, ...rest } = p;
    setEdit({ ...rest, name: p.name + ' (Copy)', sku: p.sku ? p.sku + '-COPY' : '' });
  };

  // Instant inline stock updater
  const updateStockInline = async (productId: string, newStock: number | null) => {
    const currentProd = products.find((x) => x.id === productId);
    if (!currentProd) return;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const autoSoldOut = newStock === 0 ? true : p.soldOut && newStock && newStock > 0 ? false : p.soldOut;
        return { ...p, stock: newStock, soldOut: autoSoldOut };
      })
    );

    setStockFeedback((prev) => ({ ...prev, [productId]: 'saving' }));
    try {
      const autoSoldOut = newStock === 0 ? true : currentProd.soldOut && newStock && newStock > 0 ? false : currentProd.soldOut;
      const res = await aFetch('/products/' + productId + '/stock', {
        method: 'PATCH',
        body: JSON.stringify({ stock: newStock, soldOut: autoSoldOut }),
      });
      if (res.ok) {
        setStockFeedback((prev) => ({ ...prev, [productId]: 'Saved ✓' }));
        setTimeout(() => {
          setStockFeedback((prev) => {
            const next = { ...prev };
            delete next[productId];
            return next;
          });
        }, 2000);
      }
    } catch {
      setStockFeedback((prev) => ({ ...prev, [productId]: 'Error' }));
    }
  };

  // Quick Sold-out toggle
  const toggleSoldOut = async (productId: string) => {
    const currentProd = products.find((x) => x.id === productId);
    if (!currentProd) return;
    const nextSoldOut = !currentProd.soldOut;

    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, soldOut: nextSoldOut } : p))
    );

    try {
      await aFetch('/products/' + productId + '/stock', {
        method: 'PATCH',
        body: JSON.stringify({ soldOut: nextSoldOut }),
      });
    } catch {
      load();
    }
  };

  // Quick Variant Stock Updater
  const updateVariantStock = async (productId: string, variantId: string, val: string) => {
    const currentProd = products.find((x) => x.id === productId);
    if (!currentProd) return;
    const newStock = val === '' ? null : Math.max(0, parseInt(val, 10) || 0);

    const updatedVariations = (currentProd.variations || []).map((v: any) =>
      v.id === variantId ? { ...v, stock: newStock } : v
    );

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, variations: updatedVariations } : p))
    );

    try {
      await aFetch('/products/' + productId, {
        method: 'PUT',
        body: JSON.stringify({ ...currentProd, variations: updatedVariations }),
      });
    } catch {
      load();
    }
  };

  // Bulk operations
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const bulkSetSoldOut = async (soldOutState: boolean) => {
    if (!selectedIds.length) return;
    setProducts((prev) =>
      prev.map((p) => (selectedIds.includes(p.id) ? { ...p, soldOut: soldOutState } : p))
    );
    await Promise.all(
      selectedIds.map((id) =>
        aFetch('/products/' + id + '/stock', {
          method: 'PATCH',
          body: JSON.stringify({ soldOut: soldOutState }),
        })
      )
    );
    setSelectedIds([]);
  };

  const bulkRestock = async (unitsToAdd: number) => {
    if (!selectedIds.length) return;
    const prodsToUpdate = products.filter((p) => selectedIds.includes(p.id));
    setProducts((prev) =>
      prev.map((p) => {
        if (!selectedIds.includes(p.id)) return p;
        const current = p.stock == null ? 0 : p.stock;
        return { ...p, stock: current + unitsToAdd, soldOut: false };
      })
    );
    await Promise.all(
      prodsToUpdate.map((p) => {
        const current = p.stock == null ? 0 : p.stock;
        return aFetch('/products/' + p.id + '/stock', {
          method: 'PATCH',
          body: JSON.stringify({ stock: current + unitsToAdd, soldOut: false }),
        });
      })
    );
    setSelectedIds([]);
  };

  const bulkSetUnlimited = async () => {
    if (!selectedIds.length) return;
    setProducts((prev) =>
      prev.map((p) => (selectedIds.includes(p.id) ? { ...p, stock: null, soldOut: false } : p))
    );
    await Promise.all(
      selectedIds.map((id) =>
        aFetch('/products/' + id + '/stock', {
          method: 'PATCH',
          body: JSON.stringify({ stock: null, soldOut: false }),
        })
      )
    );
    setSelectedIds([]);
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} selected products? This cannot be undone.`)) return;
    await Promise.all(selectedIds.map((id) => aFetch('/products/' + id, { method: 'DELETE' })));
    setSelectedIds([]);
    load();
  };

  // CSV Inventory Exporter
  const exportInventoryCSV = () => {
    const headers = ['ID', 'Title', 'SKU', 'Category', 'Price (BDT)', 'Compare Price', 'Stock Quantity', 'Stock Status', 'Low Stock Alert'];
    const rows = products.map((p) => [
      `"${p.id || ''}"`,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${p.sku || ''}"`,
      `"${p.category || ''}"`,
      p.price || 0,
      p.compareAt || 0,
      p.stock == null ? 'Unlimited' : p.stock,
      p.soldOut ? 'Sold Out' : (p.stock != null && p.stock <= (p.lowStockThreshold || 5)) ? 'Low Stock' : 'In Stock',
      p.lowStockThreshold || 5,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Metrics
  const totalProducts = products.length;
  const inStockCount = products.filter((p) => !p.soldOut && (p.stock == null || p.stock > 0)).length;
  const lowStockProducts = products.filter(
    (p) => !p.soldOut && p.stock != null && p.stock > 0 && p.stock <= (p.lowStockThreshold || 5)
  );
  const soldOutProducts = products.filter((p) => p.soldOut || p.stock === 0);
  const totalStockUnits = products.reduce((acc, p) => acc + (p.stock != null ? p.stock : 0), 0);
  const totalInventoryValuation = products.reduce(
    (acc, p) => acc + (p.stock != null ? p.stock : 0) * (p.price || 0),
    0
  );

  // Filtering & Sorting
  const query = q.trim().toLowerCase();
  const filteredProducts = products.filter((p) => {
    const matchesCat = cat === 'all' || p.category === cat;
    const colNames = (p.colors || []).map((c: any) => (typeof c === 'string' ? c : c.name)).join(' ').toLowerCase();
    const colHexes = (p.colors || []).map((c: any) => (typeof c === 'object' && c.hex ? c.hex : '')).join(' ').toLowerCase();
    const cleanColHexes = colHexes.replace(/#/g, '');
    const cleanQueryHex = query.replace(/#/g, '');
    const varCols = (p.variations || []).map((v: any) => `${v.color || ''} ${v.colorHex || ''}`).join(' ').toLowerCase();
    const varSizes = (p.variations || []).map((v: any) => v.size || '').join(' ').toLowerCase();
    const sizes = (p.sizes || []).join(' ').toLowerCase();

    const matchesQuery =
      !query ||
      (p.name || '').toLowerCase().includes(query) ||
      (p.sku || '').toLowerCase().includes(query) ||
      (p.slug || '').toLowerCase().includes(query) ||
      colNames.includes(query) ||
      colHexes.includes(query) ||
      (cleanQueryHex.length >= 3 && cleanColHexes.includes(cleanQueryHex)) ||
      varCols.includes(query) ||
      varSizes.includes(query) ||
      sizes.includes(query);

    let matchesStock = true;
    if (stockFilter === 'instock') matchesStock = !p.soldOut && (p.stock == null || p.stock > 0);
    else if (stockFilter === 'lowstock') matchesStock = !p.soldOut && p.stock != null && p.stock > 0 && p.stock <= (p.lowStockThreshold || 5);
    else if (stockFilter === 'soldout') matchesStock = p.soldOut || p.stock === 0;

    return matchesCat && matchesQuery && matchesStock;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'stock-asc') {
      const sa = a.stock == null ? 999999 : a.stock;
      const sb = b.stock == null ? 999999 : b.stock;
      return sa - sb;
    }
    if (sortBy === 'stock-desc') {
      const sa = a.stock == null ? 999999 : a.stock;
      const sb = b.stock == null ? 999999 : b.stock;
      return sb - sa;
    }
    if (sortBy === 'price-asc') return (a.price || 0) - (b.price || 0);
    if (sortBy === 'price-desc') return (b.price || 0) - (a.price || 0);
    if (sortBy === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    return 0; // 'newest' default
  });

  return (
    <>
      {/* Top Header */}
      <div className="sa-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>📦</span> Product Inventory & Catalog
          </h1>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>
            Real-time multi-channel warehouse stock management and luxury product studio.
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="sa-btn ghost" onClick={exportInventoryCSV} title="Export CSV Spreadsheet" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <span>📥</span> Export CSV
          </button>
          <button className="sa-btn" onClick={() => setEdit({})} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#8b5cf6', color: '#fff', fontWeight: 600 }}>
            <span>✨</span> Add New Product
          </button>
        </div>
      </div>

      {/* Luxury Inventory KPI Ribbon */}
      <div className="inv-kpi-grid">
        <div
          className={`inv-kpi-card ${stockFilter === 'all' ? 'active' : ''}`}
          onClick={() => setStockFilter('all')}
          title="Click to view all products"
        >
          <div className="inv-kpi-top">
            <span className="inv-kpi-label">Total Catalog SKUs</span>
            <span className="inv-kpi-icon">🏷️</span>
          </div>
          <div className="inv-kpi-val">{totalProducts}</div>
          <div className="inv-kpi-sub">
            <span>{totalStockUnits.toLocaleString()} total units tracked</span>
          </div>
        </div>

        <div
          className={`inv-kpi-card ${stockFilter === 'instock' ? 'active' : ''}`}
          onClick={() => setStockFilter('instock')}
          title="Click to view in-stock products"
        >
          <div className="inv-kpi-top">
            <span className="inv-kpi-label" style={{ color: '#34d399' }}>In Stock</span>
            <span className="inv-kpi-icon">🟢</span>
          </div>
          <div className="inv-kpi-val" style={{ color: '#34d399' }}>{inStockCount}</div>
          <div className="inv-kpi-sub">
            <span>Ready for instant dispatch</span>
          </div>
        </div>

        <div
          className={`inv-kpi-card warn ${stockFilter === 'lowstock' ? 'active' : ''}`}
          onClick={() => setStockFilter('lowstock')}
          title="Click to view low stock alerts"
        >
          <div className="inv-kpi-top">
            <span className="inv-kpi-label" style={{ color: '#fbbf24' }}>Low Stock Warning</span>
            <span className="inv-kpi-icon">⚠️</span>
          </div>
          <div className="inv-kpi-val" style={{ color: '#fbbf24' }}>{lowStockProducts.length}</div>
          <div className="inv-kpi-sub">
            <span>≤ 5 units remaining (restock soon)</span>
          </div>
        </div>

        <div
          className={`inv-kpi-card danger ${stockFilter === 'soldout' ? 'active' : ''}`}
          onClick={() => setStockFilter('soldout')}
          title="Click to view sold out items"
        >
          <div className="inv-kpi-top">
            <span className="inv-kpi-label" style={{ color: '#f87171' }}>Sold Out / 0 Stock</span>
            <span className="inv-kpi-icon">🔴</span>
          </div>
          <div className="inv-kpi-val" style={{ color: '#f87171' }}>{soldOutProducts.length}</div>
          <div className="inv-kpi-sub">
            <span>Checkout disabled for these items</span>
          </div>
        </div>

        <div className="inv-kpi-card" style={{ cursor: 'default' }}>
          <div className="inv-kpi-top">
            <span className="inv-kpi-label" style={{ color: '#c4b5fd' }}>Stock Asset Value</span>
            <span className="inv-kpi-icon">💰</span>
          </div>
          <div className="inv-kpi-val" style={{ color: '#c4b5fd' }}>{taka(totalInventoryValuation)}</div>
          <div className="inv-kpi-sub">
            <span>Total warehouse inventory valuation</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="sa-toolbar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 280, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
            <input
              className="sa-search"
              placeholder="Search by title, SKU, or slug…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', paddingLeft: 34 }}
            />
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: 14 }}>
              🔍
            </span>
          </div>

          <div className="sa-filters" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All Categories</button>
            {cats.map((c) => (
              <button key={c.slug} className={cat === c.slug ? 'on' : ''} onClick={() => setCat(c.slug)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sort Dropdown */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Sort:</span>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            style={{ padding: '6px 12px', fontSize: 13, width: 'auto', background: '#161422', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <option value="newest">Recently Added</option>
            <option value="stock-asc">Stock: Low to High (Urgent)</option>
            <option value="stock-desc">Stock: High to Low</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="name-asc">Name A-Z</option>
          </select>
        </div>
      </div>

      {/* Bulk Operations Bar */}
      {selectedIds.length > 0 && (
        <div className="sa-bulk" style={{ animation: 'saUp .2s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: '#c4b5fd' }}>{selectedIds.length}</span>
            <span>products selected:</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => bulkSetSoldOut(false)}>🟢 Set In Stock</button>
            <button type="button" onClick={() => bulkSetSoldOut(true)}>🔴 Set Sold Out</button>
            <button type="button" onClick={() => bulkRestock(10)}>⚡ Restock +10</button>
            <button type="button" onClick={() => bulkRestock(50)}>⚡ Restock +50</button>
            <button type="button" onClick={bulkSetUnlimited}>∞ Unlimited Stock</button>
            <button type="button" className="danger" onClick={bulkDelete}>🗑️ Delete Selected</button>
            <button type="button" style={{ background: 'transparent', border: 'none', color: '#94a3b8' }} onClick={() => setSelectedIds([])}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table Card */}
      <div className="sa-card" style={{ overflow: 'hidden' }}>
        <table className="sa-table rows">
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={filteredProducts.length > 0 && selectedIds.length === filteredProducts.length}
                  onChange={toggleSelectAll}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
              </th>
              <th>Product Details</th>
              <th>Category</th>
              <th>Availability</th>
              <th>Stock Inventory</th>
              <th className="r">Price (৳)</th>
              <th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              const isLowStock = !p.soldOut && p.stock != null && p.stock > 0 && p.stock <= (p.lowStockThreshold || 5);
              const isSoldOut = p.soldOut || p.stock === 0;
              const hasVariants = Array.isArray(p.variations) && p.variations.length > 0;
              const isExpanded = expandedVariantId === p.id;
              const feedback = stockFeedback[p.id];

              return (
                <>
                  <tr key={p.id} style={{ background: isSelected ? 'rgba(139, 92, 246, 0.08)' : undefined }}>
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>

                    {/* Product Cell */}
                    <td className="pcell">
                      <div style={{ position: 'relative' }}>
                        <img src={p.image} alt="" style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }} />
                        {p.images && p.images.length > 1 && (
                          <span style={{ position: 'absolute', bottom: 2, right: 2, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: 9, padding: '1px 3px', borderRadius: 3 }}>
                            +{p.images.length - 1}
                          </span>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="pn" style={{ fontWeight: 600, color: '#fff' }}>{p.name}</span>
                          <a
                            href={`/#product/${p.slug || p.id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#8b5cf6', fontSize: 12, textDecoration: 'none' }}
                            title="Preview product on storefront"
                          >
                            ↗
                          </a>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                          {p.sku && <span style={{ fontSize: 11, background: '#1e1b2e', padding: '1px 6px', borderRadius: 4, color: '#a78bfa', fontFamily: 'monospace' }}>SKU: {p.sku}</span>}
                          {hasVariants && (
                            <button
                              type="button"
                              onClick={() => setExpandedVariantId(isExpanded ? null : p.id)}
                              style={{ background: isExpanded ? '#8b5cf6' : 'rgba(255,255,255,0.06)', color: isExpanded ? '#fff' : '#c4b5fd', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              ⚡ {p.variations.length} Variants {isExpanded ? '▲' : '▼'}
                            </button>
                          )}
                          {p.colors && p.colors.length > 0 && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              {p.colors.length} {p.colors.length === 1 ? 'color' : 'colors'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="dim">
                      <span style={{ background: '#1c192d', padding: '4px 8px', borderRadius: 6, fontSize: 12, color: '#cbd5e1' }}>
                        {p.category}
                      </span>
                    </td>

                    {/* Status Pill with 1-Click Toggle */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                        <button
                          type="button"
                          className={`sa-status-toggle ${isSoldOut ? 'soldout' : 'instock'}`}
                          onClick={() => toggleSoldOut(p.id)}
                          title="Click to toggle availability"
                        >
                          <span>{isSoldOut ? '🔴 Sold Out' : '🟢 In Stock'}</span>
                        </button>
                        {p.adult && <span className="sa-badge b-adult" style={{ fontSize: 10, padding: '1px 5px' }}>🔞 18+ Only</span>}
                        {p.tag && <span className="sa-badge b-tag" style={{ fontSize: 10, padding: '1px 5px' }}>{p.tag}</span>}
                      </div>
                    </td>

                    {/* Inline Stock Stepper */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {p.stock == null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#a78bfa' }} title="Unlimited Stock">
                              ∞ Unlimited
                            </span>
                            <button
                              type="button"
                              className="sa-btn ghost sa-mini"
                              onClick={() => updateStockInline(p.id, 50)}
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              title="Set specific number"
                            >
                              Track
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div className="sa-stock-stepper">
                              <button
                                type="button"
                                className="sa-stock-btn"
                                onClick={() => updateStockInline(p.id, Math.max(0, (p.stock || 0) - 1))}
                                title="Decrease stock by 1"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                className="sa-stock-inp"
                                value={p.stock}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                                  setProducts((prev) =>
                                    prev.map((item) => (item.id === p.id ? { ...item, stock: val } : item))
                                  );
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                                  updateStockInline(p.id, val);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="sa-stock-btn"
                                onClick={() => updateStockInline(p.id, (p.stock || 0) + 1)}
                                title="Increase stock by 1"
                              >
                                +
                              </button>
                            </div>

                            {/* Warning or Infinite button */}
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {isLowStock && (
                                <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>
                                  ⚠️ Low Stock
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => updateStockInline(p.id, null)}
                                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 10, cursor: 'pointer', padding: 0 }}
                                title="Switch to unlimited inventory"
                              >
                                Set ∞
                              </button>
                            </div>
                          </div>
                        )}

                        {feedback && (
                          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700, animation: 'saUp .2s' }}>
                            {feedback}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Price */}
                    <td className="r">
                      <div>
                        <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{taka(p.price)}</div>
                        {p.compareAt && p.compareAt > p.price && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            <s>{taka(p.compareAt)}</s>{' '}
                            <span style={{ color: '#10b981' }}>
                              -{Math.round((1 - p.price / p.compareAt) * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="r nowrap">
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="sa-btn ghost sa-mini" onClick={() => setEdit(p)} style={{ fontSize: 12, padding: '5px 10px' }}>
                          ✏️ Edit
                        </button>
                        <button className="sa-btn ghost sa-mini" onClick={() => dup(p)} title="Duplicate product" style={{ fontSize: 12, padding: '5px 8px' }}>
                          📋
                        </button>
                        <button className="sa-btn ghost sa-mini" onClick={() => del(p.id)} style={{ fontSize: 12, padding: '5px 8px', color: '#f87171' }} title="Delete product">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expandable Variations Inventory Drawer */}
                  {isExpanded && hasVariants && (
                    <tr className="variant-drawer-row">
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div style={{ padding: '14px 20px', background: '#120f24', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>⚡ Individual Variant Inventory ({p.name})</span>
                            </div>
                            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>
                              Changes to variant stock are auto-saved. Blank means unlimited.
                            </span>
                          </div>

                          <div className="variant-subgrid">
                            {p.variations.map((v: any) => (
                              <div key={v.id} className="variant-subcard">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{v.title || `${v.size || ''} ${v.color || ''}`}</span>
                                  {v.colorHex && (
                                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: v.colorHex, border: '1px solid rgba(255,255,255,0.3)', display: 'inline-block' }} />
                                  )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#94a3b8' }}>
                                  <span>Price: {taka(v.price || p.price)}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span>Stock:</span>
                                    <input
                                      style={{ width: 56, padding: '3px 6px', fontSize: 12, textAlign: 'center', background: '#1b1730', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5, color: '#fff' }}
                                      placeholder="∞"
                                      defaultValue={v.stock == null ? '' : v.stock}
                                      onBlur={(e) => updateVariantStock(p.id, v.id, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {loading && <div className="sa-empty">Loading catalog and warehouse inventory…</div>}
        {!loading && sortedProducts.length === 0 && (
          <div className="sa-empty" style={{ padding: 40, textAlign: 'center' }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 10 }}>📦</span>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>No products match your criteria</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Try resetting search filters or add a new luxury product.</div>
            <button className="sa-btn" onClick={() => setEdit({})}>Add First Product</button>
          </div>
        )}
      </div>

      {/* Product Uploader & Editor Modal */}
      {edit !== null && (
        <ProductForm
          product={edit}
          cats={cats}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            load();
          }}
        />
      )}
    </>
  );
}

function ProductForm({ product, cats, onClose, onSaved }: { product: any; cats: any[]; onClose: () => void; onSaved: () => void }) {
  const isNew = !product.id;
  const [tab, setTab] = useState<'general' | 'media' | 'variations' | 'desc' | 'inventory' | 'seo'>('general');
  const [f, setF] = useState<any>(() => {
    const base: any = {
      name: '',
      slug: '',
      sku: '',
      price: '',
      compareAt: '',
      stock: '',
      lowStockThreshold: 5,
      category: cats[0]?.slug || 'skincare',
      adult: false,
      soldOut: false,
      tag: '',
      desc: '',
      shortDesc: '',
      longDesc: '',
      size: '',
      image: '',
      weight: '',
      customDeliveryInside: '',
      customDeliveryOutside: '',
      seoTitle: '',
      seoDesc: '',
      isDigital: false,
      digitalFileUrl: '',
      digitalInstructions: '',
      variations: [],
      colors: [],
      ...product,
    };
    if (!Array.isArray(base.images)) base.images = base.image ? [base.image] : [];
    if (!Array.isArray(base.variations)) base.variations = [];
    if (!Array.isArray(base.colors)) base.colors = [];
    return base;
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    type: 'color' | 'variation' | 'gallery';
    idOrName: string;
    title: string;
    currentImg: string;
  } | null>(null);

  // Quick variant generator state
  const [newVarSize, setNewVarSize] = useState('');
  const [newVarColor, setNewVarColor] = useState('');
  const [newVarPrice, setNewVarPrice] = useState('');
  const [newVarStock, setNewVarStock] = useState('');
  const [customColorName, setCustomColorName] = useState('');
  const [customColorHex, setCustomColorHex] = useState('#111111');
  const [bulkVarPrice, setBulkVarPrice] = useState('');
  const [bulkVarStock, setBulkVarStock] = useState('');

  const [masterColors, setMasterColors] = useState<MasterColor[]>([]);
  useEffect(() => {
    fetchMasterColors().then((cols) => {
      if (cols && cols.length > 0) setMasterColors(cols);
    });
  }, []);

  const handleSaveNewMasterColor = async () => {
    if (!customColorName.trim()) return;
    const name = customColorName.trim();
    const hex = customColorHex;
    addColorOption({ name, hex });
    const res = await createMasterColor(name, hex);
    if (res.colors && res.colors.length > 0) setMasterColors(res.colors);
    setCustomColorName('');
  };

  const COLOR_PRESETS = [
    { name: 'Sky Blue', hex: '#38BDF8' },
    { name: 'Baby Pink', hex: '#F472B6' },
    { name: 'Cream Milk', hex: '#FEF3C7' },
    { name: 'Mint Green', hex: '#A7F3D0' },
    { name: 'Peach Rose', hex: '#FDA4AF' },
    { name: 'Pure White', hex: '#FFFFFF' },
    { name: 'Classic Navy', hex: '#1E3A8A' },
    { name: 'Lemon Yellow', hex: '#FDE047' },
    { name: 'Lavender', hex: '#E9D5FF' },
    { name: 'Soft Grey', hex: '#E2E8F0' },
  ];

  const TAG_PRESETS = ['🔥 বেস্ট সেলার', '🎀 নিউ কালেকশন', '⭐ টপ রেটেড', '🎁 গিফট প্যাক', '🌿 ১০০% অর্গানিক সুতি', '🧸 কিউট রম্পার', '👑 পার্টি স্পেশাল'];

  const addColorOption = (col: { name: string; hex: string; image?: string }) => {
    const existing = f.colors || [];
    if (existing.some((c: any) => (typeof c === 'string' ? c : c.name).toLowerCase() === col.name.toLowerCase())) return;
    setF((s: any) => ({ ...s, colors: [...(s.colors || []), { ...col, image: col.image || '' }] }));
  };

  const removeColorOption = (name: string) => {
    setF((s: any) => ({
      ...s,
      colors: (s.colors || []).filter((c: any) => (typeof c === 'string' ? c : c.name) !== name),
    }));
  };

  // Color photo upload and linking
  const uploadColorPhoto = async (colorName: string, file?: File) => {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const d = await uploadOptimizedImage(file);
      setF((s: any) => {
        const newImages = Array.from(new Set([...(s.images || []), d.url]));

        const updatedColors = (s.colors || []).map((c: any) => {
          const cName = typeof c === 'string' ? c : c.name;
          if (cName.toLowerCase() === colorName.toLowerCase()) {
            return typeof c === 'string' ? { name: c, hex: '#111111', image: d.url } : { ...c, image: d.url };
          }
          return c;
        });

        const updatedVariations = (s.variations || []).map((v: any) => {
          if (v.color?.toLowerCase() === colorName.toLowerCase() && !v.image) {
            return { ...v, image: d.url };
          }
          return v;
        });

        return {
          ...s,
          images: newImages,
          image: s.image || d.url,
          colors: updatedColors,
          variations: updatedVariations,
        };
      });
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const assignColorPhoto = (colorName: string, imgUrl: string) => {
    setF((s: any) => {
      const updatedColors = (s.colors || []).map((c: any) => {
        const cName = typeof c === 'string' ? c : c.name;
        if (cName.toLowerCase() === colorName.toLowerCase()) {
          return typeof c === 'string' ? { name: c, hex: '#111111', image: imgUrl } : { ...c, image: imgUrl };
        }
        return c;
      });

      const updatedVariations = (s.variations || []).map((v: any) => {
        if (v.color?.toLowerCase() === colorName.toLowerCase() && (!v.image || v.image === '')) {
          return { ...v, image: imgUrl };
        }
        return v;
      });

      return { ...s, colors: updatedColors, variations: updatedVariations };
    });
  };

  const removeColorPhoto = (colorName: string) => {
    setF((s: any) => ({
      ...s,
      colors: (s.colors || []).map((c: any) => {
        const cName = typeof c === 'string' ? c : c.name;
        if (cName.toLowerCase() === colorName.toLowerCase()) {
          return typeof c === 'string' ? { name: c, hex: '#111111', image: '' } : { ...c, image: '' };
        }
        return c;
      }),
    }));
  };

  const assignImageToColor = (imgUrl: string, colorName: string) => {
    if (!colorName) {
      // Unlink color
      setF((s: any) => ({
        ...s,
        colors: (s.colors || []).map((c: any) => {
          if (typeof c === 'object' && c.image === imgUrl) return { ...c, image: '' };
          return c;
        }),
      }));
      return;
    }
    assignColorPhoto(colorName, imgUrl);
  };

  const getColorLinkedToImage = (imgUrl: string) => {
    const found = (f.colors || []).find((c: any) => {
      const cImg = typeof c === 'object' ? c.image : '';
      return cImg === imgUrl;
    });
    if (found) return typeof found === 'string' ? found : found.name;
    const vFound = (f.variations || []).find((v: any) => v.image === imgUrl);
    return vFound?.color || '';
  };

  const uploadVariationPhoto = async (variationId: string, file?: File) => {
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const d = await uploadOptimizedImage(file);
      setF((s: any) => {
        const newImages = [...(s.images || [])];
        if (!newImages.includes(d.url)) newImages.push(d.url);
        const updatedVariations = (s.variations || []).map((v: any) =>
          v.id === variationId ? { ...v, image: d.url } : v
        );
        return { ...s, images: newImages, variations: updatedVariations };
      });
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const generateColorSizeMatrix = (sizes: string[]) => {
    const currentColors: { name: string; hex?: string; image?: string }[] =
      f.colors && f.colors.length > 0
        ? f.colors.map((c: any) => (typeof c === 'string' ? { name: c, hex: '#111111', image: '' } : c))
        : [{ name: 'Standard', hex: '#111111', image: '' }];

    const newVars: any[] = [];
    currentColors.forEach((c) => {
      sizes.forEach((sz) => {
        newVars.push({
          id: 'v_' + Math.random().toString(36).slice(2, 9),
          title: `${sz} / ${c.name}`,
          size: sz,
          color: c.name,
          colorHex: c.hex,
          price: parseInt(f.price, 10) || 0,
          stock: null,
          image: c.image || '',
        });
      });
    });
    setF((s: any) => ({
      ...s,
      variations: newVars,
      sizes: Array.from(new Set([...(s.sizes || []), ...sizes])),
    }));
  };

  const applyBulkVariantPrice = () => {
    if (!bulkVarPrice) return;
    const pVal = Math.max(0, parseInt(bulkVarPrice, 10) || 0);
    setF((s: any) => ({
      ...s,
      variations: (s.variations || []).map((v: any) => ({ ...v, price: pVal })),
    }));
    setBulkVarPrice('');
  };

  const applyBulkVariantStock = () => {
    const sVal = bulkVarStock === '' ? null : Math.max(0, parseInt(bulkVarStock, 10) || 0);
    setF((s: any) => ({
      ...s,
      variations: (s.variations || []).map((v: any) => ({ ...v, stock: sVal })),
    }));
    setBulkVarStock('');
  };

  const autoGenerateSKU = () => {
    const catCode = (f.category || 'GEN').slice(0, 3).toUpperCase();
    const nameCode = (f.name || 'PRD').split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase() || 'ITM';
    const rand = Math.floor(100 + Math.random() * 900);
    setF((s: any) => ({ ...s, sku: `${catCode}-${nameCode}-${rand}` }));
  };

  const slugify = (s: string) =>
    String(s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const set = (k: string) => (e: any) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((s: any) => {
      const updated = { ...s, [k]: val };
      if (k === 'name' && isNew && !s.slugManuallyEdited) {
        updated.slug = slugify(val);
      }
      return updated;
    });
  };

  const addImg = (url: string) => {
    if (!url) return;
    setF((s: any) => {
      const existing = s.images || [];
      if (existing.includes(url)) return s;
      const images = [...existing, url];
      return { ...s, images, image: s.image || images[0] };
    });
  };

  const removeImg = (i: number) =>
    setF((s: any) => {
      const images = (s.images || []).filter((_: any, x: number) => x !== i);
      return { ...s, images, image: images[0] || '' };
    });

  const setAsFeaturedImg = (i: number) =>
    setF((s: any) => {
      const imgList = [...(s.images || [])];
      const picked = imgList.splice(i, 1)[0];
      if (picked) imgList.unshift(picked);
      return { ...s, images: imgList, image: picked || '' };
    });

  const uploadFiles = async (files?: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (list.length === 0) return;

    setUploading(true);
    setErr('');
    setUploadProgress({ current: 0, total: list.length });

    const newUrls: string[] = [];

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      setUploadProgress({ current: i + 1, total: list.length });
      try {
        const d = await uploadOptimizedImage(file);
        if (d && d.url) {
          if (!newUrls.includes(d.url)) newUrls.push(d.url);
        }
      } catch (err: any) {
        console.error('Upload failed for file', file.name, err);
      }
    }

    if (newUrls.length > 0) {
      setF((s: any) => {
        const existing = s.images || [];
        const merged = Array.from(new Set([...existing, ...newUrls]));
        return {
          ...s,
          images: merged,
          image: s.image || merged[0] || '',
        };
      });
    }

    setUploading(false);
    setUploadProgress(null);
  };

  const upload = (file?: File) => file && uploadFiles([file]);

  // Add variation row
  const addVariation = () => {
    if (!newVarSize.trim() && !newVarColor.trim()) return;
    const title = [newVarSize.trim(), newVarColor.trim()].filter(Boolean).join(' / ');
    const matchedCol = (f.colors || []).find((c: any) => (typeof c === 'string' ? c : c.name).toLowerCase() === newVarColor.trim().toLowerCase());
    const inheritImg = typeof matchedCol === 'object' ? matchedCol.image : '';
    const v = {
      id: 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 5),
      title,
      size: newVarSize.trim(),
      color: newVarColor.trim(),
      colorHex: typeof matchedCol === 'object' && matchedCol.hex ? matchedCol.hex : '#111111',
      price: newVarPrice ? Math.max(0, parseInt(newVarPrice, 10)) : parseInt(f.price, 10) || 0,
      stock: newVarStock !== '' ? Math.max(0, parseInt(newVarStock, 10)) : null,
      image: inheritImg || '',
    };
    setF((s: any) => ({ ...s, variations: [...(s.variations || []), v] }));
    setNewVarSize('');
    setNewVarColor('');
    setNewVarPrice('');
    setNewVarStock('');
  };

  const removeVariation = (id: string) => {
    setF((s: any) => ({ ...s, variations: (s.variations || []).filter((v: any) => v.id !== id) }));
  };

  const updateVariation = (id: string, key: string, val: any) => {
    setF((s: any) => ({
      ...s,
      variations: (s.variations || []).map((v: any) => (v.id === id ? { ...v, [key]: val } : v)),
    }));
  };

  const save = async () => {
    setErr('');
    setBusy(true);
    try {
      const payload = {
        ...f,
        price: parseInt(f.price, 10) || 0,
        compareAt: f.compareAt ? parseInt(f.compareAt, 10) || 0 : 0,
        stock: f.stock === '' || f.stock === null ? null : parseInt(f.stock, 10),
        lowStockThreshold: f.lowStockThreshold ? parseInt(f.lowStockThreshold, 10) : 5,
        colors: (f.colors || []).map((c: any) =>
          typeof c === 'string' ? { name: c, hex: '#111111', image: '' } : { name: c.name, hex: c.hex || '#111111', image: c.image || '' }
        ),
        variations: (f.variations || []).map((v: any) => ({
          ...v,
          price: parseInt(v.price, 10) || parseInt(f.price, 10) || 0,
          stock: v.stock === '' || v.stock === null ? null : parseInt(v.stock, 10),
          image: v.image || '',
        })),
      };
      const r = await aFetch(isNew ? '/products' : '/products/' + product.id, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const salePercent =
    f.price && f.compareAt && Number(f.compareAt) > Number(f.price)
      ? Math.round((1 - Number(f.price) / Number(f.compareAt)) * 100)
      : 0;

  const savingsAmount =
    f.price && f.compareAt && Number(f.compareAt) > Number(f.price)
      ? Number(f.compareAt) - Number(f.price)
      : 0;

  return (
    <div className="sa-modal-wrap" onClick={onClose}>
      <div className="sa-modal" style={{ width: 'min(940px, 98%)', maxHeight: '95vh' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sa-modal-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#120f21', padding: '16px 24px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{isNew ? '✨' : '✏️'}</span>
              <span>{isNew ? 'Add New Product Studio' : `Edit Product: ${f.name || 'Untitled'}`}</span>
            </h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>WooCommerce / WordPress Style Variations & Stock Manager</span>
              {!isNew && f.slug && (
                <a
                  href={`/#product/${f.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 11.5, color: '#a78bfa', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}
                >
                  ↗ View on Live Store
                </a>
              )}
            </div>
          </div>
          <button className="x" onClick={onClose} style={{ fontSize: 24, background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: 4, padding: '8px 24px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#100e1c', overflowX: 'auto' }}>
          <button
            type="button"
            onClick={() => setTab('general')}
            style={{
              padding: '10px 16px',
              background: tab === 'general' ? '#1f1b35' : 'transparent',
              border: 'none',
              borderBottom: tab === 'general' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: tab === 'general' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            📌 General & Pricing
          </button>
          <button
            type="button"
            onClick={() => setTab('media')}
            style={{
              padding: '10px 16px',
              background: tab === 'media' ? '#1f1b35' : 'transparent',
              border: 'none',
              borderBottom: tab === 'media' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: tab === 'media' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            🖼️ Photo Studio ({f.images?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setTab('variations')}
            style={{
              padding: '10px 16px',
              background: tab === 'variations' ? '#1f1b35' : 'transparent',
              border: 'none',
              borderBottom: tab === 'variations' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: tab === 'variations' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            🎨 Colors & Sizes ({f.colors?.length || 0} Colors · {f.variations?.length || 0} Variants)
          </button>
          <button
            type="button"
            onClick={() => setTab('desc')}
            style={{
              padding: '10px 16px',
              background: tab === 'desc' ? '#1f1b35' : 'transparent',
              border: 'none',
              borderBottom: tab === 'desc' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: tab === 'desc' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            📝 Story & Specs
          </button>
          <button
            type="button"
            onClick={() => setTab('inventory')}
            style={{
              padding: '10px 16px',
              background: tab === 'inventory' ? '#1f1b35' : 'transparent',
              border: 'none',
              borderBottom: tab === 'inventory' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: tab === 'inventory' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            📦 Warehouse & Stock
          </button>
          <button
            type="button"
            onClick={() => setTab('seo')}
            style={{
              padding: '10px 16px',
              background: tab === 'seo' ? '#1f1b35' : 'transparent',
              border: 'none',
              borderBottom: tab === 'seo' ? '2px solid #8b5cf6' : '2px solid transparent',
              color: tab === 'seo' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
            }}
          >
            🔍 Google & Social SEO
          </button>
        </div>

        {/* Modal Body */}
        <div className="sa-modal-b" style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* TAB 1: GENERAL & PRICING */}
          {tab === 'general' && (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Product Title / Name *</label>
                <input
                  value={f.name}
                  onChange={set('name')}
                  placeholder="e.g. Royal Silk Dubai Abaya - Noir Black"
                  style={{ fontSize: 16, fontWeight: 600 }}
                />
              </div>

              <div className="sa-frow">
                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Permalink URL / Slug</label>
                  <input
                    value={f.slug}
                    onChange={(e) => {
                      setF((s: any) => ({ ...s, slug: slugify(e.target.value), slugManuallyEdited: true }));
                    }}
                    placeholder="royal-silk-dubai-abaya-noir-black"
                  />
                  <small style={{ color: '#64748b', fontSize: 11 }}>View URL: yourdomain.com/#product/{f.slug || 'product-slug'}</small>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ margin: 0 }}>SKU / Product Code</label>
                    <button
                      type="button"
                      onClick={autoGenerateSKU}
                      style={{ background: 'none', border: 'none', color: '#a78bfa', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}
                    >
                      ⚡ Auto SKU
                    </button>
                  </div>
                  <input value={f.sku || ''} onChange={set('sku')} placeholder="e.g. ABY-BLK-842" />
                </div>
              </div>

              {/* Product Nature & Delivery Type */}
              <div style={{ background: '#191530', padding: 14, borderRadius: 10, border: '1px solid rgba(139, 92, 246, 0.3)', marginBottom: 8 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: '#c4b5fd', fontSize: 13 }}>
                  📦 Product Delivery & Fulfillment Type
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      color: '#fff',
                      fontSize: 12.5,
                      background: !f.isDigital ? 'rgba(139,92,246,0.25)' : 'transparent',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: !f.isDigital ? '1.5px solid #8b5cf6' : '1px solid rgba(255,255,255,0.1)',
                      fontWeight: !f.isDigital ? 700 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="prodType"
                      checked={!f.isDigital}
                      onChange={() => setF((s: any) => ({ ...s, isDigital: false }))}
                    />
                    <span>📦 Physical Product (Courier Shipping - Cloth, Watches, Sunglasses, Gifts)</span>
                  </label>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      color: '#fff',
                      fontSize: 12.5,
                      background: f.isDigital ? 'rgba(16,185,129,0.25)' : 'transparent',
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: f.isDigital ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                      fontWeight: f.isDigital ? 700 : 400,
                    }}
                  >
                    <input
                      type="radio"
                      name="prodType"
                      checked={!!f.isDigital}
                      onChange={() => setF((s: any) => ({ ...s, isDigital: true }))}
                    />
                    <span>⚡ Digital Product (Instant Download / Voucher / Key - ৳0 Delivery)</span>
                  </label>
                </div>

                {f.isDigital && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'rgba(0,0,0,0.35)', padding: 12, borderRadius: 8, border: '1px dashed rgba(16, 185, 129, 0.4)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#34d399', marginBottom: 4, fontWeight: 600 }}>Download URL / Drive Link / Resource Link</label>
                      <input
                        placeholder="https://drive.google.com/... or download file link"
                        value={f.digitalFileUrl || ''}
                        onChange={(e) => setF((s: any) => ({ ...s, digitalFileUrl: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#34d399', marginBottom: 4, fontWeight: 600 }}>Access Guide / License Instructions / Keys</label>
                      <textarea
                        rows={2}
                        placeholder="Instructions, license codes, or WhatsApp access info sent to customer upon order..."
                        value={f.digitalInstructions || ''}
                        onChange={(e) => setF((s: any) => ({ ...s, digitalInstructions: e.target.value }))}
                      />
                    </div>
                    <div style={{ color: '#10b981', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✓</span> <b>Automatic ৳0 Shipping:</b> Courier charges are automatically waived on checkout for digital items.
                    </div>
                  </div>
                )}
              </div>

              {/* Pricing Intelligence Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(139, 92, 246, 0.02) 100%)',
                  padding: 18,
                  borderRadius: 12,
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>💰</span> Pricing & Margin Calculator
                </div>
                <div className="sa-frow">
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontWeight: 700, color: '#ffffff' }}>
                      Selling Price (৳) * (Customer Pays)
                    </label>
                    <input
                      value={f.price}
                      onChange={set('price')}
                      placeholder="e.g. 2450"
                      style={{ fontWeight: 700, fontSize: 18, color: '#34d399' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, color: '#94a3b8' }}>
                      Original / Compare-at Price (৳) (Crossed-out)
                    </label>
                    <input value={f.compareAt} onChange={set('compareAt')} placeholder="e.g. 3200" style={{ fontSize: 16 }} />
                  </div>
                </div>

                {salePercent > 0 && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    <span style={{ background: '#10b981', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6 }}>
                      🔥 {salePercent}% OFF
                    </span>
                    <span style={{ fontSize: 13, color: '#cbd5e1' }}>
                      Customer saves <b>{taka(savingsAmount)}</b> on this purchase
                    </span>
                  </div>
                )}
              </div>

              {/* Category & Badge Selector */}
              <div className="sa-frow">
                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Store Category *</label>
                  <select value={f.category} onChange={set('category')} style={{ fontSize: 14 }}>
                    {cats.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Product Highlight Badge</label>
                  <input value={f.tag} onChange={set('tag')} placeholder="e.g. Bestseller, New, -25% Sale" />
                </div>
              </div>

              {/* Tag Preset Chips */}
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Quick Tag Presets:
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {TAG_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setF((s: any) => ({ ...s, tag: t }))}
                      style={{
                        background: f.tag === t ? '#8b5cf6' : 'rgba(255,255,255,0.06)',
                        color: f.tag === t ? '#fff' : '#cbd5e1',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '4px 10px',
                        borderRadius: 100,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                  {f.tag && (
                    <button
                      type="button"
                      onClick={() => setF((s: any) => ({ ...s, tag: '' }))}
                      style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 12, cursor: 'pointer', padding: '4px 8px' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Availability & Safety Toggles */}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 6, background: '#161326', padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                <label className="sa-chk" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.soldOut} onChange={set('soldOut')} />
                  <span>🔴 Mark as Sold Out (Disables Add to Cart on storefront)</span>
                </label>
                <label className="sa-chk" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.adult} onChange={set('adult')} />
                  <span>🔞 18+ Age Gated (Prompts birthdate verification modal)</span>
                </label>
              </div>
            </>
          )}

          {/* TAB 2: PHOTO STUDIO WITH COLOR LINKING */}
          {tab === 'media' && (
            <>
              {/* Top Media Library Selector Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10, background: '#18142b', padding: '12px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  className="sa-btn primary"
                  style={{ background: '#7c3aed', borderColor: '#7c3aed', padding: '8px 18px', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  onClick={() => setPickerTarget({ type: 'gallery', idOrName: 'gallery', title: 'Product Gallery', currentImg: '' })}
                >
                  <span>🖼️</span>
                  <span>Choose from Media Library</span>
                </button>
                <div style={{ fontSize: 12, color: '#34d399', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⚡</span>
                  <span>Photos automatically convert to WebP / SVG (Max 100 KB)</span>
                </div>
              </div>

              {/* Dropzone */}
              <div
                className={`sa-uploader-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) uploadFiles(e.dataTransfer.files);
                }}
                onClick={() => setPickerTarget({ type: 'gallery', idOrName: 'gallery', title: 'Product Gallery', currentImg: '' })}
              >
                <input
                  id="photo-studio-file-input"
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) uploadFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <span style={{ fontSize: 32 }}>🖼️</span>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>
                  {uploading
                    ? uploadProgress
                      ? `Uploading photos (${uploadProgress.current}/${uploadProgress.total})…`
                      : 'Uploading Photos…'
                    : 'Click to Choose from Website Gallery (or Drag & Drop Photos Here)'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>
                  Opens gallery first so you can pick existing photos without re-uploading. You can also upload new ones anytime.
                </div>
              </div>

              {/* Gallery Grid with Color Tagging */}
              <div style={{ background: '#161326', padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#c4b5fd' }}>
                      Gallery Preview ({(f.images || []).length} photos uploaded)
                    </span>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                      Assign photos to specific colors below so customers see the right photo when picking a color swatch!
                    </div>
                  </div>
                  {Array.isArray(f.images) && new Set(f.images).size < f.images.length && (
                    <button
                      type="button"
                      onClick={() => {
                        setF((s: any) => ({ ...s, images: Array.from(new Set(s.images || [])) }));
                      }}
                      className="sa-btn ghost sa-mini"
                      style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.4)' }}
                      title="Remove duplicate photos from gallery"
                    >
                      ✨ Clean Duplicates ({f.images.length - new Set(f.images).size})
                    </button>
                  )}
                </div>

                {(!f.images || f.images.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: 13 }}>
                    No photos uploaded yet. Drop an image above or paste a URL below.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 }}>
                    {f.images.map((im: string, i: number) => {
                      const linkedColor = getColorLinkedToImage(im);

                      return (
                        <div
                          key={i}
                          style={{
                            background: '#120f21',
                            borderRadius: 10,
                            overflow: 'hidden',
                            border: i === 0 ? '2px solid #8b5cf6' : linkedColor ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                            padding: 6,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden' }}>
                            <img src={im} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            {i === 0 && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  background: '#8b5cf6',
                                  color: '#fff',
                                  fontSize: 9.5,
                                  textAlign: 'center',
                                  padding: '2px 0',
                                  fontWeight: 700,
                                }}
                              >
                                ★ COVER
                              </div>
                            )}

                            {linkedColor && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 4,
                                  left: 4,
                                  right: 4,
                                  background: 'rgba(0,0,0,0.85)',
                                  color: '#34d399',
                                  fontSize: 10,
                                  padding: '2px 4px',
                                  borderRadius: 4,
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  border: '1px solid rgba(16, 185, 129, 0.4)',
                                  textOverflow: 'ellipsis',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                🎨 {linkedColor}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => removeImg(i)}
                              title="Remove image"
                              style={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: 'rgba(0,0,0,0.75)',
                                color: '#fff',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: 13,
                              }}
                            >
                              ×
                            </button>
                          </div>

                          {/* Link to Color selector */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>Link to Color:</span>
                            <select
                              value={linkedColor}
                              onChange={(e) => assignImageToColor(im, e.target.value)}
                              style={{
                                fontSize: 11,
                                padding: '3px 4px',
                                background: '#1c1830',
                                border: '1px solid rgba(255,255,255,0.15)',
                                borderRadius: 5,
                                color: linkedColor ? '#34d399' : '#fff',
                                fontWeight: linkedColor ? 700 : 400,
                              }}
                            >
                              <option value="">(All / General)</option>
                              {(f.colors || []).map((c: any) => {
                                const cName = typeof c === 'string' ? c : c.name;
                                return (
                                  <option key={cName} value={cName}>
                                    🎨 {cName}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => setAsFeaturedImg(i)}
                              title="Set as Cover"
                              className="sa-btn ghost sa-mini"
                              style={{ padding: '2px 4px', fontSize: 10, textAlign: 'center' }}
                            >
                              ★ Set Cover
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* External URL adder */}
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <input
                    placeholder="Or paste external CDN / Web image URL (e.g. https://...)"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && urlInput.trim()) {
                        addImg(urlInput.trim());
                        setUrlInput('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="sa-btn ghost"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => {
                      if (urlInput.trim()) {
                        addImg(urlInput.trim());
                        setUrlInput('');
                      }
                    }}
                  >
                    + Add URL
                  </button>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: COLORS & SIZES MATRIX (WOOCOMMERCE STYLE ATTRIBUTES & PHOTOS) */}
          {tab === 'variations' && (
            <>
              {/* Card 1: Color Swatch Manager with Photo Studio */}
              <div style={{ background: '#161326', padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ marginBottom: 14 }}>
                  <h4 style={{ margin: 0, fontSize: 14, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>🎨</span> Product Colors & Color-Specific Photos
                  </h4>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                    Upload or assign a dedicated product photo for each color. When a buyer selects this color on the store, the photo automatically switches to show this color!
                  </p>
                </div>

                {/* Active Selected Colors with Photos */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {!f.colors || f.colors.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', padding: '16px 0', color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                      No colors added yet. Click a preset below or enter a custom color to get started.
                    </div>
                  ) : (
                    f.colors.map((c: any) => {
                      const cName = typeof c === 'string' ? c : c.name;
                      const cHex = typeof c === 'object' && c.hex ? c.hex : '#111111';
                      const cImg = typeof c === 'object' && c.image ? c.image : '';

                      return (
                        <div
                          key={cName}
                          style={{
                            background: '#1a162e',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 10,
                            padding: '10px 12px',
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                          }}
                        >
                          {/* Color Photo Preview with 1-click Visual Picker trigger */}
                          <div
                            onClick={() => setPickerTarget({ type: 'color', idOrName: cName, title: cName, currentImg: cImg })}
                            style={{
                              width: 52,
                              height: 64,
                              borderRadius: 8,
                              overflow: 'hidden',
                              background: '#120f21',
                              border: cImg ? '1.5px solid #8b5cf6' : '1px dashed rgba(255,255,255,0.25)',
                              flexShrink: 0,
                              position: 'relative',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            title="Click to select or upload photo for this color"
                          >
                            {cImg ? (
                              <>
                                <img src={cImg} alt={cName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <div
                                  style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    background: 'rgba(0,0,0,0.7)',
                                    color: '#fff',
                                    fontSize: 8.5,
                                    textAlign: 'center',
                                    padding: '1px 0',
                                    fontWeight: 600,
                                  }}
                                >
                                  Change
                                </div>
                              </>
                            ) : (
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 2,
                                  color: '#a78bfa',
                                }}
                              >
                                <span style={{ fontSize: 16 }}>📸</span>
                                <span style={{ fontSize: 9.5, fontWeight: 600 }}>+ Photo</span>
                              </div>
                            )}
                          </div>

                          {/* Color Name, Swatch & Action */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ width: 14, height: 14, borderRadius: '50%', background: cHex, border: '1px solid rgba(255,255,255,0.4)', flexShrink: 0 }} />
                              <span style={{ fontWeight: 700, color: '#fff', fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {cName}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace', marginBottom: 6 }}>
                              {cHex}
                            </div>

                            {/* 1-Click Photo Picker Pill */}
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => setPickerTarget({ type: 'color', idOrName: cName, title: cName, currentImg: cImg })}
                                className="sa-btn ghost sa-mini"
                                style={{ fontSize: 10.5, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <span>🖼️</span>
                                <span>{cImg ? 'Change Photo' : 'Select Photo'}</span>
                              </button>
                              {cImg && (
                                <button
                                  type="button"
                                  onClick={() => removeColorPhoto(cName)}
                                  style={{ background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer', padding: '2px 4px' }}
                                  title="Unassign photo"
                                >
                                  ✕ Remove
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Remove Color Option */}
                          <button
                            type="button"
                            onClick={() => removeColorOption(cName)}
                            title="Remove color"
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 18, padding: 0 }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Master Color Library (Permanent Store-Wide Colors) */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      ⚡ Master Color Library (Click any color to add/remove from this product)
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                      {masterColors.length || COLOR_PRESETS.length} colors saved
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      flexWrap: 'wrap',
                      maxHeight: 150,
                      overflowY: 'auto',
                      padding: 6,
                      background: '#120f21',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {(masterColors.length > 0 ? masterColors : COLOR_PRESETS).map((p: any) => {
                      const isSelected = (f.colors || []).some(
                        (c: any) => (typeof c === 'string' ? c : c.name).toLowerCase() === p.name.toLowerCase()
                      );
                      return (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              removeColorOption(p.name);
                            } else {
                              addColorOption(p);
                            }
                          }}
                          className="sa-btn ghost sa-mini"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 10px',
                            fontSize: 11.5,
                            border: isSelected ? '1.5px solid #8b5cf6' : '1px solid rgba(255,255,255,0.15)',
                            background: isSelected ? 'rgba(139, 92, 246, 0.28)' : 'rgba(255,255,255,0.02)',
                            color: isSelected ? '#fff' : '#cbd5e1',
                            fontWeight: isSelected ? 700 : 400,
                          }}
                          title={isSelected ? 'Click to remove from this product' : 'Click to add to this product'}
                        >
                          <span
                            style={{
                              width: 11,
                              height: 11,
                              borderRadius: '50%',
                              background: p.hex,
                              border: '1px solid rgba(255,255,255,0.3)',
                              display: 'inline-block',
                            }}
                          />
                          <span>{p.name}</span>
                          {isSelected && <span style={{ color: '#34d399', fontSize: 11 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Create New Color & Save to Master Library */}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    background: '#120f21',
                    padding: '10px 14px',
                    borderRadius: 8,
                    flexWrap: 'wrap',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#c4b5fd', fontWeight: 600 }}>Create New Master Color:</span>
                  <input
                    placeholder="Color Name (e.g. Royal Maroon, Rose Gold)"
                    value={customColorName}
                    onChange={(e) => setCustomColorName(e.target.value)}
                    style={{ maxWidth: 220, padding: '6px 10px', fontSize: 12 }}
                  />
                  <input
                    type="color"
                    value={customColorHex}
                    onChange={(e) => setCustomColorHex(e.target.value)}
                    style={{ width: 36, height: 32, padding: 2, borderRadius: 6, border: 'none', cursor: 'pointer' }}
                    title="Pick Color Swatch"
                  />
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'monospace' }}>{customColorHex}</span>
                  <button
                    type="button"
                    className="sa-btn primary sa-mini"
                    onClick={handleSaveNewMasterColor}
                    style={{ fontWeight: 600 }}
                  >
                    💾 Save to Library & Add to Product
                  </button>
                </div>
              </div>

              {/* Card 2: Variations Matrix & Sizes (WooCommerce Style) */}
              <div style={{ background: '#161326', padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, color: '#c4b5fd' }}>⚡ Generate Variations Matrix (Sizes & Colors)</h4>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                      Auto-generates all variation rows combining your selected colors and size runs, with individual photos, pricing, and stock.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="sa-btn ghost sa-mini" onClick={() => generateColorSizeMatrix(['0-3M', '3-6M', '6-12M', '12-18M'])}>
                      👶 Matrix: Baby Romper (0-18M)
                    </button>
                    <button type="button" className="sa-btn ghost sa-mini" onClick={() => generateColorSizeMatrix(['6-12M', '12-18M', '18-24M', '2-3Y'])}>
                      👦 Matrix: Toddler (6M-3Y)
                    </button>
                    <button type="button" className="sa-btn ghost sa-mini" onClick={() => generateColorSizeMatrix(['0-6M', '6-12M', '12-18M'])}>
                      👟 Matrix: Baby Shoes
                    </button>
                    <button type="button" className="sa-btn ghost sa-mini" onClick={() => generateColorSizeMatrix(['Free Size'])}>
                      🎁 Matrix: Free Size
                    </button>
                  </div>
                </div>

                {/* Bulk Variant Price & Stock Setters */}
                {f.variations && f.variations.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, background: '#120f21', padding: '10px 14px', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Bulk Actions:</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        placeholder="Price ৳"
                        value={bulkVarPrice}
                        onChange={(e) => setBulkVarPrice(e.target.value)}
                        style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                      />
                      <button type="button" className="sa-btn ghost sa-mini" onClick={applyBulkVariantPrice}>
                        Apply Price to All
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        placeholder="Stock qty"
                        value={bulkVarStock}
                        onChange={(e) => setBulkVarStock(e.target.value)}
                        style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                      />
                      <button type="button" className="sa-btn ghost sa-mini" onClick={applyBulkVariantStock}>
                        Apply Stock to All
                      </button>
                    </div>
                  </div>
                )}

                {/* Manual Add Single Variation Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, background: '#120f21', padding: 10, borderRadius: 8, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>Size</label>
                    <input placeholder="e.g. 54 or M" value={newVarSize} onChange={(e) => setNewVarSize(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>Color</label>
                    <input placeholder="e.g. Deep Maroon" value={newVarColor} onChange={(e) => setNewVarColor(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>Price (৳) (Blank = Base)</label>
                    <input placeholder={f.price ? `৳${f.price}` : 'Price'} value={newVarPrice} onChange={(e) => setNewVarPrice(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94a3b8' }}>Stock (Blank = ∞)</label>
                    <input placeholder="Stock qty" value={newVarStock} onChange={(e) => setNewVarStock(e.target.value)} />
                  </div>
                  <button type="button" className="sa-btn" onClick={addVariation} style={{ padding: '9px 14px' }}>
                    + Add
                  </button>
                </div>

                {/* Variations List Table */}
                <div style={{ marginTop: 14 }}>
                  {!f.variations || f.variations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748b', fontSize: 13 }}>
                      No variations generated yet. Standard single product pricing will apply.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', textAlign: 'left' }}>
                            <th style={{ padding: 8, width: 70 }}>Photo</th>
                            <th style={{ padding: 8 }}>Variation Title</th>
                            <th style={{ padding: 8 }}>Size</th>
                            <th style={{ padding: 8 }}>Color</th>
                            <th style={{ padding: 8 }}>SKU</th>
                            <th style={{ padding: 8 }}>Price (৳)</th>
                            <th style={{ padding: 8 }}>Stock</th>
                            <th style={{ padding: 8, textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {f.variations.map((v: any) => {
                            const matchedCol = (f.colors || []).find((c: any) => (typeof c === 'string' ? c : c.name).toLowerCase() === (v.color || '').toLowerCase());
                            const colorImg = typeof matchedCol === 'object' ? matchedCol.image : '';
                            const currentVarImg = v.image || colorImg || '';

                            return (
                              <tr key={v.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                {/* Photo column */}
                                <td style={{ padding: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div
                                      onClick={() =>
                                        setPickerTarget({
                                          type: 'variation',
                                          idOrName: v.id,
                                          title: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Variation',
                                          currentImg: currentVarImg,
                                        })
                                      }
                                      style={{
                                        width: 38,
                                        height: 48,
                                        borderRadius: 6,
                                        overflow: 'hidden',
                                        background: '#120f21',
                                        border: currentVarImg ? '1.5px solid #8b5cf6' : '1px dashed rgba(255,255,255,0.25)',
                                        flexShrink: 0,
                                        position: 'relative',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                      title="Click to select photo for this variation"
                                    >
                                      {currentVarImg ? (
                                        <img src={currentVarImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      ) : (
                                        <span style={{ fontSize: 13, color: '#a78bfa' }}>🖼️</span>
                                      )}
                                    </div>

                                    {/* Visual Picker Trigger Button */}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPickerTarget({
                                          type: 'variation',
                                          idOrName: v.id,
                                          title: v.title || `${v.size || ''} ${v.color || ''}`.trim() || 'Variation',
                                          currentImg: currentVarImg,
                                        })
                                      }
                                      className="sa-btn ghost sa-mini"
                                      style={{ fontSize: 10, padding: '2px 6px', whiteSpace: 'nowrap' }}
                                      title="Select photo from product gallery"
                                    >
                                      {v.image ? 'Change' : colorImg ? 'Color Photo' : '+ Photo'}
                                    </button>
                                  </div>
                                </td>

                                <td style={{ padding: 8, fontWeight: 600, color: '#fff' }}>{v.title}</td>

                                <td style={{ padding: 8 }}>
                                  <input style={{ width: 65, padding: '4px 8px' }} value={v.size || ''} onChange={(e) => updateVariation(v.id, 'size', e.target.value)} />
                                </td>

                                <td style={{ padding: 8 }}>
                                  <input style={{ width: 95, padding: '4px 8px' }} value={v.color || ''} onChange={(e) => updateVariation(v.id, 'color', e.target.value)} />
                                </td>

                                <td style={{ padding: 8 }}>
                                  <input
                                    style={{ width: 85, padding: '4px 8px', fontFamily: 'monospace', fontSize: 11 }}
                                    placeholder="SKU"
                                    value={v.sku || ''}
                                    onChange={(e) => updateVariation(v.id, 'sku', e.target.value)}
                                  />
                                </td>

                                <td style={{ padding: 8 }}>
                                  <input style={{ width: 85, padding: '4px 8px' }} value={v.price ?? f.price} onChange={(e) => updateVariation(v.id, 'price', parseInt(e.target.value, 10) || 0)} />
                                </td>

                                <td style={{ padding: 8 }}>
                                  <input style={{ width: 65, padding: '4px 8px' }} placeholder="∞" value={v.stock ?? ''} onChange={(e) => updateVariation(v.id, 'stock', e.target.value === '' ? null : parseInt(e.target.value, 10))} />
                                </td>

                                <td style={{ padding: 8, textAlign: 'right' }}>
                                  <button type="button" onClick={() => removeVariation(v.id)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>
                                    🗑️
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 4: DESCRIPTIONS & STORY */}
          {tab === 'desc' && (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>Short Description (Highlights / Summary)</label>
                <textarea
                  value={f.desc}
                  onChange={set('desc')}
                  placeholder="Short description displayed on catalog cards and above the purchase button..."
                  style={{ minHeight: 70 }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ margin: 0, fontWeight: 600 }}>Full Detailed Description (Fabric, Care & Specifications)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="sa-btn ghost sa-mini"
                      onClick={() =>
                        setF((s: any) => ({
                          ...s,
                          longDesc: (s.longDesc ? s.longDesc + '\n\n' : '') + '• Fabric: 100% Premium Imported Nida Silk\n• Style: Front Open / Closed Dubai Silhouette\n• Work: Intricate Hand-stitched Embellishments\n• Breathability: All-Season Breathable & Lightweight\n• Origin: Crafted with Master Artisans',
                        }))
                      }
                    >
                      + Fabric Specs
                    </button>
                    <button
                      type="button"
                      className="sa-btn ghost sa-mini"
                      onClick={() =>
                        setF((s: any) => ({
                          ...s,
                          longDesc: (s.longDesc ? s.longDesc + '\n\n' : '') + '• Care Guide: Gentle Dry Clean or Hand Wash with Mild Silk Detergent\n• Ironing: Low Heat Steam Iron on Reverse Side\n• Storage: Hang in Breathable Garment Cover',
                        }))
                      }
                    >
                      + Care Guide
                    </button>
                  </div>
                </div>
                <textarea
                  value={f.longDesc || ''}
                  onChange={set('longDesc')}
                  placeholder="Full detailed product description, fabric details, size chart guidance, wash care instructions, etc..."
                  style={{ minHeight: 180 }}
                />
              </div>
            </>
          )}

          {/* TAB 5: INVENTORY & WAREHOUSE LOGISTICS */}
          {tab === 'inventory' && (
            <>
              {/* Warehouse Inventory Control */}
              <div style={{ background: '#161326', padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h4 style={{ margin: 0, fontSize: 14, color: '#c4b5fd' }}>📦 Warehouse Stock Tracking</h4>
                  {f.stock != null && f.stock <= (f.lowStockThreshold || 5) && f.stock > 0 && (
                    <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      ⚠️ Low Stock Warning Active
                    </span>
                  )}
                </div>

                <div className="sa-frow">
                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Base Warehouse Stock Quantity</label>
                    <input value={f.stock ?? ''} onChange={set('stock')} placeholder="e.g. 50 (Leave blank for Unlimited)" />
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>Quick Restock:</span>
                      {[5, 10, 25, 50, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className="sa-btn ghost sa-mini"
                          style={{ padding: '2px 6px', fontSize: 11 }}
                          onClick={() => {
                            const current = f.stock === '' || f.stock === null ? 0 : parseInt(f.stock, 10) || 0;
                            setF((s: any) => ({ ...s, stock: current + n }));
                          }}
                        >
                          +{n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Low Stock Alert Threshold</label>
                    <input
                      type="number"
                      value={f.lowStockThreshold ?? 5}
                      onChange={set('lowStockThreshold')}
                      placeholder="Default: 5 units"
                    />
                    <small style={{ color: '#64748b', fontSize: 11 }}>Triggers alert on inventory dashboard when stock reaches this level.</small>
                  </div>
                </div>

                <div className="sa-frow" style={{ marginTop: 14 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Barcode / EAN (Optional)</label>
                    <input value={f.barcode || ''} onChange={set('barcode')} placeholder="e.g. 890123456789" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Shipping Weight (kg) (Optional)</label>
                    <input value={f.weight || ''} onChange={set('weight')} placeholder="e.g. 0.45" />
                  </div>
                </div>
              </div>

              {/* Courier Delivery Charges */}
              <div style={{ background: '#161326', padding: 18, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 13, color: '#c4b5fd' }}>🚚 Custom Delivery Charge Overrides</h4>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: '#94a3b8' }}>
                  Leave blank to inherit global store defaults (e.g. ৳70 Inside Dhaka / ৳130 Outside Dhaka).
                </p>
                <div className="sa-frow">
                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Delivery Inside Dhaka (৳)</label>
                    <input value={f.customDeliveryInside ?? ''} onChange={set('customDeliveryInside')} placeholder="Store default" />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6 }}>Delivery Outside Dhaka (৳)</label>
                    <input value={f.customDeliveryOutside ?? ''} onChange={set('customDeliveryOutside')} placeholder="Store default" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 6: SEO & GOOGLE PREVIEW */}
          {tab === 'seo' && (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: 6 }}>SEO Meta Title</label>
                <input value={f.seoTitle || ''} onChange={set('seoTitle')} placeholder={f.name ? `${f.name} | Exclusive Luxury Collection BD` : ''} />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 6 }}>SEO Meta Description</label>
                <textarea
                  value={f.seoDesc || ''}
                  onChange={set('seoDesc')}
                  placeholder="Meta description for Google search results and Facebook share preview..."
                  style={{ minHeight: 80 }}
                />
              </div>

              {/* Google Search Card Preview */}
              <div style={{ background: '#111827', padding: 16, borderRadius: 10, border: '1px solid #1f2937', marginTop: 10 }}>
                <span style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Google Search Preview</span>
                <div style={{ fontSize: 16, color: '#818cf8', fontWeight: 600, marginTop: 6 }}>
                  {f.seoTitle || f.name || 'Product Title'}
                </div>
                <div style={{ fontSize: 12, color: '#10b981', marginTop: 2 }}>
                  https://yourdomain.com/#product/{f.slug || 'product-slug'}
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                  {f.seoDesc || f.desc || 'Buy authentic luxury fashion products online with fast cash on delivery anywhere across Bangladesh.'}
                </div>
              </div>
            </>
          )}

          {err && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#fca5a5', padding: 12, borderRadius: 8, fontSize: 13 }}>
              ⚠️ {err}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sa-modal-f" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#100e1c' }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            {f.name ? `Editing: ${f.name}` : 'New product draft'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="sa-btn ghost" onClick={onClose}>Cancel</button>
            <button className="sa-btn" disabled={busy} onClick={save} style={{ background: '#8b5cf6', color: '#fff', fontWeight: 700, padding: '9px 24px' }}>
              {busy ? 'Saving…' : isNew ? 'Publish Luxury Product ✓' : 'Update Product ✓'}
            </button>
          </div>
        </div>
      </div>

      {/* MEDIA PICKER MODAL (MEDIA LIBRARY FIRST, COMPUTER UPLOAD FALLBACK WITH WEBP <=100KB) */}
      {pickerTarget && (
        <MediaPickerModal
          title={pickerTarget.title || 'Select Photo'}
          currentUrl={pickerTarget.currentImg}
          extraImages={f.images}
          onSelect={(url) => {
            if (pickerTarget.type === 'color') {
              assignColorPhoto(pickerTarget.idOrName, url);
              addImg(url);
            } else if (pickerTarget.type === 'variation') {
              updateVariation(pickerTarget.idOrName, 'image', url);
              addImg(url);
            } else if (pickerTarget.type === 'gallery') {
              addImg(url);
            }
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </div>
  );
}

function FraudDetectorAdmin({ embedded = false }: { embedded?: boolean }) {
  const [f, setF] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(setF)
      .catch(() => {});
  }, []);

  const fd = f?.fraudDetector || {
    enabled: true,
    cooldownHours: 24,
    maxOrdersPerDay: 5,
    minSecondsBetweenOrders: 30,
    blockByPhone: true,
    sameProductNotice: 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.',
    maxOrdersNotice: 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.',
    rapidOrderNotice: 'Please wait a moment before submitting another order.',
  };

  const setFd = (k: string, v: any) => {
    setF((s: any) => ({
      ...s,
      fraudDetector: {
        ...(s?.fraudDetector || fd),
        [k]: v,
      },
    }));
  };

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await aFetch('/settings', { method: 'PUT', body: JSON.stringify(f) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {}
    finally {
      setBusy(false);
    }
  };

  const resetDefaults = () => {
    if (!confirm('Reset all Fraud Detector settings to standard defaults?')) return;
    setF((s: any) => ({
      ...s,
      fraudDetector: {
        enabled: true,
        cooldownHours: 24,
        maxOrdersPerDay: 5,
        minSecondsBetweenOrders: 30,
        blockByPhone: true,
        sameProductNotice: 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.',
        maxOrdersNotice: 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.',
        rapidOrderNotice: 'Please wait a moment before submitting another order.',
      },
    }));
  };

  if (!f) return <div className="sa-top"><h1>Fraud Detector</h1></div>;

  return (
    <>
      {!embedded && (
        <div className="sa-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🛡️</span>
            <div>
              <h1 style={{ margin: 0 }}>Fraud Detector &amp; Fake Order Protection</h1>
              <p className="dim" style={{ fontSize: 13, margin: '2px 0 0' }}>
                Prevent fake, repeated, and bot orders with device fingerprinting and cooldown limits
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="sa-btn ghost" onClick={resetDefaults} title="Reset to default settings">↺ Reset Defaults</button>
            <button className="sa-btn primary" disabled={busy} onClick={save} style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}>
              {busy ? 'Saving…' : saved ? 'Saved ✓' : '💾 Save Settings'}
            </button>
          </div>
        </div>
      )}

      <div className="sa-card" style={{ padding: 22, marginTop: embedded ? 20 : 0, border: '1px solid rgba(239, 68, 68, 0.28)', background: 'linear-gradient(180deg, rgba(239, 68, 68, 0.04) 0%, rgba(15, 23, 42, 0.6) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🛡️</span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                Fraud Detector &amp; Device Blocker
              </h2>
              <p className="dim" style={{ fontSize: 12.5, margin: '3px 0 0' }}>
                Per-product cooldown, daily order caps, and automated rapid spam blocking
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label className="sa-chk" style={{ fontWeight: 600, fontSize: 13, color: fd.enabled !== false ? '#10b981' : 'var(--faint)' }}>
              <input
                type="checkbox"
                checked={fd.enabled !== false}
                onChange={(e) => setFd('enabled', e.target.checked)}
              />
              {fd.enabled !== false ? 'Active' : 'Disabled'}
            </label>
            {embedded && (
              <button
                type="button"
                className="sa-btn primary sa-mini"
                disabled={busy}
                onClick={save}
                style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}
              >
                {busy ? 'Saving…' : saved ? 'Saved ✓' : '💾 Save Settings'}
              </button>
            )}
          </div>
        </div>

        {/* Section 1: Rate Limiting & Cooldown */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#f59e0b', marginBottom: 12 }}>
            ⏱️ Order Cooldown &amp; Limits
          </div>
          <div className="sa-sgrid">
            <label>
              Same-Product Cooldown (Hours)
              <span className="dim" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2, lineHeight: 1.3 }}>
                Customer cannot re-order the <b>exact same product</b> from this device/phone within this period (e.g. 24 or 48 hours).
              </span>
              <input
                type="number"
                min="1"
                max="720"
                value={fd.cooldownHours ?? 24}
                onChange={(e) => setFd('cooldownHours', parseInt(e.target.value, 10) || 0)}
                placeholder="24"
              />
            </label>

            <label>
              Max Orders per Device / 24 Hours
              <span className="dim" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2, lineHeight: 1.3 }}>
                Maximum allowed orders across <b>all products</b> from a single device in 24 hours (default: 5).
              </span>
              <input
                type="number"
                min="1"
                max="100"
                value={fd.maxOrdersPerDay ?? 5}
                onChange={(e) => setFd('maxOrdersPerDay', parseInt(e.target.value, 10) || 0)}
                placeholder="5"
              />
            </label>

            <label>
              Bot / Rapid Spam Protection (Seconds)
              <span className="dim" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2, lineHeight: 1.3 }}>
                Minimum gap required between consecutive orders to stop rapid automated clicks (default: 30s).
              </span>
              <input
                type="number"
                min="5"
                max="600"
                value={fd.minSecondsBetweenOrders ?? 30}
                onChange={(e) => setFd('minSecondsBetweenOrders', parseInt(e.target.value, 10) || 0)}
                placeholder="30"
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Phone Number Match Check</span>
              <label className="sa-chk" style={{ fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={fd.blockByPhone !== false}
                  onChange={(e) => setFd('blockByPhone', e.target.checked)}
                />
                Also check customer phone number
              </label>
              <span className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
                Prevents bypassing cooldown via Incognito mode or clearing browser cookies.
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: English Warning Messages */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#60a5fa' }}>
              💬 Warning Notices (English Warning Messages)
            </div>
            <span className="dim small">Shown to customers on the checkout page when an order is blocked</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label>
              Same-Product Cooldown Warning (English)
              <span className="dim" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2, marginBottom: 4 }}>
                Shown when customer tries to order the same item again within the cooldown window:
              </span>
              <textarea
                rows={2}
                value={fd.sameProductNotice ?? ''}
                onChange={(e) => setFd('sameProductNotice', e.target.value)}
                placeholder="You have already placed an order for this item recently. Please wait before ordering again, or contact our support team."
                style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
              />
            </label>

            <label>
              Daily Max Orders Limit Warning (English)
              <span className="dim" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2, marginBottom: 4 }}>
                Shown when the device exceeds the maximum allowed orders in 24 hours:
              </span>
              <textarea
                rows={2}
                value={fd.maxOrdersNotice ?? ''}
                onChange={(e) => setFd('maxOrdersNotice', e.target.value)}
                placeholder="You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders."
                style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
              />
            </label>

            <label>
              Rapid Submission Spam Warning (English)
              <span className="dim" style={{ display: 'block', fontSize: 11.5, fontWeight: 400, marginTop: 2, marginBottom: 4 }}>
                Shown if orders are submitted within a few seconds of each other:
              </span>
              <input
                value={fd.rapidOrderNotice ?? ''}
                onChange={(e) => setFd('rapidOrderNotice', e.target.value)}
                placeholder="Please wait a moment before submitting another order."
                style={{ width: '100%', fontSize: 13 }}
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18, gap: 10 }}>
          <button type="button" className="sa-btn ghost sa-mini" onClick={resetDefaults}>↺ Reset to Defaults</button>
          <button
            type="button"
            className="sa-btn primary sa-mini"
            disabled={busy}
            onClick={save}
            style={{ background: '#10b981', borderColor: '#059669', color: '#fff', minWidth: 120 }}
          >
            {busy ? 'Saving…' : saved ? 'Saved ✓' : '💾 Save Settings'}
          </button>
        </div>
      </div>
    </>
  );
}

function SettingsAdmin() {
  const [f, setF] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [settingsError, setSettingsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'brand' | 'slider' | 'home' | 'app' | 'store' | 'fraud' | 'appearance' | 'content' | 'frontend'>('brand');
  const [storeCategories, setStoreCategories] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [slideForm, setSlideForm] = useState<any>({
    id: '',
    image: '',
    mobileImage: '',
    badge: 'NEW ARRIVALS · 2026',
    title: 'Timeless Elegance & Modesty',
    subtitle: 'Contemporary Modest Living',
    btnText: 'EXPLORE COLLECTIONS →',
    btnLink: 'shop',
    active: true,
  });
  const [uploadingSlideImg, setUploadingSlideImg] = useState(false);
  const [uploadingApk, setUploadingApk] = useState(false);
  const [editingSlideIdx, setEditingSlideIdx] = useState<number | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{ title: string; currentImg: string; onSelect: (url: string) => void } | null>(null);

  const loadSettings = async () => {
    setLoadingSettings(true);
    setSettingsError('');
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) throw new Error(`Settings request failed (${response.status})`);
      const s = await response.json();
      if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('Settings response was empty or invalid');
      setF({
        ...s,
        logo: s.logo || '',
        favicon: s.favicon || '',
        sliders: Array.isArray(s.sliders) ? s.sliders : [],
        homepageSections: Array.isArray(s.homepageSections) ? s.homepageSections : [],
        homeContent: s.homeContent || {},
        siteContent: s.siteContent || { sections: {} },
        appearance: s.appearance || { accent: '#ec4899', desktopColumns: 4, mobileColumns: 2, imageFit: 'cover' },
      });
      fetch('/api/categories').then((r) => r.ok ? r.json() : []).then((items) => setStoreCategories(Array.isArray(items) ? items : [])).catch(() => {});
      fetch('/api/products').then((r) => r.ok ? r.json() : []).then((items) => setAvailableProducts(Array.isArray(items) ? items : [])).catch(() => {});
    } catch (error: any) {
      setSettingsError(error?.message || 'Could not load store settings.');
    } finally {
      setLoadingSettings(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const set = (k: string) => (e: any) => setF((s: any) => ({ ...s, [k]: e.target.value }));

  const handleFileUpload = async (file: File): Promise<string> => {
    const d = await uploadOptimizedImage(file);
    return d.url;
  };

  const onLogoFileChange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await handleFileUpload(file);
      setF((s: any) => ({ ...s, logo: url }));
    } catch (err: any) {
      alert('Logo upload failed: ' + (err.message || 'error'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const onFaviconFileChange = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFavicon(true);
    try {
      const url = await handleFileUpload(file);
      setF((s: any) => ({ ...s, favicon: url }));
    } catch (err: any) {
      alert('Favicon upload failed: ' + (err.message || 'error'));
    } finally {
      setUploadingFavicon(false);
    }
  };

  const onSlideImgUpload = async (e: any, isMobile = false) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSlideImg(true);
    try {
      const url = await handleFileUpload(file);
      setSlideForm((sf: any) => ({ ...sf, [isMobile ? 'mobileImage' : 'image']: url }));
    } catch (err: any) {
      alert('Slide image upload failed: ' + (err.message || 'error'));
    } finally {
      setUploadingSlideImg(false);
    }
  };

  const save = async () => {
    setBusy(true); setSaved(false);
    try {
      const response = await aFetch('/settings', { method: 'PUT', body: JSON.stringify(f) });
      if (!response.ok) throw new Error(`Settings save failed (${response.status})`);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      alert('Failed to save settings: ' + (e.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const sliders: any[] = Array.isArray(f?.sliders) ? f.sliders : [];
  const homepageSections: any[] = Array.isArray(f?.homepageSections) ? f.homepageSections : [];
  const sectionControls = [
    ['hero', 'Hero banner / slider'], ['benefits', 'Store benefits'], ['categories', 'Featured categories'],
    ['catalog', 'Product collections'], ['reviews', 'Customer reviews'], ['footer', 'Store footer'],
  ];
  const homeTextFields = [
    ['heroTitle', 'Hero heading'], ['heroDescription', 'Hero description'], ['categoriesTitle', 'Category heading'],
    ['catalogTitle', 'Product collection heading'], ['catalogDescription', 'Product collection description'], ['reviewsTitle', 'Reviews heading'],
  ];
  const setHomeText = (key: string, value: string) => setF((s: any) => ({ ...s, homeContent: { ...(s.homeContent || {}), [key]: value } }));
  const setSiteSection = (key: string, value: boolean) => setF((s: any) => ({ ...s, siteContent: { ...(s.siteContent || {}), sections: { ...(s.siteContent?.sections || {}), [key]: value } } }));
  const uploadAdminApk = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.apk') || file.size > 50 * 1024 * 1024) { alert('Choose an APK file up to 50 MB.'); return; }
    setUploadingApk(true);
    try {
      const params = new URLSearchParams({ filename: file.name, version: f.apkVersion || '' });
      const response = await fetch(`/api/app-apk?${params}`, { method: 'POST', headers: { 'x-admin-token': getTok(), 'Content-Type': 'application/vnd.android.package-archive' }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'APK upload failed');
      setF((s: any) => ({ ...s, apkVersion: result.version, apkStorageName: result.name }));
      alert('Private admin APK uploaded successfully. It is not linked on the customer website.');
    } catch (error: any) { alert(error.message || 'APK upload failed'); }
    finally { setUploadingApk(false); }
  };
  const downloadAdminApk = async () => {
    try {
      const response = await aFetch('/admin/app-apk/download');
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'APK download failed');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'Baby-Wear-Admin.apk'; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (error: any) { alert(error.message || 'APK download failed'); }
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sliders.length) return;
    const next = [...sliders];
    const temp = next[idx];
    next[idx] = next[target];
    next[target] = temp;
    setF((s: any) => ({ ...s, sliders: next }));
  };

  const toggleSlideActive = (idx: number) => {
    const next = [...sliders];
    next[idx] = { ...next[idx], active: !next[idx].active };
    setF((s: any) => ({ ...s, sliders: next }));
  };

  const deleteSlide = (idx: number) => {
    if (!confirm('Are you sure you want to delete this slide?')) return;
    const next = sliders.filter((_, i) => i !== idx);
    setF((s: any) => ({ ...s, sliders: next }));
  };

  const openAddSlide = () => {
    setEditingSlideIdx(null);
    setSlideForm({
      id: 'slide_' + Date.now().toString(36),
      image: '',
      mobileImage: '',
      badge: 'NEW ARRIVALS · 2026',
      title: 'Timeless Elegance & Modesty',
      subtitle: 'Contemporary Modest Living',
      btnText: 'EXPLORE COLLECTIONS →',
      btnLink: 'shop',
      active: true,
    });
    setShowSlideModal(true);
  };

  const openEditSlide = (idx: number) => {
    setEditingSlideIdx(idx);
    setSlideForm({ ...sliders[idx] });
    setShowSlideModal(true);
  };

  const saveSlideForm = () => {
    if (!slideForm.image && !slideForm.title) {
      alert('Please provide at least a slide image or a title');
      return;
    }
    const next = [...sliders];
    if (editingSlideIdx !== null && editingSlideIdx >= 0) {
      next[editingSlideIdx] = { ...slideForm };
    } else {
      next.push({ ...slideForm, id: slideForm.id || 'slide_' + Date.now().toString(36) });
    }
    setF((s: any) => ({ ...s, sliders: next }));
    setShowSlideModal(false);
    setEditingSlideIdx(null);
  };

  if (!f) return (
    <div className="sa-top">
      <div>
        <h1>Settings</h1>
        <p className="dim" role={settingsError ? 'alert' : 'status'} style={{ marginTop: 6 }}>
          {settingsError || (loadingSettings ? 'Loading store settings…' : 'Store settings are unavailable.')}
        </p>
      </div>
      {settingsError && <button className="sa-btn" onClick={() => void loadSettings()}>Retry</button>}
    </div>
  );

  return (
    <>
      <div className="sa-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>Settings</h1>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Brand, Slider & Store Configuration</span>
        </div>
        <button className="sa-btn" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save All Changes'}
        </button>
      </div>

      {/* Tabs */}
      <div className="sa-toolbar" style={{ marginBottom: 18 }}>
        <div className="sa-filters">
          <button className={tab === 'brand' ? 'on' : ''} onClick={() => setTab('brand')}>
            <span>🖼️ Brand & Logos</span>
          </button>
          <button className={tab === 'slider' ? 'on' : ''} onClick={() => setTab('slider')}>
            <span>🎠 Homepage Sliders & Banners</span>
            <span className="sa-filter-count">{sliders.length}</span>
          </button>
          <button className={tab === 'home' ? 'on' : ''} onClick={() => setTab('home')}><span>🧩 Homepage Sections</span><span className="sa-filter-count">{homepageSections.length}</span></button>
          <button className={tab === 'app' ? 'on' : ''} onClick={() => setTab('app')}><span>📱 Android App / APK</span></button>
          <button className={tab === 'store' ? 'on' : ''} onClick={() => setTab('store')}>
            <span>🏪 Store & Delivery</span>
          </button>
          <button className={tab === 'fraud' ? 'on' : ''} onClick={() => setTab('fraud')}>
            <span>🛡️ Fraud Shield</span>
          </button>
          <button className={tab === 'appearance' ? 'on' : ''} onClick={() => setTab('appearance')}><span>✦ Storefront Design</span></button>
          <button className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}><span>✎ Homepage Content</span></button>
          <button className={tab === 'frontend' ? 'on' : ''} onClick={() => setTab('frontend')}><span>✦ Frontend Editor</span></button>
        </div>
      </div>

      {/* TAB 1: BRAND & LOGOS */}
      {tab === 'brand' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* 1. Store Logo */}
          <div className="sa-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Store Logo (মূল লোগো)</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  Used in storefront navigation bar, mobile menu & invoices.
                </p>
              </div>
              {f.logo && (
                <button
                  type="button"
                  className="sa-btn ghost small"
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  onClick={() => setF((s: any) => ({ ...s, logo: '' }))}
                >
                  Remove Logo
                </button>
              )}
            </div>

            {/* Preview Area */}
            <div
              style={{
                height: 120,
                borderRadius: 12,
                background: '#0f0c1b',
                border: '2px dashed rgba(255,255,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                padding: 12,
                position: 'relative',
              }}
            >
              {f.logo ? (
                <img
                  src={f.logo}
                  alt="Store Logo"
                  style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🖼️</div>
                  <div>No logo uploaded yet</div>
                  <div style={{ fontSize: 11, color: '#475569' }}>Text name ({f.storeName || 'Store'}) is currently displayed</div>
                </div>
              )}
            </div>

            {/* Upload Buttons & Input */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sa-btn"
                style={{ cursor: 'pointer', flexShrink: 0, background: '#7c3aed', borderColor: '#7c3aed', color: '#fff', fontWeight: 600 }}
                onClick={() => setPickerTarget({ title: 'Store Logo', currentImg: f.logo || '', onSelect: (url) => setF((s: any) => ({ ...s, logo: url })) })}
              >
                🖼️ Choose from Gallery
              </button>
              <label className="sa-btn ghost" style={{ cursor: 'pointer', flexShrink: 0 }}>
                {uploadingLogo ? 'Uploading…' : '📁 Upload New File'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={onLogoFileChange}
                  style={{ display: 'none' }}
                  disabled={uploadingLogo}
                />
              </label>
              <input
                style={{ flex: 1, minWidth: 200, height: 38, padding: '0 12px', background: '#1c1830', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                value={f.logo || ''}
                onChange={set('logo')}
                placeholder="Or paste image URL (https://... or /uploads/...)"
              />
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>
              💡 <strong>Tip:</strong> Transparent PNG or SVG logo looks best against dark/light headers. Recommended height: 40px – 80px.
            </div>
          </div>

          {/* 2. Site Favicon */}
          <div className="sa-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#fff' }}>Site Icon / Favicon (ব্রাউজার আইকন)</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                  The small icon shown in browser tabs, bookmarks & mobile shortcuts.
                </p>
              </div>
              {f.favicon && (
                <button
                  type="button"
                  className="sa-btn ghost small"
                  style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                  onClick={() => setF((s: any) => ({ ...s, favicon: '' }))}
                >
                  Remove Favicon
                </button>
              )}
            </div>

            {/* Mock Browser Tab Preview */}
            <div
              style={{
                borderRadius: 12,
                background: '#0f0c1b',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Browser Tab Preview:
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#242038',
                  padding: '7px 14px',
                  borderRadius: '8px 8px 0 0',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderBottom: 'none',
                  maxWidth: 240,
                }}
              >
                {f.favicon ? (
                  <img
                    src={f.favicon}
                    alt="Favicon"
                    style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 3 }}
                  />
                ) : (
                  <span style={{ fontSize: 14 }}>🌐</span>
                )}
                <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.storeName || 'METROMAA'} — Online Store
                </span>
                <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>×</span>
              </div>
            </div>

            {/* Upload Buttons & Input */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="sa-btn"
                style={{ cursor: 'pointer', flexShrink: 0, background: '#7c3aed', borderColor: '#7c3aed', color: '#fff', fontWeight: 600 }}
                onClick={() => setPickerTarget({ title: 'Site Favicon', currentImg: f.favicon || '', onSelect: (url) => setF((s: any) => ({ ...s, favicon: url })) })}
              >
                🖼️ Choose from Gallery
              </button>
              <label className="sa-btn ghost" style={{ cursor: 'pointer', flexShrink: 0 }}>
                {uploadingFavicon ? 'Uploading…' : '📁 Upload New File'}
                <input
                  type="file"
                  accept="image/x-icon,image/png,image/svg+xml,image/webp,image/jpeg"
                  onChange={onFaviconFileChange}
                  style={{ display: 'none' }}
                  disabled={uploadingFavicon}
                />
              </label>
              <input
                style={{ flex: 1, minWidth: 200, height: 38, padding: '0 12px', background: '#1c1830', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                value={f.favicon || ''}
                onChange={set('favicon')}
                placeholder="Or paste icon URL (.png, .ico, .svg)"
              />
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b' }}>
              💡 <strong>Tip:</strong> Square image (32×32 or 64×64 pixels) in PNG, ICO or SVG format works best.
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HOMEPAGE SLIDERS & BANNERS */}
      {tab === 'slider' && (
        <div className="sa-card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, color: '#fff' }}>Homepage Hero Sliders & Banners (হোমপেজ স্লাইডার)</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Upload rotating banner slides for your storefront. Banners auto-cycle with touch swipe & navigation arrows.
              </p>
            </div>
            <button
              type="button"
              className="sa-btn"
              onClick={openAddSlide}
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}
            >
              ➕ Add New Slide (নতুন স্লাইড যোগ করুন)
            </button>
          </div>

          {/* Slide List */}
          {sliders.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                background: '#0f0c1b',
                borderRadius: 12,
                border: '2px dashed rgba(255,255,255,0.12)',
                color: '#94a3b8',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎠</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>No custom slides created yet</div>
              <p style={{ fontSize: 12.5, color: '#64748b', maxWidth: 440, margin: '0 auto 16px' }}>
                The storefront currently shows the elegant default cover banner. Click the button below to upload your own custom promotional banners!
              </p>
              <button type="button" className="sa-btn ghost" onClick={openAddSlide}>
                ➕ Create First Slide
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sliders.map((s, idx) => (
                <div
                  key={s.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '14px 18px',
                    borderRadius: 12,
                    background: s.active !== false ? '#1c1830' : 'rgba(28, 24, 48, 0.4)',
                    border: '1px solid ' + (s.active !== false ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)'),
                    opacity: s.active !== false ? 1 : 0.65,
                    flexWrap: 'wrap',
                  }}
                >
                  {/* Order Index */}
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa', width: 24, textAlign: 'center' }}>
                    #{idx + 1}
                  </span>

                  {/* Thumbnail */}
                  <div
                    style={{
                      width: 120,
                      height: 68,
                      borderRadius: 8,
                      background: '#0f0c1b',
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {s.image ? (
                      <img src={s.image} alt={s.title || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 20 }}>🖼️</span>
                    )}
                  </div>

                  {/* Content Info */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: s.active !== false ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                          color: s.active !== false ? '#4ade80' : '#94a3b8',
                          border: '1px solid ' + (s.active !== false ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.2)'),
                        }}
                      >
                        {s.active !== false ? '● Live' : '○ Inactive'}
                      </span>
                      {s.badge && (
                        <span style={{ fontSize: 10.5, color: '#e7b486', fontWeight: 600 }}>
                          {s.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>
                      {s.title || 'Slide Banner #' + (idx + 1)}
                    </div>
                    {s.subtitle && (
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                        {s.subtitle}
                      </div>
                    )}
                    {s.btnLink && (
                      <div style={{ fontSize: 11, color: '#818cf8', marginTop: 4 }}>
                        🔗 Link: {s.btnLink} {s.btnText ? `(${s.btnText})` : ''}
                      </div>
                    )}
                  </div>

                  {/* Action Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="sa-btn ghost small"
                      onClick={() => toggleSlideActive(idx)}
                      title={s.active !== false ? 'Deactivate slide' : 'Activate slide'}
                    >
                      {s.active !== false ? 'Hide' : 'Show'}
                    </button>
                    <button
                      type="button"
                      className="sa-btn ghost small"
                      disabled={idx === 0}
                      onClick={() => moveSlide(idx, -1)}
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sa-btn ghost small"
                      disabled={idx === sliders.length - 1}
                      onClick={() => moveSlide(idx, 1)}
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="sa-btn ghost small"
                      onClick={() => openEditSlide(idx)}
                      title="Edit slide"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      className="sa-btn ghost small"
                      style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                      onClick={() => deleteSlide(idx)}
                      title="Delete slide"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'home' && <div className="sa-card" style={{ padding: 24, display: 'grid', gap: 14 }}>
        <div><h3 style={{ margin: 0, color: '#fff' }}>Homepage product sections</h3><p className="dim">Choose which category shelves appear and how many items each shelf shows.</p></div>
        {homepageSections.map((section, index) => <div key={section.id || index} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1fr) minmax(180px,1fr) 110px auto', gap: 10, alignItems: 'end', padding: 12, border: '1px solid rgba(255,255,255,.1)', borderRadius: 10 }}>
          <label>Section title<input value={section.title || ''} onChange={(e) => setF((s: any) => ({ ...s, homepageSections: s.homepageSections.map((x: any, i: number) => i === index ? { ...x, title: e.target.value } : x) }))} /></label>
          <label>Category<select value={section.category || ''} onChange={(e) => setF((s: any) => ({ ...s, homepageSections: s.homepageSections.map((x: any, i: number) => i === index ? { ...x, category: e.target.value } : x) }))}><option value="">Select a category</option>{storeCategories.map((c) => <option key={c.id || c.slug} value={c.id || c.slug}>{c.name}</option>)}</select></label>
          <label>Product count<input type="number" min={1} max={40} value={section.count || 8} onChange={(e) => setF((s: any) => ({ ...s, homepageSections: s.homepageSections.map((x: any, i: number) => i === index ? { ...x, count: Number(e.target.value) || 1 } : x) }))} /></label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={section.active !== false} onChange={(e) => setF((s: any) => ({ ...s, homepageSections: s.homepageSections.map((x: any, i: number) => i === index ? { ...x, active: e.target.checked } : x) }))} />Show</label><button type="button" className="sa-btn ghost small" onClick={() => setF((s: any) => ({ ...s, homepageSections: s.homepageSections.filter((_: any, i: number) => i !== index) }))}>Remove</button></div>
          <details style={{ gridColumn: '1 / -1' }}><summary style={{ cursor: 'pointer', color: '#cbd5e1' }}>Choose exact products ({(section.productIds || []).length} selected; empty uses category)</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 7, maxHeight: 200, overflow: 'auto', marginTop: 10 }}>{availableProducts.filter((product) => !section.category || product.category === section.category).map((product) => { const ids = (section.productIds || []).map(String); return <label key={product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: ids.includes(String(product.id)) ? 'rgba(236,72,153,.12)' : 'rgba(255,255,255,.03)' }}><input type="checkbox" checked={ids.includes(String(product.id))} onChange={(e) => setF((s: any) => ({ ...s, homepageSections: s.homepageSections.map((x: any, i: number) => i === index ? { ...x, productIds: e.target.checked ? [...new Set([...(x.productIds || []).map(String), String(product.id)])] : (x.productIds || []).map(String).filter((id: string) => id !== String(product.id)) } : x) }))} />{product.name}</label>; })}</div></details>
        </div>)}
        <button className="sa-btn ghost" type="button" onClick={() => setF((s: any) => ({ ...s, homepageSections: [...(s.homepageSections || []), { id: `section-${Date.now()}`, title: 'New Collection', category: storeCategories[0]?.id || storeCategories[0]?.slug || '', count: 8, active: true }] }))}>＋ Add category section</button>
      </div>}

      {tab === 'app' && <div className="sa-card" style={{ padding: 24, maxWidth: 850, display: 'grid', gap: 14 }}>
        <div><h3 style={{ margin: 0, color: '#fff' }}>Baby Wear Admin APK</h3><p className="dim">Private admin download only. This APK is never shown on the customer storefront.</p></div>
        <label>App version<input value={f.apkVersion || ''} onChange={set('apkVersion')} placeholder="e.g. 2.4.4" /></label>
        <label className="sa-btn" style={{ cursor: 'pointer', width: 'fit-content' }}>{uploadingApk ? 'Uploading…' : 'Upload private APK'}<input type="file" accept=".apk,application/vnd.android.package-archive" disabled={uploadingApk} onChange={(e) => void uploadAdminApk(e.target.files?.[0])} style={{ display: 'none' }} /></label>
        <button className="sa-btn ghost" type="button" onClick={() => void downloadAdminApk()}>Download current admin APK</button>
      </div>}

      {tab === 'appearance' && <div className="sa-card" style={{ padding: 24, maxWidth: 900 }}><h3 style={{ color: '#fff' }}>Storefront design</h3><div className="sa-sgrid">
        <label>Accent color<div style={{ display: 'flex', gap: 8 }}><input type="color" value={f.appearance?.accent || '#ec4899'} onChange={(e) => setF((s: any) => ({ ...s, appearance: { ...s.appearance, accent: e.target.value } }))} /><input value={f.appearance?.accent || '#ec4899'} onChange={(e) => setF((s: any) => ({ ...s, appearance: { ...s.appearance, accent: e.target.value } }))} /></div></label>
        <label>Products per row · desktop<select value={f.appearance?.desktopColumns || 4} onChange={(e) => setF((s: any) => ({ ...s, appearance: { ...s.appearance, desktopColumns: Number(e.target.value) } }))}><option value={2}>2 columns</option><option value={3}>3 columns</option><option value={4}>4 columns</option></select></label>
        <label>Products per row · mobile<select value={f.appearance?.mobileColumns || 2} onChange={(e) => setF((s: any) => ({ ...s, appearance: { ...s.appearance, mobileColumns: Number(e.target.value) } }))}><option value={1}>1 column</option><option value={2}>2 columns</option></select></label>
        <label>Product image style<select value={f.appearance?.imageFit || 'cover'} onChange={(e) => setF((s: any) => ({ ...s, appearance: { ...s.appearance, imageFit: e.target.value } }))}><option value="cover">Fill frame</option><option value="contain">Show full product</option></select></label>
      </div></div>}

      {tab === 'content' && <div className="sa-card" style={{ padding: 24, display: 'grid', gap: 12 }}><h3 style={{ color: '#fff' }}>Homepage content</h3><p className="dim">Edit the visible homepage headings. Leave blank to use the Baby Wear default.</p>{homeTextFields.map(([key, label]) => <label key={key}>{label}<input value={f.homeContent?.[key] || ''} onChange={(e) => setHomeText(key, e.target.value)} /></label>)}</div>}

      {tab === 'frontend' && <div className="sa-card" style={{ padding: 24, display: 'grid', gap: 10 }}><h3 style={{ color: '#fff' }}>Frontend section visibility</h3><p className="dim">Turn storefront sections on or off. Save All Changes, then refresh the store.</p>{sectionControls.map(([key, label]) => <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: '#1c1830', borderRadius: 8 }}><input type="checkbox" checked={f.siteContent?.sections?.[key] !== false} onChange={(e) => setSiteSection(key, e.target.checked)} />{label}</label>)}</div>}

      {/* TAB 3: STORE & DELIVERY */}
      {tab === 'store' && (
        <div className="sa-card" style={{ padding: 24 }}>
          <div className="sa-sgrid">
            <label>Store name<input value={f.storeName || ''} onChange={set('storeName')} placeholder="dot." /></label>
            <label>Announcement text<input value={f.announce || ''} onChange={set('announce')} /></label>
            <label>WhatsApp number (with country code)<input value={f.whatsapp || ''} onChange={set('whatsapp')} placeholder="8801XXXXXXXXX" /></label>
            <label>Store phone<input value={f.phone || ''} onChange={set('phone')} placeholder="8801XXXXXXXXX" /></label>
            <label>Delivery — inside Dhaka (৳)<input value={f.deliveryInside ?? ''} onChange={set('deliveryInside')} /></label>
            <label>Delivery — outside Dhaka (৳)<input value={f.deliveryOutside ?? ''} onChange={set('deliveryOutside')} /></label>
            <label>Free delivery over (৳)<input value={f.freeShipThreshold ?? ''} onChange={set('freeShipThreshold')} /></label>
            <label>Low-stock alert at<input value={f.lowStockAt ?? ''} onChange={set('lowStockAt')} placeholder="5" /></label>
            <label style={{ gridColumn: '1 / -1' }}>Google Tag Manager ID <span className="dim">(all pixels — FB, TikTok, GA — live inside GTM)</span><input value={f.gtmId || ''} onChange={set('gtmId')} placeholder="GTM-XXXXXXX" /></label>
            <label style={{ gridColumn: '1 / -1' }}>Meta (Facebook) Pixel ID <span className="dim">(direct browser pixel & custom event tracking)</span><input value={f.fbPixelId || ''} onChange={set('fbPixelId')} placeholder="123456789012345" /></label>
          </div>
        </div>
      )}

      {/* TAB 4: FRAUD DETECTOR */}
      {tab === 'fraud' && <FraudDetectorAdmin embedded={true} />}

      {/* Slide Add/Edit Modal */}
      {showSlideModal && (
        <div
          className="sa-order-modal-wrap"
          onClick={() => setShowSlideModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            className="sa-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: 28, background: '#171228', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: 16 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#fff' }}>
                {editingSlideIdx !== null ? '✏️ Edit Slide Banner' : '➕ Add New Slide Banner'}
              </h3>
              <button
                type="button"
                className="sa-btn ghost small"
                onClick={() => setShowSlideModal(false)}
                style={{ fontSize: 18, padding: '0 10px' }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Image Uploader */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Desktop Banner Image (ডেস্কটপ ব্যানার ছবি) *
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn small"
                    onClick={() => setPickerTarget({
                      title: 'Desktop Banner Image',
                      currentImg: slideForm.image || '',
                      onSelect: (url) => setSlideForm((sf: any) => ({ ...sf, image: url }))
                    })}
                  >
                    🖼️ Choose from Gallery
                  </button>
                  <label className="sa-btn ghost small" style={{ cursor: 'pointer', flexShrink: 0 }}>
                    {uploadingSlideImg ? 'Uploading…' : '📁 Upload New File'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onSlideImgUpload(e, false)}
                      style={{ display: 'none' }}
                      disabled={uploadingSlideImg}
                    />
                  </label>
                  <input
                    style={{ flex: 1, minWidth: 200, height: 38, padding: '0 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                    value={slideForm.image || ''}
                    onChange={(e) => setSlideForm((sf: any) => ({ ...sf, image: e.target.value }))}
                    placeholder="Image URL (https://... or /uploads/...)"
                  />
                </div>
                {slideForm.image && (
                  <div style={{ marginTop: 8, height: 120, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <img src={slideForm.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Recommended size: 1920×750px or 1600×600px (16:9 or 21:9 ratio).
                </div>
              </div>

              {/* Mobile Image (Optional) */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Mobile Banner Image (মোবাইল ভার্সন ছবি - ঐচ্ছিক)
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn small"
                    onClick={() => setPickerTarget({
                      title: 'Mobile Banner Image',
                      currentImg: slideForm.mobileImage || '',
                      onSelect: (url) => setSlideForm((sf: any) => ({ ...sf, mobileImage: url }))
                    })}
                  >
                    🖼️ Choose from Gallery
                  </button>
                  <label className="sa-btn ghost small" style={{ cursor: 'pointer', flexShrink: 0 }}>
                    {uploadingSlideImg ? 'Uploading…' : '📁 Upload New File'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onSlideImgUpload(e, true)}
                      style={{ display: 'none' }}
                      disabled={uploadingSlideImg}
                    />
                  </label>
                  <input
                    style={{ flex: 1, minWidth: 200, height: 38, padding: '0 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                    value={slideForm.mobileImage || ''}
                    onChange={(e) => setSlideForm((sf: any) => ({ ...sf, mobileImage: e.target.value }))}
                    placeholder="Optional mobile image URL (e.g. 800x1000px)"
                  />
                </div>
              </div>

              {/* Badge Text */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Badge Tag (ছোট শিরোনাম)
                </label>
                <input
                  style={{ width: '100%', height: 38, padding: '0 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                  value={slideForm.badge || ''}
                  onChange={(e) => setSlideForm((sf: any) => ({ ...sf, badge: e.target.value }))}
                  placeholder="e.g. NEW ARRIVALS · 2026 COLLECTION"
                />
              </div>

              {/* Main Title */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Main Title (মূল হেডলাইন)
                </label>
                <input
                  style={{ width: '100%', height: 38, padding: '0 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                  value={slideForm.title || ''}
                  onChange={(e) => setSlideForm((sf: any) => ({ ...sf, title: e.target.value }))}
                  placeholder="e.g. Timeless Elegance & Modesty"
                />
              </div>

              {/* Subtitle */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                  Subtitle / Tagline (সাবটাইটেল)
                </label>
                <textarea
                  style={{ width: '100%', minHeight: 64, padding: '8px 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13, resize: 'vertical' }}
                  value={slideForm.subtitle || ''}
                  onChange={(e) => setSlideForm((sf: any) => ({ ...sf, subtitle: e.target.value }))}
                  placeholder="e.g. Contemporary Modest Living & Exclusive Fashion Drops"
                />
              </div>

              {/* Button Text & Link */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    Button Text (বাটন লেখা)
                  </label>
                  <input
                    style={{ width: '100%', height: 38, padding: '0 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                    value={slideForm.btnText || ''}
                    onChange={(e) => setSlideForm((sf: any) => ({ ...sf, btnText: e.target.value }))}
                    placeholder="e.g. EXPLORE COLLECTIONS →"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#cbd5e1', marginBottom: 6 }}>
                    Button Link (লিংক গন্তব্য)
                  </label>
                  <input
                    style={{ width: '100%', height: 38, padding: '0 12px', background: '#0f0c1b', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 13 }}
                    value={slideForm.btnLink || ''}
                    onChange={(e) => setSlideForm((sf: any) => ({ ...sf, btnLink: e.target.value }))}
                    placeholder="e.g. shop or shop/modest-wear"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                <input
                  type="checkbox"
                  id="slideActiveCheck"
                  checked={slideForm.active !== false}
                  onChange={(e) => setSlideForm((sf: any) => ({ ...sf, active: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: '#8b5cf6', cursor: 'pointer' }}
                />
                <label htmlFor="slideActiveCheck" style={{ fontSize: 13.5, color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                  Active on Storefront (হোমপেজে সক্রিয় থাকবে)
                </label>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button type="button" className="sa-btn ghost" onClick={() => setShowSlideModal(false)}>
                  Cancel
                </button>
                <button type="button" className="sa-btn" onClick={saveSlideForm}>
                  {editingSlideIdx !== null ? 'Save Changes' : 'Add Slide'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pickerTarget && (
        <MediaPickerModal
          title={pickerTarget.title}
          currentUrl={pickerTarget.currentImg}
          onSelect={(url) => {
            pickerTarget.onSelect(url);
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
        />
      )}
    </>
  );
}

const COURIER_PRESETS: Record<string, any> = {
  Pathao: {
    provider: 'Pathao',
    bookUrl: 'https://api-hermes.pathao.com/aladdin/api/v1/orders',
    trackUrl: 'https://pathao.com/courier/tracking/?consignment_id={consignment}',
    statusUrl: 'https://api-hermes.pathao.com/aladdin/api/v1/orders/{consignment}/info',
  },
  Steadfast: {
    provider: 'Steadfast',
    bookUrl: 'https://portal.packzy.com/api/v1/create_order',
    trackUrl: 'https://steadfast.com.bd/track/{consignment}',
    statusUrl: 'https://portal.packzy.com/api/v1/status_by_cid/{consignment}',
  },
  CarryBee: {
    provider: 'CarryBee',
    bookUrl: 'https://developers.carrybee.com/api/v2/orders',
    trackUrl: 'https://carrybee.com/tracking?consignment_id={consignment}',
    statusUrl: 'https://developers.carrybee.com/api/v2/orders/{consignment}/details',
    environment: 'production',
    storeId: '1',
  },
  RedX: {
    provider: 'RedX',
    bookUrl: 'https://openapi.redx.com.bd/v1.0.0-beta/parcel',
    trackUrl: 'https://redx.com.bd/track-global-parcel/?trackingId={consignment}',
    statusUrl: 'https://openapi.redx.com.bd/v1.0.0-beta/parcel/track/{consignment}',
  },
  Custom: {},
};

function CourierWebhookBox({
  c,
  onRegenerate,
  onUpdateSecret,
  onUpdateHeaderValue,
}: {
  c: any;
  onRegenerate: () => void;
  onUpdateSecret?: (newSecret: string) => void;
  onUpdateHeaderValue?: (newVal: string) => void;
}) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedHeader, setCopiedHeader] = useState(false);
  const prov = (c.provider || 'courier').toLowerCase();
  const secret = c.webhookSecret || '';
  const headerValue = c.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c';
  const accountUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/${prov}/${c.id}` : `https://metrroma.com/api/webhooks/${prov}/${c.id}`;

  const copy = (txt: string, cb: (v: boolean) => void) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(txt);
    }
    cb(true);
    setTimeout(() => cb(false), 2000);
  };

  return (
    <>
      <div style={{ gridColumn: '1 / -1', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <b style={{ fontSize: 13, color: '#f4f4f5' }}>Webhook Integration</b>
        <button
          type="button"
          className="sa-btn ghost sa-mini"
          style={{ fontSize: 11, padding: '3px 8px' }}
          onClick={() => {
            if (confirm(`Generate a new Webhook Secret for this ${c.provider} account?`)) {
              onRegenerate();
            }
          }}
        >
          🔄 Generate Secret
        </button>
      </div>

      <label>
        Webhook Callback URL <span className="dim">({c.provider} Webhook URL)</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input readOnly value={accountUrl} style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <button type="button" className="sa-btn ghost sa-mini" onClick={() => copy(accountUrl, setCopiedUrl)}>
            {copiedUrl ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      </label>

      <label>
        Webhook Secret <span className="dim">(Unique secret token)</span>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <input
            type="text"
            name="courier_webhook_secret"
            autoComplete="off"
            value={secret}
            onChange={(e) => onUpdateSecret && onUpdateSecret(e.target.value)}
            placeholder="Webhook secret"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <button type="button" className="sa-btn ghost sa-mini" onClick={() => copy(secret, setCopiedSecret)}>
            {copiedSecret ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      </label>

      {c.provider === 'CarryBee' && (
        <label>
          CarryBee Handshake Bypass Token / Header Value <span className="dim">(Expected UUID)</span>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type="text"
              name="courier_header_value"
              autoComplete="off"
              value={headerValue}
              onChange={(e) => onUpdateHeaderValue && onUpdateHeaderValue(e.target.value)}
              placeholder="40489fe0-9386-4fc9-8e92-2b2fcb9d451c"
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
            <button type="button" className="sa-btn ghost sa-mini" onClick={() => copy(headerValue, setCopiedHeader)}>
              {copiedHeader ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </label>
      )}
    </>
  );
}

function IntegrationsAdmin() {
  const [ig, setIg] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState('');
  const [courierTest, setCourierTest] = useState<Record<string, { ok: boolean; text: string; stores?: any[] }>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testFraudPhone, setTestFraudPhone] = useState('01916691768');
  const [testFraudLoading, setTestFraudLoading] = useState(false);
  const [testFraudResult, setTestFraudResult] = useState<any>(null);
  const [testFraudError, setTestFraudError] = useState('');
  const [fraudSaving, setFraudSaving] = useState(false);
  const [fraudSaved, setFraudSaved] = useState(false);
  const [bdTestLoading, setBdTestLoading] = useState(false);
  const [bdTestResult, setBdTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({
    couriers: true,
    tracking: false,
    fraud: false,
    email: false,
    sms: false,
  });
  const toggleSec = (k: string) => setOpenSec((p) => ({ ...p, [k]: !p[k] }));

  useEffect(() => { aFetch('/admin/integrations').then((r) => r.json()).then(setIg).catch(() => {}); }, []);

  if (!ig) return <div className="sa-top"><h1>Integrations</h1></div>;

  const setEmail = (k: string, v: any) => setIg((s: any) => ({ ...s, email: { ...s.email, [k]: v } }));
  const setSms = (k: string, v: any) => setIg((s: any) => ({ ...s, sms: { ...s.sms, [k]: v } }));
  const setTrack = (k: string, v: any) => setIg((s: any) => ({ ...s, tracking: { ...(s.tracking || {}), [k]: v } }));
  const setFraud = (k: string, v: any) => setIg((s: any) => ({ ...s, fraud: { ...(s.fraud || {}), [k]: v } }));

  const testBdCourierKey = async () => {
    const key = String(ig.fraud?.bdcourierApiKey || '').trim();
    if (!key) {
      setBdTestResult({ ok: false, msg: 'Please paste your BD Courier API Key first.' });
      return;
    }
    setBdTestLoading(true);
    setBdTestResult(null);
    try {
      const res = await aFetch('/admin/fraud/ping', {
        method: 'POST',
        body: JSON.stringify({ apiKey: key })
      }).then((r) => r.json());
      if (res.ok) {
        setBdTestResult({ ok: true, msg: 'Connected successfully to BD Courier API! ✓' });
      } else {
        setBdTestResult({
          ok: false,
          msg: res.message || 'Invalid API Key. Please click the copy button (📋) in app.courier.com.bd/api and paste here.'
        });
      }
    } catch {
      setBdTestResult({ ok: false, msg: 'Network error contacting server.' });
    } finally {
      setBdTestLoading(false);
    }
  };

  const saveFraudOnly = async () => {
    setFraudSaving(true);
    try {
      const res = await aFetch('/admin/integrations', {
        method: 'PUT',
        body: JSON.stringify({ fraud: ig.fraud })
      }).then((r) => r.json());
      setIg(res);
      setFraudSaved(true);
      setTimeout(() => setFraudSaved(false), 2500);
    } catch {
      alert('Failed to save fraud settings');
    } finally {
      setFraudSaving(false);
    }
  };

  const runTestFraudCheck = async () => {
    if (!testFraudPhone) return;
    setTestFraudLoading(true);
    setTestFraudResult(null);
    setTestFraudError('');
    try {
      const r = await aFetch('/admin/fraud/check', {
        method: 'POST',
        body: JSON.stringify({ phone: testFraudPhone, fraudConfig: ig.fraud })
      }).then((x) => x.json());
      if (r.error) setTestFraudError(r.error);
      else setTestFraudResult(r);
    } catch {
      setTestFraudError('Failed to run courier fraud check');
    } finally {
      setTestFraudLoading(false);
    }
  };

  const applyFraudPreset = (type: 'bdcourier' | 'steadfast' | 'fraudchecker') => {
    if (type === 'bdcourier') {
      const existingKey = fr.bdcourierApiKey || (fr.headers ? (() => { try { return JSON.parse(fr.headers).Authorization?.replace(/^Bearer\s+/i, ''); } catch { return ''; } })() : '') || 'pT/QUiMaHiyZWip9YtHNHESkD39BXkixTIKAawxvYN1Ze2yybhqKyhthSzcD';
      setIg((s: any) => ({
        ...s,
        fraud: {
          ...s.fraud,
          enabled: true,
          bdcourierApiKey: existingKey,
          url: 'https://api.bdcourier.com/courier-check',
          method: 'POST',
          headers: JSON.stringify({ Authorization: `Bearer ${existingKey.trim()}`, 'Content-Type': 'application/json' }),
          totalPath: '',
          successPath: '',
          cancelPath: '',
        }
      }));
    } else if (type === 'steadfast') {
      const sf = (ig.couriers || []).find((c: any) => c.provider?.toLowerCase() === 'steadfast');
      const apiKey = sf?.apiKey || sf?.clientId || 'YOUR_STEADFAST_API_KEY';
      const apiSec = sf?.apiSecret || sf?.clientSecret || 'YOUR_STEADFAST_SECRET_KEY';
      setIg((s: any) => ({
        ...s,
        fraud: {
          ...s.fraud,
          enabled: true,
          url: 'https://portal.packzy.com/api/v1/fraud_check/{phone0}',
          method: 'GET',
          headers: JSON.stringify({ 'Api-Key': apiKey, 'Secret-Key': apiSec }),
          totalPath: 'total_parcel',
          successPath: 'total_delivery',
          cancelPath: 'total_cancelled',
        }
      }));
    } else if (type === 'fraudchecker') {
      setIg((s: any) => ({
        ...s,
        fraud: {
          ...s.fraud,
          enabled: true,
          url: 'https://fraudchecker.link/api/v1/check?phone={phone0}',
          method: 'GET',
          headers: s.fraud?.headers || '{"Authorization":"Bearer YOUR_TOKEN"}',
          totalPath: 'total_parcel',
          successPath: 'success_parcel',
          cancelPath: 'cancel_parcel',
        }
      }));
    }
  };
  const setCour = (id: string, k: string, v: any) => setIg((s: any) => ({ ...s, couriers: s.couriers.map((c: any) => (c.id === id ? { ...c, [k]: v } : c)) }));
  const updateCour = (id: string, patch: Record<string, any>) => setIg((s: any) => ({ ...s, couriers: s.couriers.map((c: any) => (c.id === id ? { ...c, ...patch } : c)) }));
  
  const addCourier = async (preset: string) => {
    const newSecret = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('sec_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    const newC = {
      id: 'c' + Date.now().toString(36),
      provider: preset,
      label: preset + ' ' + (ig.couriers.filter((c: any) => c.provider === preset).length + 1),
      enabled: true,
      apiKey: '',
      apiSecret: '',
      webhookSecret: newSecret,
      bookUrl: '',
      bookMethod: 'POST',
      bookHeaders: '',
      bookBody: '',
      consignmentPath: '',
      trackUrl: '',
      hotline: '',
      statusUrl: '',
      statusMethod: 'GET',
      statusHeaders: '',
      statusPath: '',
      statusMap: '',
      ...(COURIER_PRESETS[preset] || {})
    };
    const nextIg = { ...ig, couriers: [...(ig.couriers || []), newC] };
    setIg(nextIg);
    try { await aFetch('/admin/integrations', { method: 'PUT', body: JSON.stringify(nextIg) }); } catch {}
  };

  const regenerateCourierSecret = async (cId: string) => {
    const newSecret = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('sec_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
    setCour(cId, 'webhookSecret', newSecret);
    try {
      const nextCouriers = (ig.couriers || []).map((c: any) => c.id === cId ? { ...c, webhookSecret: newSecret } : c);
      const nextIg = { ...ig, couriers: nextCouriers };
      setIg(nextIg);
      await aFetch('/admin/integrations', { method: 'PUT', body: JSON.stringify(nextIg) });
    } catch {}
  };

  const removeCourier = async (id: string) => {
    const nextIg = { ...ig, couriers: (ig.couriers || []).filter((c: any) => c.id !== id) };
    setIg(nextIg);
    try { await aFetch('/admin/integrations', { method: 'PUT', body: JSON.stringify(nextIg) }); } catch {}
  };
  const save = async () => {
    setBusy(true); setSaved(false);
    try { const r = await aFetch('/admin/integrations', { method: 'PUT', body: JSON.stringify(ig) }); setIg(await r.json()); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch {}
    finally { setBusy(false); }
  };
  const testSms = async () => { const phone = prompt('Save first. Send a test SMS to which BD number?', '01'); if (!phone) return; setMsg('sending test sms…'); const r = await aFetch('/admin/sms/test', { method: 'POST', body: JSON.stringify({ phone }) }).then((x) => x.json()); setMsg(r.ok ? 'SMS sent ✓ (status ' + (r.status || 'ok') + ')' : 'SMS failed: ' + (r.error || r.body || r.status)); };
  const testEmail = async () => { const to = prompt('Save first. Send a test email to?', ''); if (!to) return; setMsg('sending test email…'); const r = await aFetch('/admin/email/test', { method: 'POST', body: JSON.stringify({ to }) }).then((x) => x.json()); setMsg(r.ok ? 'Email sent ✓' : 'Email failed: ' + (r.error || '')); };
  const testTracking = async () => { setMsg('sending test conversion…'); const r = await aFetch('/admin/tracking/test', { method: 'POST', body: JSON.stringify({}) }).then((x) => x.json()); setMsg(r.error ? 'Tracking: ' + r.error : 'Sent ✓ — FB ' + (r.fb ? r.fb.status : 'off') + ' · TikTok ' + (r.ttk ? r.ttk.status : 'off') + '. Check Events Manager → Test Events.'); };
  const tr = ig.tracking || {};
  const fr = ig.fraud || {};

  const testCourierConnection = async (c: any) => {
    const prov = c.provider;
    setCourierTest((prev) => ({ ...prev, [c.id]: { ok: true, text: `Connecting to ${prov}…` } }));
    try {
      const apiKey = String(c.apiKey || '').trim();
      const apiSecret = String(c.apiSecret || c.secretKey || '').trim();
      const r = await aFetch('/admin/courier/test-connection', {
        method: 'POST',
        body: JSON.stringify({
          id: c.id,
          provider: prov,
          apiKey,
          apiSecret,
          secretKey: apiSecret,
          clientId: String(c.clientId || apiKey || '').trim(),
          clientSecret: String(c.clientSecret || apiSecret || '').trim(),
          username: String(c.username || '').trim(),
          password: String(c.password || '').trim(),
          clientContext: String(c.clientContext || '').trim(),
          environment: c.environment,
          token: apiKey,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Connection failed');
      const stores = d.stores || [];
      let m = d.message || 'Connected successfully ✓';
      let newStoreId = c.storeId;
      if (stores.length > 0 && (!c.storeId || c.storeId === '1') && (stores[0]?.store_id || stores[0]?.id || stores[0]?.pickup_store_id)) {
        newStoreId = String(stores[0].store_id || stores[0].id || stores[0].pickup_store_id);
        setCour(c.id, 'storeId', newStoreId);
      }
      if (d.environment && d.environment !== c.environment) {
        setCour(c.id, 'environment', d.environment);
      }
      setCourierTest((prev) => ({ ...prev, [c.id]: { ok: true, text: m + ' (Auto-saved ✓)', stores } }));

      // Automatically persist to integrations.json on the server so it is NEVER lost on reload!
      try {
        const isMasked = (val: string) => /[\u2022\u25cf\u2219\u00b7]/.test(val);
        const nextCouriers = (ig.couriers || []).map((x: any) => {
          if (x.id !== c.id) return x;
          const patch: any = { enabled: true };
          if (apiKey && !isMasked(apiKey)) patch.apiKey = apiKey;
          if (apiSecret && !isMasked(apiSecret)) { patch.apiSecret = apiSecret; patch.secretKey = apiSecret; }
          if (c.clientId && !isMasked(c.clientId)) patch.clientId = c.clientId;
          if (c.clientSecret && !isMasked(c.clientSecret)) patch.clientSecret = c.clientSecret;
          if (c.username) patch.username = c.username;
          if (c.password && !isMasked(c.password)) patch.password = c.password;
          if (newStoreId) patch.storeId = newStoreId;
          if (d.environment) patch.environment = d.environment;
          return { ...x, ...patch };
        });
        const nextIg = { ...ig, couriers: nextCouriers };
        setIg(nextIg);
        await aFetch('/admin/integrations', { method: 'PUT', body: JSON.stringify(nextIg) });
      } catch {}
    } catch (e: any) {
      setCourierTest((prev) => ({ ...prev, [c.id]: { ok: false, text: e.message || 'Connection failed' } }));
    }
  };
  return (
    <>
      <div className="sa-top"><h1>Integrations</h1><button className="sa-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save all'}</button></div>
      {msg && <div className="sa-card" style={{ padding: '10px 16px', marginBottom: 14 }}>{msg}</div>}

      <div className="sa-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div onClick={() => toggleSec('email')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', background: openSec.email ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: openSec.email ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>✉️</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f8fafc' }}>Email Integration &amp; 2FA Security (Resend / SMTP)</h2>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Admin 2FA OTPs, password reset &amp; customer order receipts</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, background: ig.email.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: ig.email.enabled ? '#4ade80' : '#94a3b8', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              {ig.email.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span style={{ transform: openSec.email ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', color: '#94a3b8' }}>▼</span>
          </div>
        </div>
        {openSec.email && (
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <b style={{ fontSize: 14 }}>Email Notification Status</b>
          <label className="sa-chk"><input type="checkbox" checked={!!ig.email.enabled} onChange={(e) => setEmail('enabled', e.target.checked)} /> Enabled</label>
        </div>
        <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>Used for <b>2FA Login OTPs</b>, <b>Password Resets</b>, <b>Staff Onboarding Credentials</b>, and Customer Order Notifications.</p>
        <div className="sa-sgrid">
          <label>Provider<select value={ig.email.provider || 'resend'} onChange={(e) => setEmail('provider', e.target.value)}><option value="resend">Resend API (Permanent &amp; Instant)</option><option value="smtp">Standard SMTP / Custom Mail</option></select></label>
          <label>Admin Security Email <span className="dim">(where owner OTPs go)</span><input value={ig.email.adminEmail || ''} onChange={(e) => setEmail('adminEmail', e.target.value)} placeholder="metroomaa@gmail.com" /></label>
          {(ig.email.provider || 'resend') === 'resend' ? (
            <>
              <label style={{ gridColumn: '1 / -1' }}>Resend API Key<input type="password" value={ig.email.resendApiKey || ''} onChange={(e) => setEmail('resendApiKey', e.target.value)} placeholder="re_..." /></label>
              <label>From Name<input value={ig.email.fromName || ''} onChange={(e) => setEmail('fromName', e.target.value)} placeholder="dot." /></label>
              <label>From Email<input value={ig.email.fromEmail || ''} onChange={(e) => setEmail('fromEmail', e.target.value)} placeholder="admin@dot.com" /></label>
            </>
          ) : (
            <>
              <label>SMTP host<input value={ig.email.host || ''} onChange={(e) => setEmail('host', e.target.value)} placeholder="smtp.hostinger.com" /></label>
              <label>Port<input value={ig.email.port ?? ''} onChange={(e) => setEmail('port', e.target.value)} placeholder="587" /></label>
              <label>Username<input value={ig.email.user || ''} onChange={(e) => setEmail('user', e.target.value)} placeholder="support@metrroma.com" /></label>
              <label>Password<input type="password" value={ig.email.pass || ''} onChange={(e) => setEmail('pass', e.target.value)} placeholder={ig.email.hasPass ? 'saved — leave to keep' : ''} /></label>
              <label>From name<input value={ig.email.fromName || ''} onChange={(e) => setEmail('fromName', e.target.value)} placeholder="dot." /></label>
              <label>From email<input value={ig.email.fromEmail || ''} onChange={(e) => setEmail('fromEmail', e.target.value)} placeholder="support@metrroma.com" /></label>
              <label className="sa-chk"><input type="checkbox" checked={!!ig.email.secure} onChange={(e) => setEmail('secure', e.target.checked)} /> Use SSL (port 465)</label>
            </>
          )}
        </div>
        <button className="sa-btn ghost sa-mini" style={{ marginTop: 12 }} onClick={testEmail}>Send test email</button>
        </div>
        )}
      </div>
      <div className="sa-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div onClick={() => toggleSec('sms')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', background: openSec.sms ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: openSec.sms ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📱</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f8fafc' }}>Bulk SMS Gateways (HTTP API)</h2>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Order placed and status update SMS (BulkSMSBD, Alpha, Mimsms)</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, background: ig.sms.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: ig.sms.enabled ? '#4ade80' : '#94a3b8', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              {ig.sms.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <span style={{ transform: openSec.sms ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', color: '#94a3b8' }}>▼</span>
          </div>
        </div>
        {openSec.sms && (
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <b style={{ fontSize: 14 }}>SMS Gateway Status</b>
          <label className="sa-chk"><input type="checkbox" checked={!!ig.sms.enabled} onChange={(e) => setSms('enabled', e.target.checked)} /> Enabled</label>
        </div>
        <p className="dim" style={{ fontSize: 13, marginBottom: 12 }}>Paste your provider's send URL. Use <b>{'{phone}'}</b>, <b>{'{msg}'}</b>, <b>{'{apiKey}'}</b>, <b>{'{senderId}'}</b> as placeholders — works with any BD provider (BulkSMSBD, Alpha, Mimsms…).</p>
        <div className="sa-sgrid">
          <label style={{ gridColumn: '1 / -1' }}>Send URL template<input value={ig.sms.url || ''} onChange={(e) => setSms('url', e.target.value)} placeholder="https://api.sms.net.bd/sendsms?api_key={apiKey}&to={phone}&msg={msg}&sender_id={senderId}" /></label>
          <label>Method<select value={ig.sms.method || 'GET'} onChange={(e) => setSms('method', e.target.value)}><option>GET</option><option>POST</option></select></label>
          <label>Sender ID<input value={ig.sms.senderId || ''} onChange={(e) => setSms('senderId', e.target.value)} placeholder="optional" /></label>
          <label>API key<input type="password" value={ig.sms.apiKey || ''} onChange={(e) => setSms('apiKey', e.target.value)} placeholder={ig.sms.hasApiKey ? 'saved — leave to keep' : ''} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Order-placed SMS<input value={ig.sms.templatePlaced || ''} onChange={(e) => setSms('templatePlaced', e.target.value)} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Status-update SMS<input value={ig.sms.templateStatus || ''} onChange={(e) => setSms('templateStatus', e.target.value)} /></label>
        </div>
        <p className="dim" style={{ fontSize: 12, margin: '8px 0 0' }}>Message placeholders: {'{id} {total} {status} {name} {courier} {track}'}</p>
        <button className="sa-btn ghost sa-mini" style={{ marginTop: 12 }} onClick={testSms}>Send test SMS</button>
        </div>
        )}
      </div>

      <div className="sa-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div onClick={() => toggleSec('tracking')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', background: openSec.tracking ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: openSec.tracking ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f8fafc' }}>Marketing &amp; Pixels (Meta CAPI &amp; TikTok Events)</h2>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>Server-side purchase tracking &amp; Event ID browser deduplication</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, background: tr.fbEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: tr.fbEnabled ? '#4ade80' : '#94a3b8', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              {tr.fbEnabled ? 'Active' : 'Not Active'}
            </span>
            <span style={{ transform: openSec.tracking ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', color: '#94a3b8' }}>▼</span>
          </div>
        </div>
        {openSec.tracking && (
        <div style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Server-side tracking (Conversions API)</h2>
        <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>Fires a server-side <b>Purchase</b> straight to Meta &amp; TikTok on every order (browser can't block it). Shares the order id as <b>event_id</b> so it de-duplicates with the browser pixel in GTM.</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <b style={{ fontSize: 14 }}>Facebook (Meta) CAPI</b>
          <label className="sa-chk"><input type="checkbox" checked={!!tr.fbEnabled} onChange={(e) => setTrack('fbEnabled', e.target.checked)} /> Enabled</label>
        </div>
        <div className="sa-sgrid">
          <label>Pixel ID<input value={tr.fbPixelId || ''} onChange={(e) => setTrack('fbPixelId', e.target.value)} placeholder="123456789012345" /></label>
          <label>Conversions API token<input type="password" value={tr.fbToken || ''} onChange={(e) => setTrack('fbToken', e.target.value)} placeholder={tr.hasFbToken ? 'saved — leave to keep' : 'EAAG…'} /></label>
          <label>Test event code <span className="dim">(optional, for Events Manager → Test Events)</span><input value={tr.fbTestCode || ''} onChange={(e) => setTrack('fbTestCode', e.target.value)} placeholder="TEST12345" /></label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 10px' }}>
          <b style={{ fontSize: 14 }}>TikTok Events API</b>
          <label className="sa-chk"><input type="checkbox" checked={!!tr.ttkEnabled} onChange={(e) => setTrack('ttkEnabled', e.target.checked)} /> Enabled</label>
        </div>
        <div className="sa-sgrid">
          <label>Pixel ID (code)<input value={tr.ttkPixelId || ''} onChange={(e) => setTrack('ttkPixelId', e.target.value)} placeholder="CXXXXXXXXXXXXXXXXX" /></label>
          <label>Access token<input type="password" value={tr.ttkToken || ''} onChange={(e) => setTrack('ttkToken', e.target.value)} placeholder={tr.hasTtkToken ? 'saved — leave to keep' : ''} /></label>
        </div>
        <button className="sa-btn ghost sa-mini" style={{ marginTop: 14 }} onClick={testTracking}>Send test conversion</button>
        </div>
        )}
      </div>

      <div className="sa-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div onClick={() => toggleSec('fraud')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', background: openSec.fraud ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: openSec.fraud ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🛡️</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f8fafc' }}>Multi-Courier Fraud &amp; Delivery History Checker</h2>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>BD Courier &amp; Steadfast historical delivery success rate detection</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, background: fr.enabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: fr.enabled ? '#4ade80' : '#94a3b8', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              {fr.enabled ? 'Active' : 'Off'}
            </span>
            <span style={{ transform: openSec.fraud ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', color: '#94a3b8' }}>▼</span>
          </div>
        </div>
        {openSec.fraud && (
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Multi-Courier Fraud &amp; Success Checker</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label className="sa-chk"><input type="checkbox" checked={!!fr.enabled} onChange={(e) => setFraud('enabled', e.target.checked)} /> Enabled</label>
            <button
              type="button"
              className="sa-btn primary sa-mini"
              disabled={fraudSaving}
              onClick={saveFraudOnly}
              style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}
            >
              {fraudSaving ? 'Saving…' : fraudSaved ? 'Saved ✓' : '💾 Save Settings'}
            </button>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>
          Pulls customer <b>live multi-courier delivery history</b> (Steadfast, Pathao, RedX, CarryBee, Store History) to show <b>Delivery Success % vs Return %</b> so you can detect fraud before shipping. Use <b>{'{phone}'}</b> (8801…) or <b>{'{phone0}'}</b> (01…).
        </p>

        {/* Quick Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <span className="dim small" style={{ fontWeight: 600 }}>Presets:</span>
          <button type="button" className="sa-btn ghost sa-mini" onClick={() => applyFraudPreset('bdcourier')}>⚡ BDCourier API</button>
          <button type="button" className="sa-btn ghost sa-mini" onClick={() => applyFraudPreset('steadfast')}>⚡ Steadfast Direct</button>
          <button type="button" className="sa-btn ghost sa-mini" onClick={() => applyFraudPreset('fraudchecker')}>⚡ FraudChecker Link</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, marginBottom: 5, fontWeight: 500 }}>
            BD Courier API Key (from app.courier.com.bd/api)
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={fr.bdcourierApiKey || ''}
              onChange={(e) => {
                const val = e.target.value;
                setIg((s: any) => ({
                  ...s,
                  fraud: {
                    ...s.fraud,
                    enabled: true,
                    bdcourierApiKey: val,
                    url: s.fraud?.url || 'https://api.bdcourier.com/courier-check',
                    method: 'POST',
                    headers: JSON.stringify({ Authorization: `Bearer ${val.trim()}`, 'Content-Type': 'application/json' })
                  }
                }));
              }}
              placeholder="Paste BD Courier API key (click copy 📋 icon on app.courier.com.bd/api)"
              style={{ flex: 1, minWidth: 260 }}
            />
            <button
              type="button"
              className="sa-btn ghost sa-mini"
              disabled={bdTestLoading}
              onClick={testBdCourierKey}
            >
              {bdTestLoading ? 'Verifying…' : '🔌 Test API Key'}
            </button>
            <button
              type="button"
              className="sa-btn primary sa-mini"
              disabled={fraudSaving}
              onClick={saveFraudOnly}
            >
              {fraudSaving ? 'Saving…' : fraudSaved ? 'Saved ✓' : '💾 Save Settings'}
            </button>
          </div>
          {bdTestResult && (
            <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 500, color: bdTestResult.ok ? '#4ade80' : '#f87171' }}>
              {bdTestResult.ok ? '✓ ' : '⚠ '}{bdTestResult.msg}
            </div>
          )}
          <div className="dim small" style={{ marginTop: 6, fontSize: 12 }}>
            💡 Connects directly to BD Courier API via REST. (No WordPress plugin or WordPress site URL required).
          </div>
        </div>

        <div className="sa-sgrid">
          <label style={{ gridColumn: '1 / -1' }}>API URL<input value={fr.url || ''} onChange={(e) => setFraud('url', e.target.value)} placeholder="https://…/fraud?phone={phone0}" /></label>
          <label>Method<select value={fr.method || 'GET'} onChange={(e) => setFraud('method', e.target.value)}><option>GET</option><option>POST</option></select></label>
          <label style={{ gridColumn: '1 / -1' }}>Headers (JSON, optional)<input value={fr.headers || ''} onChange={(e) => setFraud('headers', e.target.value)} placeholder={'{"Authorization":"Bearer …"}'} /></label>
          <label>Total path<input value={fr.totalPath || ''} onChange={(e) => setFraud('totalPath', e.target.value)} placeholder="total_parcel" /></label>
          <label>Delivered path<input value={fr.successPath || ''} onChange={(e) => setFraud('successPath', e.target.value)} placeholder="success_parcel" /></label>
          <label>Cancelled path<input value={fr.cancelPath || ''} onChange={(e) => setFraud('cancelPath', e.target.value)} placeholder="cancel_parcel" /></label>
        </div>
        <p className="dim" style={{ fontSize: 12, marginTop: 8 }}>Paths are optional — common keys (total_parcel/success_parcel/cancel_parcel, total/delivered/cancelled) are auto-detected.</p>

        {/* Live Phone Tester */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            🔍 Test Customer Phone Number:
          </div>
          <div style={{ display: 'flex', gap: 10, maxWidth: 440 }}>
            <input
              type="text"
              value={testFraudPhone}
              onChange={(e) => setTestFraudPhone(e.target.value)}
              placeholder="e.g. 017XXXXXXXX"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="sa-btn primary sa-mini"
              disabled={testFraudLoading || !testFraudPhone}
              onClick={runTestFraudCheck}
            >
              {testFraudLoading ? 'Checking…' : 'Check History'}
            </button>
          </div>
          {testFraudError && <div className="dim small" style={{ color: '#f87171', marginTop: 8 }}>{testFraudError}</div>}
          {testFraudResult && (
            <div style={{ marginTop: 12 }}>
              <MultiCourierFraudReport fraud={testFraudResult} />
            </div>
          )}
        </div>
        </div>
        )}
      </div>

      <div className="sa-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div onClick={() => toggleSec('couriers')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', userSelect: 'none', background: openSec.couriers ? 'rgba(255,255,255,0.03)' : 'transparent', borderBottom: openSec.couriers ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📦</span>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#f8fafc' }}>Courier Integrations (Steadfast, CarryBee, Pathao, eCourier)</h2>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{(ig.couriers || []).length} connected courier accounts with 1-click booking</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, background: (ig.couriers || []).some((c: any) => c.enabled) ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: (ig.couriers || []).some((c: any) => c.enabled) ? '#4ade80' : '#94a3b8', padding: '2px 8px', borderRadius: 999, fontWeight: 600 }}>
              {(ig.couriers || []).some((c: any) => c.enabled) ? 'Active' : 'None'}
            </span>
            <span style={{ transform: openSec.couriers ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s', color: '#94a3b8' }}>▼</span>
          </div>
        </div>
        {openSec.couriers && (
        <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Connected Couriers</h2>
          <div className="sa-rightctl" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {['Pathao', 'Steadfast', 'CarryBee', 'RedX', 'Custom'].map((p) => <button key={p} className="sa-btn ghost sa-mini" onClick={() => addCourier(p)}>+ {p}</button>)}
            <button className="sa-btn primary sa-mini" disabled={busy} onClick={save} style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}>
              {busy ? 'Saving…' : saved ? 'Saved ✓' : '💾 Save Couriers'}
            </button>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 13, marginBottom: 14 }}>Add your courier accounts (Pathao, Steadfast, CarryBee, RedX). Each is automatically mapped for 1-click booking, live status tracking, and webhooks.</p>
        {ig.couriers.length === 0 && <div className="sa-empty">No courier accounts yet. Add one above.</div>}
        {ig.couriers.map((c: any) => (
          <div key={c.id} className="sa-card" style={{ padding: 16, marginBottom: 12, background: 'rgba(255, 255, 255, 0.03)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
              <input style={{ fontWeight: 600, maxWidth: 220 }} value={c.label || ''} onChange={(e) => setCour(c.id, 'label', e.target.value)} placeholder="Account label (e.g. Steadfast · Shop A)" />
              <span className="sa-badge b-tag">{c.provider}</span>
              <label className="sa-chk" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={!!c.enabled} onChange={(e) => setCour(c.id, 'enabled', e.target.checked)} /> Enabled</label>
              <button className="sa-link danger" onClick={() => removeCourier(c.id)}>Remove</button>
            </div>

            {c.provider === 'Pathao' && (
              <div className="sa-sgrid">
                <label>
                  Client ID <span className="dim">(Pathao Developer API)</span>
                  <input
                    value={c.clientId || c.apiKey || ''}
                    onChange={(e) => setCour(c.id, 'clientId', e.target.value)}
                    placeholder="e.g. APdROKDaGy"
                  />
                </label>
                <label>
                  Client Secret <span className="dim">(Pathao Developer API)</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSecret[c.id + '_sec'] ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={c.clientSecret || c.apiSecret || ''}
                      onChange={(e) => updateCour(c.id, { clientSecret: e.target.value, apiSecret: e.target.value })}
                      placeholder="Paste your Pathao Client Secret"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => ({ ...s, [c.id + '_sec']: !s[c.id + '_sec'] }))}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14 }}
                      title={showSecret[c.id + '_sec'] ? 'Hide' : 'Show'}
                    >
                      {showSecret[c.id + '_sec'] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>
                <label>
                  Pathao Login Email / Username
                  <input
                    value={c.username || ''}
                    onChange={(e) => setCour(c.id, 'username', e.target.value)}
                    placeholder="Email used to login to Pathao"
                  />
                </label>
                <label>
                  Pathao Login Password
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSecret[c.id + '_pass'] ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={c.password || ''}
                      onChange={(e) => setCour(c.id, 'password', e.target.value)}
                      placeholder="Pathao account password"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => ({ ...s, [c.id + '_pass']: !s[c.id + '_pass'] }))}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14 }}
                      title={showSecret[c.id + '_pass'] ? 'Hide' : 'Show'}
                    >
                      {showSecret[c.id + '_pass'] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>
                <label>
                  Store ID <span className="dim">(From Pathao "Stores" menu)</span>
                  {courierTest[c.id]?.stores && courierTest[c.id].stores!.length > 0 ? (
                    <select
                      value={c.storeId || ''}
                      onChange={(e) => setCour(c.id, 'storeId', e.target.value)}
                    >
                      <option value="">Select store…</option>
                      {courierTest[c.id].stores!.map((st: any) => (
                        <option key={st.store_id} value={st.store_id}>
                          {st.store_name} (ID: {st.store_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={c.storeId || ''}
                      onChange={(e) => setCour(c.id, 'storeId', e.target.value)}
                      placeholder="e.g. 12345"
                    />
                  )}
                </label>
                <label>
                  Hotline (Optional)
                  <input
                    value={c.hotline || ''}
                    onChange={(e) => setCour(c.id, 'hotline', e.target.value)}
                    placeholder="Customer support hotline"
                  />
                </label>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn ghost sa-mini"
                    onClick={() => testCourierConnection(c)}
                  >
                    🔌 Connect &amp; Auto-Fetch Stores
                  </button>
                  <button
                    type="button"
                    className="sa-btn primary sa-mini"
                    disabled={busy}
                    onClick={save}
                  >
                    💾 Save Courier
                  </button>
                  {courierTest[c.id] && (
                    <span style={{ fontSize: 13, color: courierTest[c.id].ok ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                      {courierTest[c.id].text}
                    </span>
                  )}
                </div>

                <CourierWebhookBox c={c} onRegenerate={() => regenerateCourierSecret(c.id)} onUpdateSecret={(val) => setCour(c.id, 'webhookSecret', val)} />
              </div>
            )}

            {c.provider === 'Steadfast' && (
              <div className="sa-sgrid">
                <label>
                  API Key <span className="dim">(From Steadfast Settings → API)</span>
                  <input
                    value={c.apiKey || ''}
                    onChange={(e) => setCour(c.id, 'apiKey', e.target.value)}
                    placeholder="e.g. your_steadfast_api_key"
                  />
                </label>
                <label>
                  Secret Key <span className="dim">(From Steadfast Settings → API)</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSecret[c.id] ? 'text' : 'password'}
                      value={c.apiSecret || c.secretKey || ''}
                      onChange={(e) => setCour(c.id, 'apiSecret', e.target.value)}
                      placeholder="Paste Steadfast Secret Key"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14 }}
                      title={showSecret[c.id] ? 'Hide' : 'Show'}
                    >
                      {showSecret[c.id] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>
                <label>
                  Hotline (Optional)
                  <input
                    value={c.hotline || ''}
                    onChange={(e) => setCour(c.id, 'hotline', e.target.value)}
                    placeholder="Steadfast support hotline"
                  />
                </label>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn ghost sa-mini"
                    onClick={() => testCourierConnection(c)}
                  >
                    🔌 Test Steadfast Connection (Check Balance)
                  </button>
                  <button
                    type="button"
                    className="sa-btn primary sa-mini"
                    disabled={busy}
                    onClick={save}
                  >
                    💾 Save Courier
                  </button>
                  {courierTest[c.id] && (
                    <span style={{ fontSize: 13, color: courierTest[c.id].ok ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                      {courierTest[c.id].text}
                    </span>
                  )}
                </div>

                <CourierWebhookBox c={c} onRegenerate={() => regenerateCourierSecret(c.id)} onUpdateSecret={(val) => setCour(c.id, 'webhookSecret', val)} />
              </div>
            )}

            {c.provider === 'CarryBee' && (
              <div className="sa-sgrid">
                <label>
                  Client ID <span className="dim">(CarryBee API v2.0)</span>
                  <input
                    value={c.clientId || c.apiKey || ''}
                    onChange={(e) => updateCour(c.id, { clientId: e.target.value, apiKey: e.target.value })}
                    placeholder="CarryBee Client ID"
                  />
                </label>
                <label>
                  Client Secret <span className="dim">(CarryBee API v2.0)</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSecret[c.id] ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={c.clientSecret || c.apiSecret || ''}
                      onChange={(e) => updateCour(c.id, { clientSecret: e.target.value, apiSecret: e.target.value })}
                      placeholder="CarryBee Client Secret"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14 }}
                      title={showSecret[c.id] ? 'Hide' : 'Show'}
                    >
                      {showSecret[c.id] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>
                <label>
                  Client Context <span className="dim">(Optional)</span>
                  <input
                    value={c.clientContext || ''}
                    onChange={(e) => setCour(c.id, 'clientContext', e.target.value)}
                    placeholder="Client Context if provided"
                  />
                </label>
                <label>
                  Environment
                  <select
                    value={c.environment || 'production'}
                    onChange={(e) => setCour(c.id, 'environment', e.target.value)}
                  >
                    <option value="production">Production (Live)</option>
                    <option value="sandbox">Sandbox (Testing)</option>
                  </select>
                </label>
                <label>
                  Store ID
                  {courierTest[c.id]?.stores && courierTest[c.id].stores!.length > 0 ? (
                    <select
                      value={c.storeId || ''}
                      onChange={(e) => setCour(c.id, 'storeId', e.target.value)}
                    >
                      <option value="">Select store…</option>
                      {courierTest[c.id].stores!.map((st: any) => (
                        <option key={st.id || st.store_id} value={st.id || st.store_id}>
                          {st.name || st.store_name} (ID: {st.id || st.store_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={c.storeId || '1'}
                      onChange={(e) => setCour(c.id, 'storeId', e.target.value)}
                      placeholder="e.g. 1"
                    />
                  )}
                </label>
                <label>
                  Hotline (Optional)
                  <input
                    value={c.hotline || ''}
                    onChange={(e) => setCour(c.id, 'hotline', e.target.value)}
                    placeholder="09613555111"
                  />
                </label>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn ghost sa-mini"
                    onClick={() => testCourierConnection(c)}
                  >
                    🔌 Test CarryBee Connection &amp; Fetch Stores
                  </button>
                  <button
                    type="button"
                    className="sa-btn primary sa-mini"
                    disabled={busy}
                    onClick={save}
                  >
                    💾 Save Courier
                  </button>
                  {courierTest[c.id] && (
                    <span style={{ fontSize: 13, color: courierTest[c.id].ok ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                      {courierTest[c.id].text}
                    </span>
                  )}
                </div>

                <CourierWebhookBox
                  c={c}
                  onRegenerate={() => regenerateCourierSecret(c.id)}
                  onUpdateSecret={(val) => setCour(c.id, 'webhookSecret', val)}
                  onUpdateHeaderValue={(val) => setCour(c.id, 'headerValue', val)}
                />
              </div>
            )}

            {c.provider === 'RedX' && (
              <div className="sa-sgrid">
                <label style={{ gridColumn: '1 / -1' }}>
                  API Access Token <span className="dim">(Bearer token from RedX Merchant Dashboard)</span>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showSecret[c.id] ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={c.apiKey || ''}
                      onChange={(e) => setCour(c.id, 'apiKey', e.target.value)}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 14 }}
                      title={showSecret[c.id] ? 'Hide' : 'Show'}
                    >
                      {showSecret[c.id] ? '🙈' : '👁️'}
                    </button>
                  </div>
                </label>
                <label>
                  Environment
                  <select
                    value={c.environment || 'production'}
                    onChange={(e) => setCour(c.id, 'environment', e.target.value)}
                  >
                    <option value="production">Production (Live)</option>
                    <option value="sandbox">Sandbox (Testing)</option>
                  </select>
                </label>
                <label>
                  Pickup Store ID <span className="dim">(From RedX stores)</span>
                  {courierTest[c.id]?.stores && courierTest[c.id].stores!.length > 0 ? (
                    <select
                      value={c.storeId || ''}
                      onChange={(e) => setCour(c.id, 'storeId', e.target.value)}
                    >
                      <option value="">Select pickup store…</option>
                      {courierTest[c.id].stores!.map((st: any) => (
                        <option key={st.id || st.pickup_store_id} value={st.id || st.pickup_store_id}>
                          {st.name || st.store_name} (ID: {st.id || st.pickup_store_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={c.storeId || ''}
                      onChange={(e) => setCour(c.id, 'storeId', e.target.value)}
                      placeholder="e.g. 12345"
                    />
                  )}
                </label>
                <label>
                  Hotline (Optional)
                  <input
                    value={c.hotline || ''}
                    onChange={(e) => setCour(c.id, 'hotline', e.target.value)}
                    placeholder="09610007339"
                  />
                </label>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sa-btn ghost sa-mini"
                    onClick={() => testCourierConnection(c)}
                  >
                    🔌 Test RedX Connection &amp; Fetch Stores
                  </button>
                  <button
                    type="button"
                    className="sa-btn primary sa-mini"
                    disabled={busy}
                    onClick={save}
                  >
                    💾 Save Courier
                  </button>
                  {courierTest[c.id] && (
                    <span style={{ fontSize: 13, color: courierTest[c.id].ok ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                      {courierTest[c.id].text}
                    </span>
                  )}
                </div>

                <CourierWebhookBox c={c} onRegenerate={() => regenerateCourierSecret(c.id)} onUpdateSecret={(val) => setCour(c.id, 'webhookSecret', val)} />
              </div>
            )}

            {c.provider === 'Custom' && (
              <div className="sa-sgrid">
                <label>API key / token<input type="password" value={c.apiKey || ''} onChange={(e) => setCour(c.id, 'apiKey', e.target.value)} placeholder={c.hasApiKey ? 'saved — leave to keep' : ''} /></label>
                <label>API secret / store id<input type="password" value={c.apiSecret || ''} onChange={(e) => setCour(c.id, 'apiSecret', e.target.value)} placeholder={c.hasApiSecret ? 'saved — leave to keep' : ''} /></label>
                <label>Hotline (optional)<input value={c.hotline || ''} onChange={(e) => setCour(c.id, 'hotline', e.target.value)} placeholder="shown to customer" /></label>
                <label>Consignment path<input value={c.consignmentPath || ''} onChange={(e) => setCour(c.id, 'consignmentPath', e.target.value)} placeholder="consignment.consignment_id" /></label>
                <label style={{ gridColumn: '1 / -1' }}>Booking URL<input value={c.bookUrl || ''} onChange={(e) => setCour(c.id, 'bookUrl', e.target.value)} placeholder="https://…/create_order" /></label>
                <label>Method<select value={c.bookMethod || 'POST'} onChange={(e) => setCour(c.id, 'bookMethod', e.target.value)}><option>POST</option><option>GET</option></select></label>
                <label>Track URL (optional)<input value={c.trackUrl || ''} onChange={(e) => setCour(c.id, 'trackUrl', e.target.value)} placeholder="https://…/track/{consignment}" /></label>
                <label style={{ gridColumn: '1 / -1' }}>Headers (JSON)<input value={c.bookHeaders || ''} onChange={(e) => setCour(c.id, 'bookHeaders', e.target.value)} placeholder={'{"Api-Key":"{apiKey}"}'} /></label>
                <label style={{ gridColumn: '1 / -1' }}>Body template (JSON)<input value={c.bookBody || ''} onChange={(e) => setCour(c.id, 'bookBody', e.target.value)} placeholder={'{"invoice":"{invoice}","recipient_phone":"{phone}","cod_amount":{amount}}'} /></label>
                <label style={{ gridColumn: '1 / -1', marginTop: 2, fontWeight: 600, color: '#ffffff' }}>Live status sync <span className="dim" style={{ fontWeight: 400 }}>— tracking updates automatically from this</span></label>
                <label style={{ gridColumn: '1 / -1' }}>Status URL<input value={c.statusUrl || ''} onChange={(e) => setCour(c.id, 'statusUrl', e.target.value)} placeholder="https://…/status_by_cid/{consignment}" /></label>
                <label>Status method<select value={c.statusMethod || 'GET'} onChange={(e) => setCour(c.id, 'statusMethod', e.target.value)}><option>GET</option><option>POST</option></select></label>
                <label>Status path<input value={c.statusPath || ''} onChange={(e) => setCour(c.id, 'statusPath', e.target.value)} placeholder="delivery_status" /></label>
                <label style={{ gridColumn: '1 / -1' }}>Status headers (JSON)<input value={c.statusHeaders || ''} onChange={(e) => setCour(c.id, 'statusHeaders', e.target.value)} placeholder={'{"Api-Key":"{apiKey}"}'} /></label>
                <label style={{ gridColumn: '1 / -1' }}>Status map (courier status → your status)<input value={c.statusMap || ''} onChange={(e) => setCour(c.id, 'statusMap', e.target.value)} placeholder={'{"delivered":"delivered","cancelled":"cancelled"}'} /></label>
                <CourierWebhookBox c={c} onRegenerate={() => regenerateCourierSecret(c.id)} onUpdateSecret={(val) => setCour(c.id, 'webhookSecret', val)} />
              </div>
            )}
          </div>
        ))}

        <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>Booking placeholders: {'{name} {phone} {address} {amount} {invoice} {items} {note} {apiKey} {apiSecret}'}. One-click booking lives on each order (Courier → Book).</p>
        </div>
        )}
      </div>
    </>
  );
}


// ==========================================
// 1. FINANCE & COURIER RECONCILIATION LEDGER
// ==========================================
function FinanceAdmin() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [courierFilter, setCourierFilter] = useState('all');
  const [payoutFilter, setPayoutFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');

  const load = () => {
    setLoading(true);
    aFetch('/admin/finance/summary')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const togglePayout = async (orderId: string, currentStatus: boolean) => {
    try {
      await aFetch('/admin/finance/toggle-payout', {
        method: 'POST',
        body: JSON.stringify({ orderId, received: !currentStatus })
      });
      setToast(`Order #${orderId} marked as ${!currentStatus ? 'Paid' : 'Pending'}`);
      setTimeout(() => setToast(''), 3000);
      load();
    } catch {}
  };

  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    return data.orders.filter((o: any) => {
      if (courierFilter !== 'all' && (o.courierName || '').toLowerCase() !== courierFilter.toLowerCase()) return false;
      if (payoutFilter === 'received' && !o.payoutReceived) return false;
      if (payoutFilter === 'pending' && o.payoutReceived) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          (o.customerName || '').toLowerCase().includes(q) ||
          (o.phone || '').includes(q) ||
          (o.consignment || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, courierFilter, payoutFilter, search]);

  const exportFinanceCSV = () => {
    if (!filteredOrders.length) return;
    const header = ['Order ID', 'Date', 'Customer', 'Phone', 'District', 'Status', 'Courier', 'Consignment', 'COD Total', 'Courier Fee', 'Net Receivable', 'Payout Status'];
    const rows = filteredOrders.map((o: any) => [
      o.id,
      new Date(o.createdAt).toLocaleDateString(),
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      o.phone,
      `"${(o.district || '').replace(/"/g, '""')}"`,
      o.status,
      o.courierName,
      o.consignment,
      o.total,
      o.courierFee,
      o.netReceivable,
      o.payoutReceived ? 'Paid' : 'Pending'
    ]);
    const csv = [header.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `courier_finance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return <div className="sa-card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading Finance &amp; Ledger Data…</div>;
  }

  const s = data || {};

  return (
    <>
      <div className="sa-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>Finance &amp; Courier Ledger</h1>
          {toast && (
            <span style={{ fontSize: 12, background: '#10b981', color: '#fff', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              ✓ {toast}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="sa-btn ghost" onClick={load}>🔄 Refresh Ledger</button>
          <button className="sa-btn" onClick={exportFinanceCSV}>📥 Export Statement (CSV)</button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>মোট ডেলিভারি COD</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>৳{(s.totalDelivered || 0).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>কাস্টমার থেকে কুরিয়ারের কাছে জমা</div>
        </div>

        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #f43f5e' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>কুরিয়ার চার্জ ও COD ফি</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f43f5e', marginTop: 4 }}>-৳{(s.totalCourierFees || 0).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>ডেলিভারি ফি + ১% COD চার্জ</div>
        </div>

        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>প্রাপ্য নিট টাকা (Net Receivable)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 4 }}>৳{(s.netDeliveredCash || 0).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>চার্জ বাদে আপনার প্রাপ্য</div>
        </div>

        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #eab308' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>কুরিয়ারে বকেয়া (Pending Cash)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#eab308', marginTop: 4 }}>৳{(s.pendingCourierBalance || 0).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>যা এখনও কুরিয়ার দেয়নি</div>
        </div>

        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #a855f7' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>রিসিভড পেমেন্ট (Reconciled)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#a855f7', marginTop: 4 }}>৳{(s.totalReconciled || 0).toLocaleString()}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>ব্যাংক/বিকাশে জমা পাওয়া গেছে</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="sa-card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="sa-search"
          style={{ maxWidth: 280 }}
          placeholder="Search ID, customer, consignment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="sa-mini" value={courierFilter} onChange={(e) => setCourierFilter(e.target.value)}>
          <option value="all">All Couriers</option>
          <option value="steadfast">Steadfast</option>
          <option value="carrybee">CarryBee</option>
          <option value="pathao">Pathao</option>
          <option value="ecourier">eCourier</option>
        </select>
        <select className="sa-mini" value={payoutFilter} onChange={(e) => setPayoutFilter(e.target.value)}>
          <option value="all">All Payout Statuses</option>
          <option value="pending">⏳ Pending Payout Only</option>
          <option value="received">✓ Paid Out / Received Only</option>
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 'auto' }}>
          Showing <b>{filteredOrders.length}</b> parcel(s)
        </span>
      </div>

      {/* Ledger Table */}
      <div className="sa-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 12 }}>
                <th style={{ padding: '12px 16px' }}>Order &amp; Date</th>
                <th style={{ padding: '12px 16px' }}>Customer</th>
                <th style={{ padding: '12px 16px' }}>Courier &amp; Tracking</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>COD Bill</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Est. Fee</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Net Receivable</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Payout Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                    No matching shipment records found in ledger.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((o: any) => (
                  <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>{o.id}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{new Date(o.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{o.customerName}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{o.phone} · {o.district}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, color: '#cbd5e1', fontWeight: 600 }}>
                        {o.courierName}
                      </span>
                      {o.consignment && (
                        <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 2, fontFamily: 'monospace' }}>
                          #{o.consignment}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                      ৳{o.total}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#f43f5e', fontSize: 12 }}>
                      -৳{o.courierFee}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                      ৳{o.netReceivable}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => togglePayout(o.id, o.payoutReceived)}
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '5px 12px',
                          borderRadius: 20,
                          cursor: 'pointer',
                          border: o.payoutReceived ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)',
                          background: o.payoutReceived ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          color: o.payoutReceived ? '#34d399' : '#facc15',
                        }}
                      >
                        {o.payoutReceived ? '✓ Received' : '⏳ Mark Received'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ==========================================
// 2. WHATSAPP AUTOMATION HUB
// ==========================================
function WhatsAppAdmin() {
  const [status, setStatus] = useState<any>({
    enabled: true,
    connected: false,
    phone: '',
    device: 'WhatsApp Web',
    triggers: {},
    logs: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  // Pairing Modal States
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairTab, setPairTab] = useState<'qr' | 'phone'>('qr');
  const [pairingPhoneInput, setPairingPhoneInput] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const startSession = async (reset = false) => {
    setConnecting(true);
    try {
      await aFetch('/admin/whatsapp/start-session', {
        method: 'POST',
        body: JSON.stringify({ reset }),
      });
      load(false);
    } catch {}
    finally {
      setConnecting(false);
    }
  };

  const load = (showLoader = false) => {
    if (showLoader) setLoading(true);
    aFetch('/admin/whatsapp/status')
      .then((r) => r.json())
      .then((d) => {
        setStatus((prev: any) => {
          if (!prev?.connected && d?.connected) {
            setShowPairModal(false);
            setToast(`🎉 WhatsApp Business সফলভাবে সংযুক্ত হয়েছে! (+${d.phone || ''})`);
            setTimeout(() => setToast(''), 4500);
          }
          return d;
        });
        if (showLoader) setLoading(false);
      })
      .catch(() => {
        if (showLoader) setLoading(false);
      });
  };

  useEffect(() => { load(true); }, []);

  // Poll real Baileys status while modal is open or waiting for connection
  useEffect(() => {
    if (status.connected && !showPairModal) return;
    const interval = setInterval(() => {
      load(false);
    }, 2500);
    return () => clearInterval(interval);
  }, [showPairModal, status.connected]);

  // When opening modal for QR tab, make sure session is started on server
  useEffect(() => {
    if (showPairModal && pairTab === 'qr' && !status.connected && !status.qrDataUrl) {
      startSession(false);
    }
  }, [showPairModal, pairTab, status.connected, status.qrDataUrl]);

  const saveTriggers = async (triggersPatch: any) => {
    setSaving(true);
    try {
      const res = await aFetch('/admin/whatsapp/settings', {
        method: 'POST',
        body: JSON.stringify({ triggers: triggersPatch })
      }).then(r => r.json());
      if (res.ok) {
        setStatus((prev: any) => ({ ...prev, triggers: res.settings.triggers }));
        setToast('WhatsApp message templates saved!');
        setTimeout(() => setToast(''), 3000);
      }
    } catch {}
    finally { setSaving(false); }
  };

  const toggleTrigger = (key: string) => {
    const current = status.triggers?.[key] || {};
    const updated = {
      ...status.triggers,
      [key]: { ...current, enabled: !current.enabled }
    };
    saveTriggers(updated);
  };

  const updateTemplate = (key: string, template: string) => {
    const current = status.triggers?.[key] || {};
    setStatus((prev: any) => ({
      ...prev,
      triggers: {
        ...prev.triggers,
        [key]: { ...current, template }
      }
    }));
  };

  const handleConnectPhone = async () => {
    if (!pairingPhoneInput.trim()) {
      alert('অনুগ্রহ করে আপনার হোয়াটসঅ্যাপ নাম্বারটি লিখুন');
      return;
    }
    setConnecting(true);
    try {
      const res = await aFetch('/admin/whatsapp/request-pair-code', {
        method: 'POST',
        body: JSON.stringify({
          phone: pairingPhoneInput.trim(),
        })
      }).then(r => r.json());
      if (res.ok && res.pairingCode) {
        setGeneratedCode(res.pairingCode);
        setToast('৮-ডিজিটের অফিসিয়াল পেয়ারিং কোড তৈরি হয়েছে!');
        setTimeout(() => setToast(''), 4000);
      } else {
        alert(res.error || 'Failed to generate pairing code');
      }
    } catch (e: any) {
      alert('Failed: ' + (e?.message || 'Error'));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect WhatsApp?')) return;
    const res = await aFetch('/admin/whatsapp/disconnect', { method: 'POST' }).then(r => r.json());
    if (res.ok) {
      setStatus(res.settings);
      setToast('WhatsApp Disconnected.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  const sendDirectMessage = async () => {
    if (!manualPhone || !broadcastMsg) {
      alert('Phone number and message text are required');
      return;
    }
    setSendingMsg(true);
    try {
      const res = await aFetch('/admin/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: manualPhone, message: broadcastMsg })
      }).then(r => r.json());
      if (res.ok) {
        setToast('Message dispatched!');
        setBroadcastMsg('');
        setTimeout(() => setToast(''), 3000);
        load();
      }
    } catch {}
    finally { setSendingMsg(false); }
  };

  const triggers = status.triggers || {};


  return (
    <>
      <style>{`
        @keyframes waLaserBeam {
          0% { top: 8px; opacity: 0.85; }
          50% { opacity: 1; }
          100% { top: calc(100% - 10px); opacity: 0.85; }
        }
        @keyframes waPulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>

      <div className="sa-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>WhatsApp Automation Hub</h1>
          {status.connected ? (
            <span className="sa-badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'waPulseDot 1.6s infinite' }} /> Connected &amp; Active
            </span>
          ) : (
            <span className="sa-badge danger">Disconnected</span>
          )}
        </div>
        <div>
          {status.connected ? (
            <button className="sa-btn ghost danger" onClick={handleDisconnect}>🔌 Disconnect WhatsApp</button>
          ) : (
            <button className="sa-btn" style={{ background: '#25D366', color: '#000', fontWeight: 600 }} onClick={() => setShowPairModal(true)}>
              🔗 Link WhatsApp Device (QR)
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13, fontWeight: 500 }}>
          {toast}
        </div>
      )}

      {/* Connection Card */}
      <div className="sa-card" style={{ padding: 22, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>📱</span>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              WhatsApp Web Live Gateway
            </h2>
          </div>
          <p className="dim" style={{ fontSize: 13, margin: '6px 0 0', lineHeight: 1.6 }}>
            {status.connected
              ? `✅ Active session linked to: +${status.phone || '8801878374762'} (${status.device || 'WhatsApp Web'}) · Auto-dispatching triggers.`
              : 'আপনার WhatsApp Business মোবাইল অ্যাপটি কিউআর কোড স্ক্যান করে কানেক্ট করুন। অর্ডার অ্যাপ্রুভ, শিপিং ও পরিত্যক্ত চেকআউটের মেসেজ স্বয়ংক্রিয়ভাবে কাস্টমারকে পাঠানো হবে।'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="sa-btn ghost sa-mini"
            onClick={() => {
              const testPhone = prompt('Enter your phone number to test automated WhatsApp delivery:', status.phone || '018');
              if (testPhone) {
                window.open(`https://wa.me/88${testPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Hello! Your WhatsApp Automation test message from store.')}`, '_blank');
              }
            }}
          >
            💬 Open Test Chat
          </button>
          {!status.connected && (
            <button className="sa-btn sa-mini" style={{ background: '#25D366', color: '#000', fontWeight: 600 }} onClick={() => setShowPairModal(true)}>
              📷 Scan QR Code
            </button>
          )}
        </div>
      </div>

      {/* 4 Automated Trigger Rules */}
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#f8fafc' }}>
        ⚡ Automated Customer Notifications
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
        {/* 1. Incomplete Order Lead */}
        <div className="sa-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: 14, color: '#f8fafc' }}>1. Incomplete Order Recovery</b>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>চেকআউট ফর্ম পূরণ করে বের হয়ে গেলে অটো রিকভারি মেসেজ</div>
            </div>
            <label className="sa-chk">
              <input type="checkbox" checked={!!triggers.incomplete?.enabled} onChange={() => toggleTrigger('incomplete')} />
              <span>{triggers.incomplete?.enabled ? 'Active' : 'Off'}</span>
            </label>
          </div>
          <textarea
            style={{ width: '100%', minHeight: 90, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f8fafc', padding: 10, fontSize: 12.5 }}
            value={triggers.incomplete?.template || ''}
            onChange={(e) => updateTemplate('incomplete', e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Tags: {'{name} {store} {items} {total}'}</span>
            <button className="sa-btn ghost sa-mini" disabled={saving} onClick={() => saveTriggers(triggers)}>Save</button>
          </div>
        </div>

        {/* 2. Order Approved */}
        <div className="sa-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: 14, color: '#f8fafc' }}>2. Order Approved Confirmation</b>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>অর্ডার কনফার্ম বা অ্যাপ্রুভ করলে সাথে সাথে মেসেজ</div>
            </div>
            <label className="sa-chk">
              <input type="checkbox" checked={!!triggers.approved?.enabled} onChange={() => toggleTrigger('approved')} />
              <span>{triggers.approved?.enabled ? 'Active' : 'Off'}</span>
            </label>
          </div>
          <textarea
            style={{ width: '100%', minHeight: 90, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f8fafc', padding: 10, fontSize: 12.5 }}
            value={triggers.approved?.template || ''}
            onChange={(e) => updateTemplate('approved', e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Tags: {'{name} {order_id} {total} {store}'}</span>
            <button className="sa-btn ghost sa-mini" disabled={saving} onClick={() => saveTriggers(triggers)}>Save</button>
          </div>
        </div>

        {/* 3. Order Shipped */}
        <div className="sa-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: 14, color: '#f8fafc' }}>3. Order Shipped &amp; Tracking</b>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>কুরিয়ারে পার্সেল এন্ট্রি হলে ট্র্যাকিং কোডসহ নোটিফিকেশন</div>
            </div>
            <label className="sa-chk">
              <input type="checkbox" checked={!!triggers.shipped?.enabled} onChange={() => toggleTrigger('shipped')} />
              <span>{triggers.shipped?.enabled ? 'Active' : 'Off'}</span>
            </label>
          </div>
          <textarea
            style={{ width: '100%', minHeight: 90, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f8fafc', padding: 10, fontSize: 12.5 }}
            value={triggers.shipped?.template || ''}
            onChange={(e) => updateTemplate('shipped', e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Tags: {'{name} {courier} {consignment} {tracking_url}'}</span>
            <button className="sa-btn ghost sa-mini" disabled={saving} onClick={() => saveTriggers(triggers)}>Save</button>
          </div>
        </div>

        {/* 4. Order Cancelled */}
        <div className="sa-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: 14, color: '#f8fafc' }}>4. Order Cancelled Notice</b>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>অর্ডার বাতিল হলে কারণসহ কাস্টমারকে নোটিশ</div>
            </div>
            <label className="sa-chk">
              <input type="checkbox" checked={!!triggers.cancelled?.enabled} onChange={() => toggleTrigger('cancelled')} />
              <span>{triggers.cancelled?.enabled ? 'Active' : 'Off'}</span>
            </label>
          </div>
          <textarea
            style={{ width: '100%', minHeight: 90, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f8fafc', padding: 10, fontSize: 12.5 }}
            value={triggers.cancelled?.template || ''}
            onChange={(e) => updateTemplate('cancelled', e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Tags: {'{name} {order_id} {store}'}</span>
            <button className="sa-btn ghost sa-mini" disabled={saving} onClick={() => saveTriggers(triggers)}>Save</button>
          </div>
        </div>
      </div>

      {/* Direct WhatsApp Quick Messenger */}
      <div className="sa-card" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
          📤 Direct WhatsApp Messenger &amp; Marketing
        </h2>
        <p className="dim" style={{ fontSize: 13, margin: '4px 0 14px' }}>
          যেকোনো কাস্টমারের নাম্বারে তাৎক্ষণিক কাস্টম অফার বা মেসেজ পাঠান।
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', gap: 12, alignItems: 'center' }}>
          <input
            className="sa-search"
            placeholder="017xxxxxxxx"
            value={manualPhone}
            onChange={(e) => setManualPhone(e.target.value)}
          />
          <input
            className="sa-search"
            placeholder="মেসেজ লিখুন (যেমন: ভাইয়া আপনার জন্য বিশেষ ২০% ডিসকাউন্ট কুপন...)"
            value={broadcastMsg}
            onChange={(e) => setBroadcastMsg(e.target.value)}
          />
          <button className="sa-btn" disabled={sendingMsg} onClick={sendDirectMessage}>
            {sendingMsg ? 'Sending…' : '🚀 Send Message'}
          </button>
        </div>
      </div>

      {/* WhatsApp Web Live Pairing Modal */}
      {showPairModal && (
        <div className="sa-modal-backdrop" onClick={() => setShowPairModal(false)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540, textAlign: 'left', padding: '26px 30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <WhatsAppIcon size={24} variant="official" /> Link Business WhatsApp
                </h3>
                <p className="dim" style={{ fontSize: 13, margin: '4px 0 0' }}>
                  Use WhatsApp on your computer to connect automatic messaging.
                </p>
              </div>
              <button
                className="sa-modal-close"
                onClick={() => setShowPairModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div style={{ display: 'flex', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 10, marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setPairTab('qr')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: pairTab === 'qr' ? '#25D366' : 'transparent',
                  color: pairTab === 'qr' ? '#000' : '#cbd5e1',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                📷 Scan QR Code
              </button>
              <button
                type="button"
                onClick={() => setPairTab('phone')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  background: pairTab === 'phone' ? '#25D366' : 'transparent',
                  color: pairTab === 'phone' ? '#000' : '#cbd5e1',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                🔢 Link with Phone Number
              </button>
            </div>

            {/* TAB 1: QR CODE */}
            {pairTab === 'qr' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24, alignItems: 'center' }}>
                  {/* QR Box with Laser Scan Effect */}
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        position: 'relative',
                        width: 230,
                        height: 230,
                        background: '#ffffff',
                        padding: 12,
                        borderRadius: 14,
                        boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                        margin: '0 auto',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {/* Laser Beam Animation */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 10,
                          right: 10,
                          height: 3,
                          background: '#25D366',
                          boxShadow: '0 0 12px 2px #25D366',
                          zIndex: 5,
                          animation: 'waLaserBeam 2.2s infinite alternate ease-in-out',
                        }}
                      />

                      {/* Real Baileys WhatsApp QR Image */}
                      {status.qrDataUrl ? (
                        <img
                          src={status.qrDataUrl}
                          alt="WhatsApp Web Multi-Device QR"
                          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 14, textAlign: 'center' }}>
                          <div style={{ fontSize: 28, marginBottom: 8, animation: 'waPulseDot 1.4s infinite' }}>⏳</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                            {connecting ? 'Creating Session…' : 'Generating QR Code…'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            Connecting to WhatsApp Web Multi-Device Gateway
                          </div>
                        </div>
                      )}

                      {/* Center WhatsApp Icon (Only if QR is visible) */}
                      {status.qrDataUrl && (
                        <div
                          style={{
                            position: 'absolute',
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                            zIndex: 4,
                          }}
                        >
                          <WhatsAppIcon size={26} variant="official" />
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12 }}>
                      <button
                        type="button"
                        disabled={connecting}
                        onClick={() => startSession(true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#25D366',
                          cursor: 'pointer',
                          padding: 0,
                          textDecoration: 'underline',
                          fontSize: 12.5,
                          fontWeight: 600,
                        }}
                      >
                        🔄 {connecting ? 'Refreshing…' : 'Get Fresh QR Code'}
                      </button>
                    </div>
                  </div>

                  {/* Instructions */}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', margin: '0 0 10px' }}>
                      To connect your device:
                    </h4>
                    <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 }}>
                      <li>Open <b>WhatsApp</b> on your phone</li>
                      <li>Tap <b>Menu (⋮)</b> on Android, or <b>Settings</b> on iPhone</li>
                      <li>Tap <b>Linked Devices</b> and then <b>Link a Device</b></li>
                      <li>Point your phone camera to this screen to scan the QR code</li>
                    </ol>

                    <div style={{ marginTop: 18, background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#4ade80' }}>
                      💡 This is the official WhatsApp Web multi-device handshake. Once scanned, your session pairs automatically without logging out from your phone.
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
                  <button className="sa-btn ghost" style={{ flex: 1 }} onClick={() => setShowPairModal(false)}>
                    Close
                  </button>
                  <button
                    className="sa-btn"
                    style={{ flex: 2, background: '#25D366', color: '#000', fontWeight: 700 }}
                    disabled={connecting}
                    onClick={() => {
                      load(true);
                      if (status.connected) {
                        setShowPairModal(false);
                      } else {
                        alert('আপনার মোবাইলের WhatsApp অ্যাপের Linked Devices দিয়ে QR কোডটি স্ক্যান করুন। স্ক্যান সম্পন্ন হলেই এটি স্বয়ংক্রিয়ভাবে কানেক্ট হবে।');
                      }
                    }}
                  >
                    {status.connected ? '✓ Connected' : '🔄 Check Connection'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: LINK WITH PHONE NUMBER */}
            {pairTab === 'phone' && (
              <div>
                <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginTop: 0 }}>
                  Enter your business WhatsApp phone number to link without camera scanning:
                </p>

                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <input
                    style={{
                      flex: 1,
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff',
                      fontSize: 16,
                    }}
                    placeholder="e.g. 01878374762"
                    value={pairingPhoneInput}
                    onChange={(e) => setPairingPhoneInput(e.target.value)}
                  />
                  <button
                    className="sa-btn"
                    style={{ background: '#25D366', color: '#000', fontWeight: 600, whiteSpace: 'nowrap' }}
                    disabled={connecting}
                    onClick={handleConnectPhone}
                  >
                    {connecting ? 'Generating…' : 'Get Code'}
                  </button>
                </div>

                {generatedCode && (
                  <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 12, padding: 20, textAlign: 'center', marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Your 8-Digit Pairing Code</div>
                    <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '.25em', color: '#25D366', fontFamily: 'monospace' }}>
                      {generatedCode}
                    </div>
                    <p style={{ fontSize: 12.5, color: '#cbd5e1', margin: '10px 0 14px' }}>
                      Enter this code in the WhatsApp notification received on your phone.
                    </p>
                    <button
                      className="sa-btn ghost sa-mini"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedCode.replace('-', ''));
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                    >
                      {copied ? '✓ Copied!' : '📋 Copy Code'}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="sa-btn ghost" style={{ flex: 1 }} onClick={() => setShowPairModal(false)}>
                    Close
                  </button>
                  <button
                    className="sa-btn"
                    style={{ flex: 1, background: '#25D366', color: '#000', fontWeight: 600 }}
                    onClick={() => {
                      setShowPairModal(false);
                      setToast('WhatsApp Connected!');
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ==========================================
// 3. DEDICATED STORE BACKUP & RESTORE
// ==========================================
function BackupAdmin() {
  const [stats, setStats] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([
      aFetch('/orders').then(r => r.json()).catch(() => []),
      fetch('/api/products').then(r => r.json()).catch(() => []),
      aFetch('/customers').then(r => r.json()).catch(() => [])
    ]).then(([orders, prods, custs]) => {
      setStats({
        ordersCount: Array.isArray(orders) ? orders.length : 0,
        productsCount: Array.isArray(prods) ? prods.length : 0,
        customersCount: Array.isArray(custs) ? custs.length : 0
      });
    }).catch(() => {});
  }, []);

  const handleDownloadBackup = async () => {
    setDownloading(true);
    try {
      const res = await aFetch('/admin/backup/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `store_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setToast('Store backup downloaded to your computer!');
      setTimeout(() => setToast(''), 3000);
    } catch (e: any) {
      alert('Download failed: ' + e.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleFileSelect = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json || typeof json !== 'object') throw new Error('Invalid JSON file');
        setPreview(json);
      } catch (err: any) {
        alert('Invalid backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const executeRestore = async () => {
    if (!preview) return;
    if (!confirm('⚠️ সতর্কবার্তা: ব্যাকআপ ফাইলটি রিস্টোর করলে বর্তমান ডাটাবেস আপডেট ও সিঙ্ক হবে। আপনি কি নিশ্চিত?')) return;
    setRestoring(true);
    try {
      const res = await aFetch('/admin/backup/restore', {
        method: 'POST',
        body: JSON.stringify(preview)
      }).then(r => r.json());
      if (res.ok) {
        alert('✓ সম্পূর্ণ ডাটাবেস সফলভাবে রিস্টোর হয়েছে! পেজটি এখন রিফ্রেশ হবে।');
        location.reload();
      } else {
        alert('Restore failed: ' + (res.error || 'Unknown error'));
      }
    } catch (e: any) {
      alert('Restore failed: ' + e.message);
    } finally {
      setRestoring(false);
      setPreview(null);
    }
  };

  return (
    <>
      <div className="sa-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1>Backup &amp; Restore Hub</h1>
          <span style={{ fontSize: 11, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '3px 8px', borderRadius: 999, border: '1px solid rgba(34, 197, 94, 0.3)', fontWeight: 600 }}>
            🛡️ Zero Data Loss Shield Active
          </span>
          {toast && (
            <span style={{ fontSize: 12, background: '#10b981', color: '#fff', padding: '4px 10px', borderRadius: 6, fontWeight: 600 }}>
              ✓ {toast}
            </span>
          )}
        </div>
      </div>

      {/* Database Health Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #38bdf8' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>সংরক্ষিত মোট অর্ডার</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginTop: 4 }}>{stats ? stats.ordersCount : '…'} টি</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>সব হিস্ট্রি ও স্ট্যাটাসসহ</div>
        </div>

        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>নিবন্ধিত কাস্টমার</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{stats ? stats.customersCount : '…'} জন</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>ঠিকানা ও ফোন নাম্বারসহ</div>
        </div>

        <div className="sa-card" style={{ padding: '16px 20px', borderLeft: '4px solid #eab308' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>ক্যাটালগ প্রোডাক্টস</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#eab308', marginTop: 4 }}>{stats ? stats.productsCount : '…'} টি</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>ভ্যারিয়েশন ও প্রাইসিংসহ</div>
        </div>
      </div>

      {/* 2 Big Action Columns: Download vs Upload */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Column 1: Download */}
        <div className="sa-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📥</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: '#f8fafc' }}>
            ১-ক্লিক সম্পূর্ণ ডাটাবেস ডাউনলোড
          </h2>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
            আপনার সমস্ত অর্ডার, কাস্টমার লিস্ট, প্রোডাক্ট ক্যাটালগ, সেটিংস, ল্যান্ডিং পেজ ও কুরিয়ার কনফিগারেশনের একটি সম্পূর্ণ <code>.json</code> ব্যাকআপ ফাইল ডাউনলোড করে আপনার নিজের কম্পিউটারে সংরক্ষণ করুন।
          </p>
          <button
            className="sa-btn"
            style={{ width: '100%', padding: '12px 18px', fontSize: 14, fontWeight: 700 }}
            disabled={downloading}
            onClick={handleDownloadBackup}
          >
            {downloading ? 'Creating Backup…' : '📥 Download Store Backup (.json)'}
          </button>
        </div>

        {/* Column 2: Upload & Restore */}
        <div className="sa-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📤</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: '#f8fafc' }}>
            ব্যাকআপ ফাইল থেকে রিস্টোর (Uploader)
          </h2>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            পূর্বে ডাউনলোড করা যেকোনো <code>.json</code> ব্যাকআপ ফাইল আপলোড করে ১ ক্লিকে সমস্ত ডাটা ফিরিয়ে আনুন।
          </p>

          <input
            type="file"
            accept=".json"
            id="backup-file-input"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            type="button"
            className="sa-btn ghost"
            style={{ width: '100%', padding: '12px 18px', fontSize: 14, marginBottom: 12, border: '1px dashed rgba(255,255,255,0.25)' }}
            onClick={() => document.getElementById('backup-file-input')?.click()}
          >
            📁 Select Backup File from PC
          </button>

          {preview && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 14, marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 4 }}>
                ✓ Valid Backup File Selected:
              </div>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                • Export Date: {preview.exportedAt ? new Date(preview.exportedAt).toLocaleString() : 'N/A'}<br/>
                • Orders: {Array.isArray(preview.orders) ? preview.orders.length : 0} items<br/>
                • Products: {preview.catalog?.products ? preview.catalog.products.length : 0} items<br/>
                • Customers: {Array.isArray(preview.customers) ? preview.customers.length : 0} customers
              </div>
              <button
                type="button"
                className="sa-btn danger"
                style={{ width: '100%', marginTop: 12, padding: 10, fontWeight: 700 }}
                disabled={restoring}
                onClick={executeRestore}
              >
                {restoring ? 'Restoring…' : '⚠️ Confirm &amp; Restore Live Store'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CouponsAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState<any>({ code: '', type: 'percent', value: '', minSubtotal: '' });
  const [err, setErr] = useState('');
  const load = () => aFetch('/coupons').then((r) => (r.ok ? r.json() : [])).then((d) => setList(Array.isArray(d) ? d : [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const add = async () => {
    setErr('');
    try { const r = await aFetch('/coupons', { method: 'POST', body: JSON.stringify(f) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); setF({ code: '', type: 'percent', value: '', minSubtotal: '' }); load(); }
    catch (e: any) { setErr(e.message); }
  };
  const del = async (code: string) => { await aFetch('/coupons/' + code, { method: 'DELETE' }); load(); };
  return (
    <>
      <div className="sa-top"><h1>Coupons</h1></div>
      <div className="sa-card" style={{ padding: 18, marginBottom: 16 }}>
        <div className="sa-frow">
          <input placeholder="CODE" value={f.code} onChange={(e) => setF((s: any) => ({ ...s, code: e.target.value }))} />
          <select value={f.type} onChange={(e) => setF((s: any) => ({ ...s, type: e.target.value }))}><option value="percent">% off</option><option value="flat">৳ off</option></select>
          <input placeholder={f.type === 'percent' ? '% value' : '৳ value'} value={f.value} onChange={(e) => setF((s: any) => ({ ...s, value: e.target.value }))} />
          <input placeholder="min ৳ (opt)" value={f.minSubtotal} onChange={(e) => setF((s: any) => ({ ...s, minSubtotal: e.target.value }))} />
          <button className="sa-btn" onClick={add}>Add</button>
        </div>
        {err && <div className="err2" style={{ marginTop: 8 }}>{err}</div>}
      </div>
      <div className="sa-card">
        <table className="sa-table"><thead><tr><th>Code</th><th>Discount</th><th>Min spend</th><th></th></tr></thead>
          <tbody>{list.map((c) => <tr key={c.code}><td className="mono">{c.code}</td><td>{c.type === 'percent' ? c.value + '%' : '৳' + c.value}</td><td className="dim">{c.minSubtotal ? '৳' + c.minSubtotal : '—'}</td><td className="r"><button className="sa-link danger" onClick={() => del(c.code)}>Delete</button></td></tr>)}</tbody></table>
        {list.length === 0 && <div className="sa-empty">No coupons yet.</div>}
      </div>
    </>
  );
}
function ColorsAdmin() {
  const [colors, setColors] = useState<MasterColor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [hex, setHex] = useState('#111111');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setLoading(true);
    const data = await fetchMasterColors();
    setColors(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErr('');
    try {
      const res = await createMasterColor(name.trim(), hex);
      if (res.colors && res.colors.length > 0) setColors(res.colors);
      setName('');
    } catch (e: any) {
      setErr(e.message || 'Could not add color');
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string, colorName: string) => {
    if (!confirm(`Delete color "${colorName}" from master library?`)) return;
    const res = await deleteMasterColor(id);
    if (res.colors) setColors(res.colors);
  };

  const filtered = colors.filter(
    (c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.hex.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <>
      <div className="sa-top">
        <h1>🎨 Master Color Library</h1>
      </div>
      <div className="sa-card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#c4b5fd' }}>+ Create New Master Color</div>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
            Colors saved here appear permanently across all products so you never have to re-enter them again.
          </p>
        </div>
        {err && <div className="sa-err" style={{ marginBottom: 12 }}>{err}</div>}
        <form onSubmit={add} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            placeholder="Color Name (e.g. Royal Maroon, Rose Gold, Matte Black)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1.5, minWidth: 200 }}
            required
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              style={{ width: 34, height: 28, border: 'none', background: 'none', cursor: 'pointer' }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#cbd5e1' }}>{hex}</span>
          </div>
          <button type="submit" className="sa-btn primary" disabled={saving}>
            {saving ? 'Saving...' : '💾 Save to Master Library'}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="dim small">Total Colors: <b style={{ color: '#fff' }}>{colors.length}</b></div>
        <input
          placeholder="Filter colors..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 200, padding: '6px 10px', fontSize: 12 }}
        />
      </div>

      <div className="sa-card" style={{ padding: 14 }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Loading colors...</div>
        ) : filtered.length === 0 ? (
          <div className="sa-empty">No colors found.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {filtered.map((c) => (
              <div
                key={c.id || c.name}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: c.hex,
                      border: '2px solid rgba(255,255,255,0.25)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                      {c.hex}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => del(c.id, c.name)}
                  style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
                  title="Delete from master library"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function CategoriesAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState<any>({ name: '', blurb: '', image: '', adult: false });
  const [editSlug, setEditSlug] = useState('');
  const [err, setErr] = useState('');
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const load = () => fetch('/api/categories').then((r) => r.json()).then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  const reset = () => { setF({ name: '', blurb: '', image: '', adult: false }); setEditSlug(''); };
  const save = async () => {
    setErr('');
    try {
      const r = editSlug
        ? await aFetch('/categories/' + editSlug, { method: 'PUT', body: JSON.stringify(f) })
        : await aFetch('/categories', { method: 'POST', body: JSON.stringify(f) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error); reset(); load();
    } catch (e: any) { setErr(e.message); }
  };
  const edit = (c: any) => { setEditSlug(c.slug); setF({ name: c.name, blurb: c.blurb || '', image: c.image || '', adult: !!c.adult }); window.scrollTo(0, 0); };
  const del = async (slug: string) => { if (!confirm('Delete category? Products keep their tag.')) return; await aFetch('/categories/' + slug, { method: 'DELETE' }); if (editSlug === slug) reset(); load(); };
  return (
    <>
      <div className="sa-top"><h1>Categories</h1></div>
      <div className="sa-card" style={{ padding: 18, marginBottom: 16 }}>
        {editSlug && <div className="dim small" style={{ marginBottom: 8 }}>Editing <b>{editSlug}</b> · <span className="sa-link" onClick={reset}>cancel</span></div>}
        <div className="sa-frow" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input placeholder="Category name" value={f.name} onChange={(e) => setF((s: any) => ({ ...s, name: e.target.value }))} style={{ flex: 1.2, minWidth: 160 }} />
          <input placeholder="blurb (optional)" value={f.blurb} onChange={(e) => setF((s: any) => ({ ...s, blurb: e.target.value }))} style={{ flex: 1, minWidth: 150 }} />
          <input placeholder="image url" value={f.image} onChange={(e) => setF((s: any) => ({ ...s, image: e.target.value }))} style={{ flex: 1.2, minWidth: 160 }} />
          <button
            type="button"
            className="sa-btn primary"
            style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#7c3aed', borderColor: '#7c3aed', padding: '9px 14px' }}
            onClick={() => setMediaPickerOpen(true)}
          >
            <span>🖼️</span>
            <span>{f.image ? 'Change Photo' : 'Select Photo (Media Library)'}</span>
          </button>
          <label className="sa-chk" style={{ whiteSpace: 'nowrap' }}><input type="checkbox" checked={f.adult} onChange={(e) => setF((s: any) => ({ ...s, adult: e.target.checked }))} /> 18+</label>
          <button className="sa-btn" onClick={save} style={{ padding: '9px 18px' }}>{editSlug ? 'Update' : 'Add'}</button>
        </div>
        {f.image && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <img src={f.image} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>Category Photo:</div>
              <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.image}</div>
            </div>
            <button type="button" className="sa-btn ghost sa-mini" onClick={() => setMediaPickerOpen(true)}>Change</button>
            <button type="button" className="sa-link danger" onClick={() => setF((s: any) => ({ ...s, image: '' }))}>remove image</button>
          </div>
        )}
        {err && <div className="err2" style={{ marginTop: 8 }}>{err}</div>}
      </div>

      {mediaPickerOpen && (
        <MediaPickerModal
          title={`Category Photo: ${f.name || 'New Category'}`}
          currentUrl={f.image}
          onSelect={(url) => {
            setF((s: any) => ({ ...s, image: url }));
            setMediaPickerOpen(false);
          }}
          onClose={() => setMediaPickerOpen(false)}
        />
      )}
      <div className="sa-card">
        <table className="sa-table"><thead><tr><th>Category</th><th>Slug</th><th>Type</th><th className="r">Actions</th></tr></thead>
          <tbody>{list.map((c) => <tr key={c.slug}><td className="pcell">{c.image ? <img src={c.image} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6 }} /> : null}<span className="pn">{c.name}</span></td><td className="dim">{c.slug}</td><td>{c.adult ? <span className="sa-badge b-adult">18+</span> : <span className="sa-badge b-ok">normal</span>}</td><td className="r"><button className="sa-link" onClick={() => edit(c)}>Edit</button><button className="sa-link danger" onClick={() => del(c.slug)}>Delete</button></td></tr>)}</tbody></table>
      </div>
    </>
  );
}

function LandingsAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [tab, setTab] = useState<'general' | 'hero' | 'video' | 'packages' | 'benefits' | 'usage' | 'reviews' | 'guarantee'>('general');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  // Media Library Picker Modal State
  const [mediaPickerTarget, setMediaPickerTarget] = useState<{
    title: string;
    currentUrl: string;
    onSelect: (url: string) => void;
  } | null>(null);
  const [mediaLibrary, setMediaLibrary] = useState<any[]>([
    { url: '/landing/package-6-7.jpg', name: 'package-6-7.jpg (৬.৭ ইঞ্চি প্যাকেজ)', category: 'landing' },
    { url: '/landing/package-5-7.jpg', name: 'package-5-7.jpg (৫.৭ ইঞ্চি প্যাকেজ)', category: 'landing' },
    { url: '/landing/banner-product.png', name: 'banner-product.png (হিরো ব্যানার)', category: 'landing' },
    { url: '/landing/usage-guide.jpg', name: 'usage-guide.jpg (ব্যবহারের নির্দেশিকা)', category: 'landing' },
    { url: '/landing/review-1.png', name: 'review-1.png (রিভিউ ১)', category: 'landing' },
    { url: '/landing/review-2.png', name: 'review-2.png (রিভিউ ২)', category: 'landing' },
    { url: '/landing/review-3.png', name: 'review-3.png (রিভিউ ৩)', category: 'landing' },
    { url: '/landing/review-4.png', name: 'review-4.png (রিভিউ ৪)', category: 'landing' }
  ]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaSearch, setMediaSearch] = useState('');
  const [selectedModalImg, setSelectedModalImg] = useState('');

  const loadMediaLibrary = async () => {
    setMediaLoading(true);
    try {
      const res = await aFetch('/admin/media');
      const data = await res.json();
      const serverMedia = Array.isArray(data)
        ? data.map((m: any) => ({
            url: m.url || ('/uploads/' + m.name),
            name: m.name || m.url,
            size: m.size,
            category: 'upload'
          }))
        : [];

      const baseList = [
        { url: '/landing/package-6-7.jpg', name: 'package-6-7.jpg (৬.৭ ইঞ্চি প্যাকেজ)', category: 'landing' },
        { url: '/landing/package-5-7.jpg', name: 'package-5-7.jpg (৫.৭ ইঞ্চি প্যাকেজ)', category: 'landing' },
        { url: '/landing/banner-product.png', name: 'banner-product.png (হিরো ব্যানার)', category: 'landing' },
        { url: '/landing/usage-guide.jpg', name: 'usage-guide.jpg (ব্যবহারের নির্দেশিকা)', category: 'landing' },
        { url: '/landing/review-1.png', name: 'review-1.png (রিভিউ ১)', category: 'landing' },
        { url: '/landing/review-2.png', name: 'review-2.png (রিভিউ ২)', category: 'landing' },
        { url: '/landing/review-3.png', name: 'review-3.png (রিভিউ ৩)', category: 'landing' },
        { url: '/landing/review-4.png', name: 'review-4.png (রিভিউ ৪)', category: 'landing' }
      ];

      const seen = new Set();
      const merged: any[] = [];
      for (const item of [...baseList, ...serverMedia]) {
        if (item.url && !seen.has(item.url)) {
          seen.add(item.url);
          merged.push(item);
        }
      }
      setMediaLibrary(merged);
    } catch {
      // keep existing fallback
    } finally {
      setMediaLoading(false);
    }
  };

  const openMediaPicker = (title: string, currentUrl: string, onSelect: (url: string) => void) => {
    setMediaPickerTarget({ title, currentUrl, onSelect });
    setSelectedModalImg(currentUrl || '');
    setMediaSearch('');
    loadMediaLibrary();
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await aFetch('/landings');
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e.message || 'Failed to load landings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const uploadFile = async (file: File, onDone: (url: string) => void, key: string) => {
    setUploadingKey(key);
    try {
      const d = await uploadOptimizedImage(file);
      if (d && d.url) {
        onDone(d.url);
      } else {
        alert('Upload failed');
      }
    } catch (e: any) {
      alert(e.message || 'Upload failed');
    } finally {
      setUploadingKey(null);
    }
  };

  const createNewLanding = () => {
    const newL = {
      id: 'landing_' + Date.now().toString(36),
      title: 'নতুন ল্যান্ডিং পেজ',
      slug: 'offer-' + Math.random().toString(36).slice(2, 7),
      aliases: [],
      status: 'live',
      freeDelivery: true,
      badgeTop: '১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি নিশ্চিত',
      badgeGuarantee: 'একমাত্র আমরাই দিচ্ছি ৩ দিনের রিপ্লেসমেন্ট গ্যারান্টি',
      headline: 'ম্যাজিক লাভ লক কনডম',
      subtitle: 'এই কনডমটি ব্যবহারে পুরুষাঙ্গ ১ থেকে ১.৫ ইঞ্চি পর্যন্ত সুগঠিত দেখায় এবং মিলনের স্থায়িত্ব ৩০ থেকে ৪০ মিনিট পর্যন্ত বৃদ্ধি করতে সহায়তা করে। কম দামি নকল পণ্য এড়িয়ে অরিজিনাল পণ্য কিনুন।',
      videoUrl: '/landing/lovelock-video.mp4',
      videoBadge: 'ভিডিওতে পণ্যের আসল গঠন, লক সিস্টেম এবং নিখুঁত ব্যবহার প্রণালী দেখুন',
      productTitle: 'লাভ লক ম্যাজিক কনডম',
      productTagline: 'বিশেষ সিলিকন লক প্রযুক্তিসম্পন্ন — যা ব্যবহারে আনে দীর্ঘস্থায়ী পরিতৃপ্তি এবং পরম আত্মবিশ্বাস।',
      heroImage: '/landing/banner-product.png',
      packageTitle: 'লাভ লক ম্যাজিকাল কনডম (একক প্যাক)',
      offerPriceText: 'অফার মূল্য মাত্র ৯৯৯ টাকা',
      freeDeliveryText: '(সারা বাংলাদেশে হোম ডেলিভারি সম্পূর্ণ ফ্রি!)',
      benefitsHeading: 'কেন নিবেন এই ম্যাজিক কনডম?',
      benefits: [
        'এটির পুরুত্ব ৬ মিলিমিটার এবং সম্পূর্ণ দৈর্ঘ্য ৬.৭ ইঞ্চি, যা দেয় আরামদায়ক ও প্রাকৃতিক অনুভূতি।',
        'এই প্রিমিয়াম কনডমটি ৭০০ থেকে ৮০০ বার অথবা ১-২ বছর অনায়াসে ওয়াশ করে ব্যবহার করা যায়।',
        'এটি ব্যবহারে মিলনের স্থায়িত্ব স্বাভাবিকের চেয়ে ৩০ থেকে ৪০ মিনিট পর্যন্ত বৃদ্ধি পেতে সাহায্য করে।'
      ],
      usageHeading: 'ব্যবহারের নিয়মাবলী :',
      usageSteps: [
        'ব্যবহারের পূর্বে সামান্য পরিমাণ ওয়াটার-বেসড লুব্রিকেন্ট বা খাঁটি তেল লাগিয়ে নিন।',
        'কনডমের ছিদ্র দিয়ে প্রবেশ করিয়ে নিচের লক সিস্টেমটি সঠিকভাবে সেট করুন যাতে ব্যবহারের সময় পিছলে না যায়।',
        'মিলন শেষে সাধারণ কুসুম গরম পানি ও সাবান দিয়ে পরিষ্কার করে ছায়াযুক্ত স্থানে শুকিয়ে রাখুন।'
      ],
      usageImage: '/landing/usage-guide.jpg',
      usageCaption: 'সহজ লক সিস্টেম — শতভাগ নিরাপদ ফিটিং',
      reviewsBadge: '১,৪০০+ ভেরিফায়েড ক্রেতার সন্তুষ্টি',
      reviewsTitle: 'বাস্তব কাস্টমার অভিজ্ঞতা ও রিভিউ',
      reviews: [
        '/landing/review-1.png',
        '/landing/review-2.png',
        '/landing/review-3.png'
      ],
      guaranteeBadge: 'শতভাগ সন্তুষ্টি ও নিশ্চিন্ত ক্রয়ের অঙ্গীকার',
      guaranteeText: 'আমাদের প্রদর্শিত পণ্যের সাথে প্রাপ্ত পণ্যের মিল না থাকলে এক টাকাও দিতে হবে না, সরাসরি পার্সেল রিটার্ন করতে পারবেন।',
      phone: '09638752122',
      whatsapp: '8801351107157',
      packages: [
        {
          id: 'pkg_1',
          title: 'সাইজ ৬.৭ ইঞ্চি প্রিমিয়াম প্যাক',
          price: 999,
          originalPrice: 1500,
          image: '/landing/package-6-7.jpg',
          popular: true
        }
      ]
    };
    setEditItem(newL);
    setTab('general');
    setMsg('');
    setErr('');
  };

  const saveLanding = async () => {
    if (!editItem) return;
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const isExisting = list.some((x) => x.id === editItem.id);
      const res = isExisting
        ? await aFetch('/landings/' + encodeURIComponent(editItem.id), {
            method: 'PUT',
            body: JSON.stringify(editItem)
          })
        : await aFetch('/landings', {
            method: 'POST',
            body: JSON.stringify(editItem)
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save landing page');
      setMsg('✅ ল্যান্ডিং পেজ সফলভাবে সংরক্ষণ করা হয়েছে!');
      await load();
      setTimeout(() => setMsg(''), 4000);
    } catch (e: any) {
      setErr(e.message || 'Save error');
    } finally {
      setSaving(false);
    }
  };

  const deleteLanding = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      const res = await aFetch('/landings/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete');
      }
      if (editItem && editItem.id === id) {
        setEditItem(null);
      }
      load();
    } catch (e: any) {
      alert(e.message || 'Delete error');
    }
  };

  const copyUrl = (path: string) => {
    const full = window.location.origin + path;
    navigator.clipboard.writeText(full).then(() => {
      alert(`Copied link to clipboard: ${full}`);
    });
  };

  const filteredMedia = mediaLibrary.filter((m: any) => {
    if (!mediaSearch) return true;
    const q = mediaSearch.toLowerCase();
    return (m.name && m.name.toLowerCase().includes(q)) || (m.url && m.url.toLowerCase().includes(q));
  });

  // If in Editor Mode
  if (editItem) {
    const f = editItem;
    const setF = (fn: (prev: any) => any) => setEditItem((prev: any) => fn(prev));

    return (
      <div style={{ paddingBottom: 60 }}>
        {/* Top Header */}
        <div className="sa-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="sa-btn ghost"
              onClick={() => { setEditItem(null); load(); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              ← ব্যাক (Back to List)
            </button>
            <div>
              <h1 style={{ fontSize: 20, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🎯</span>
                <span>{f.title || 'Untitled Landing'}</span>
                <span className={`sa-badge ${f.status === 'live' ? 'b-ok' : 'b-draft'}`} style={{ textTransform: 'uppercase', fontSize: 11 }}>
                  {f.status || 'live'}
                </span>
              </h1>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                Slug: <code>/step/{f.slug}</code> &nbsp;·&nbsp;
                <a href={`/step/${f.slug}`} target="_blank" rel="noreferrer" style={{ color: '#a78bfa', textDecoration: 'none' }}>
                  লাইভ প্রিভিউ দেখুন ↗
                </a>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={f.status || 'live'}
              onChange={(e) => setF((s: any) => ({ ...s, status: e.target.value }))}
              style={{ padding: '7px 12px', background: '#1c192e', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 13 }}
            >
              <option value="live">🟢 Live (সক্রিয়)</option>
              <option value="draft">⚪ Draft (ড্রাফট)</option>
            </select>
            <button
              className="sa-btn primary"
              onClick={saveLanding}
              disabled={saving}
              style={{ minWidth: 140, fontWeight: 600, background: '#8b5cf6', borderColor: '#8b5cf6' }}
            >
              {saving ? 'সংরক্ষণ হচ্ছে...' : '💾 সেভ করুন (Save)'}
            </button>
          </div>
        </div>

        {/* Message / Error Notification */}
        {msg && (
          <div style={{ margin: '14px 0', padding: '12px 16px', background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e', color: '#4ade80', borderRadius: 8, fontWeight: 600 }}>
            {msg}
          </div>
        )}
        {err && (
          <div style={{ margin: '14px 0', padding: '12px 16px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#f87171', borderRadius: 8, fontWeight: 600 }}>
            {err}
          </div>
        )}

        {/* Sub-Tabs Bar */}
        <div style={{ display: 'flex', gap: 4, margin: '16px 0 20px', borderBottom: '1px solid rgba(255,255,255,0.1)', overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { id: 'general', label: '⚙️ সাধারণ (General)' },
            { id: 'hero', label: '🌟 হিরো ও হেডার (Hero)' },
            { id: 'video', label: '🎬 ভিডিও ও অফার (Video & Offer)' },
            { id: 'packages', label: '📦 প্যাকেজ সমূহ (Packages)' },
            { id: 'benefits', label: '⭐ সুবিধাসমূহ (Benefits)' },
            { id: 'usage', label: '📖 নিয়মাবলী (Usage Guide)' },
            { id: 'reviews', label: '💬 রিভিউ (Reviews)' },
            { id: 'guarantee', label: '🛡️ গ্যারান্টি ও যোগাযোগ (Policy)' }
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as any)}
              style={{
                padding: '9px 15px',
                background: tab === t.id ? '#1e1b34' : 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #a855f7' : '2px solid transparent',
                color: tab === t.id ? '#fff' : '#94a3b8',
                fontWeight: tab === t.id ? 600 : 500,
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                whiteSpace: 'nowrap'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: GENERAL SETTINGS */}
        {tab === 'general' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#f8fafc' }}>বেসিক ও পেজ ইনফরমেশন</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  পৃষ্ঠার নাম / Title
                </label>
                <input
                  value={f.title || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, title: e.target.value }))}
                  placeholder="যেমন: ম্যাজিক লাভ লক কনডম"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  URL স্ল্যাগ / Slug (যে লিংকে পেজ ওপেন হবে)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>/step/</span>
                  <input
                    value={f.slug || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, slug: slugify(e.target.value) }))}
                    placeholder="lovelock"
                    style={{ flex: 1, padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  পেজটি <code>/step/{f.slug || 'lovelock'}</code> এবং <code>/page/{f.slug || 'lovelock'}</code> উভয় লিংকেই দেখাবে।
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  বিকল্প স্ল্যাগ / Aliases (কমা দিয়ে আলাদা করুন)
                </label>
                <input
                  value={Array.isArray(f.aliases) ? f.aliases.join(', ') : (f.aliases || '')}
                  onChange={(e) => setF((s: any) => ({
                    ...s,
                    aliases: e.target.value.split(',').map((x: string) => slugify(x)).filter(Boolean)
                  }))}
                  placeholder="love-lock, magic-condom"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  এসব বিকল্প লিংকেও একই ল্যান্ডিং পেজ লোড হবে।
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  পাবলিশ স্ট্যাটাস
                </label>
                <select
                  value={f.status || 'live'}
                  onChange={(e) => setF((s: any) => ({ ...s, status: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                >
                  <option value="live">🟢 লাইভ (Live - দৃশ্যমান)</option>
                  <option value="draft">⚪ ড্রাফট (Draft - অদৃশ্য)</option>
                </select>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '24px 0' }} />

            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#f8fafc' }}>টপ নোটিফিকেশন ও গ্যারান্টি রিবন</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  টপ অ্যানাউন্সমেন্ট ব্যাজ (সবচেয়ে উপরের লাল রঙের স্ট্রিপ)
                </label>
                <input
                  value={f.badgeTop || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, badgeTop: e.target.value }))}
                  placeholder="১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি নিশ্চিত"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  গ্যারান্টি রিবন ব্যাজ (উপরের হলুদ রঙের রিবন)
                </label>
                <input
                  value={f.badgeGuarantee || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, badgeGuarantee: e.target.value }))}
                  placeholder="একমাত্র আমরাই দিচ্ছি ৩ দিনের রিপ্লেসমেন্ট গ্যারান্টি"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HERO & HEADINGS */}
        {tab === 'hero' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#f8fafc' }}>হিরো সেকশন ও প্রডাক্ট ডেসক্রিপশন</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  মূল হেডলাইন (Main Headline)
                </label>
                <input
                  value={f.headline || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, headline: e.target.value }))}
                  placeholder="ম্যাজিক লাভ লক কনডম"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 15, background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  সাবটাইটেল / সংক্ষিপ্ত বর্ণনা (Subtitle)
                </label>
                <textarea
                  rows={3}
                  value={f.subtitle || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, subtitle: e.target.value }))}
                  placeholder="এই কনডমটি ব্যবহারে..."
                  style={{ width: '100%', padding: '10px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    প্রোডাক্টের নাম (Product Title)
                  </label>
                  <input
                    value={f.productTitle || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, productTitle: e.target.value }))}
                    placeholder="লাভ লক ম্যাজিক কনডম"
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    প্রোডাক্ট ট্যাগলাইন (Product Tagline)
                  </label>
                  <input
                    value={f.productTagline || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, productTagline: e.target.value }))}
                    placeholder="বিশেষ সিলিকন লক প্রযুক্তিসম্পন্ন — যা ব্যবহারে আনে দীর্ঘস্থায়ী পরিতৃপ্তি..."
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  হিরো ব্যানার ইমেজ (Hero Banner Image)
                </label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#100e1c', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  {f.heroImage ? (
                    <img src={f.heroImage} alt="Hero Preview" style={{ width: 80, height: 80, objectFit: 'contain', background: '#000', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)' }} />
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 24 }}>🖼️</div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="sa-btn primary"
                        style={{ padding: '7px 14px', fontSize: 12, background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => openMediaPicker('হিরো ব্যানার ইমেজ', f.heroImage || '', (url) => setF((s: any) => ({ ...s, heroImage: url })))}
                      >
                        <span>🖼️ গ্যালারি / মিডিয়া লাইব্রেরি থেকে বেছে নিন</span>
                      </button>
                      <label className="sa-btn ghost" style={{ cursor: 'pointer', whiteSpace: 'nowrap', padding: '7px 12px', fontSize: 12 }}>
                        {uploadingKey === 'heroImage' ? 'আপলোড হচ্ছে...' : '📁 পিসি থেকে ফাইল আপলোড'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(file, (url) => setF((s: any) => ({ ...s, heroImage: url })), 'heroImage');
                          }}
                        />
                      </label>
                      {f.heroImage && (
                        <button className="sa-link danger" type="button" onClick={() => setF((s: any) => ({ ...s, heroImage: '' }))} style={{ fontSize: 12 }}>
                          ছবি সরান
                        </button>
                      )}
                    </div>
                    <input
                      value={f.heroImage || ''}
                      onChange={(e) => setF((s: any) => ({ ...s, heroImage: e.target.value }))}
                      placeholder="/landing/banner-product.png বা ছবির লিংক"
                      style={{ width: '100%', padding: '7px 10px', background: '#090812', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, fontSize: 11 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: VIDEO & OFFER */}
        {tab === 'video' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#f8fafc' }}>ভিডিও প্লেয়ার ও অফার ব্যানার সেটিংস</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  ভিডিও ফাইল URL (Video URL - mp4 অথবা ওয়েব লিংক)
                </label>
                <input
                  value={f.videoUrl || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, videoUrl: e.target.value }))}
                  placeholder="/landing/lovelock-video.mp4"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  লোকাল ফাইল <code>/landing/lovelock-video.mp4</code> অথবা যেকোনো ডাইরেক্ট ভিডিও URL ব্যবহার করতে পারেন।
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  ভিডিওর নিচের ব্যাজ / ক্যাপশন (Video Badge Text)
                </label>
                <input
                  value={f.videoBadge || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, videoBadge: e.target.value }))}
                  placeholder="ভিডিওতে পণ্যের আসল গঠন, লক সিস্টেম এবং নিখুঁত ব্যবহার প্রণালী দেখুন"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '10px 0' }} />

              <h4 style={{ margin: '0 0 10px', fontSize: 14, color: '#f8fafc' }}>রেড অফার বক্স ও ডেলিভারি সেটিংস</h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    অফার প্যাকেজ শিরোনাম (Offer Title)
                  </label>
                  <input
                    value={f.packageTitle || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, packageTitle: e.target.value }))}
                    placeholder="লাভ লক ম্যাজিকাল কনডম (একক প্যাক)"
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    অফার মূল্য টেক্সট (Price Banner Text)
                  </label>
                  <input
                    value={f.offerPriceText || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, offerPriceText: e.target.value }))}
                    placeholder="অফার মূল্য মাত্র ৯৯৯ টাকা"
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    ফ্রি ডেলিভারি টেক্সট (Free Delivery Note)
                  </label>
                  <input
                    value={f.freeDeliveryText || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, freeDeliveryText: e.target.value }))}
                    placeholder="(সারা বাংলাদেশে হোম ডেলিভারি সম্পূর্ণ ফ্রি!)"
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10, padding: 14, background: '#151224', borderRadius: 8, border: '1px solid rgba(139, 92, 246, 0.25)' }}>
                <label className="sa-chk" style={{ cursor: 'pointer', color: '#f8fafc', fontSize: 14, display: 'inline-flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={f.freeDelivery !== false}
                    onChange={(e) => setF((s: any) => ({ ...s, freeDelivery: e.target.checked }))}
                  />
                  &nbsp; <strong>🚚 সারা বাংলাদেশে ফ্রি ডেলিভারি চালু রাখুন (Free Delivery Everywhere - ৳0 Delivery Charge)</strong>
                </label>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, paddingLeft: 22 }}>
                  টিক দেওয়া থাকলে এই ল্যান্ডিং পেজ থেকে অর্ডারের সময় ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০) হিসেবে অর্ডার টেবিলে যুক্ত হবে।
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CHECKOUT PACKAGES */}
        {tab === 'packages' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>চেকআউট প্যাকেজ ও সাইজসমূহ (Selectable Packages)</h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  কাস্টমার অর্ডারের সময় এই প্যাকেজগুলো সিলেক্ট করতে পারবে
                </div>
              </div>
              <button
                type="button"
                className="sa-btn"
                onClick={() => {
                  const newPkg = {
                    id: 'pkg_' + Date.now().toString(36),
                    title: 'নতুন প্যাকেজ / সাইজ',
                    price: 999,
                    originalPrice: 1500,
                    image: '',
                    popular: false
                  };
                  setF((s: any) => ({ ...s, packages: [...(s.packages || []), newPkg] }));
                }}
              >
                + নতুন প্যাকেজ যোগ করুন
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(f.packages || []).map((pkg: any, idx: number) => (
                <div
                  key={pkg.id || idx}
                  style={{
                    padding: 16,
                    background: '#151224',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: '#a78bfa' }}>প্যাকেজ #{idx + 1}</span>
                      {pkg.popular && <span className="sa-badge b-ok">সর্বাধিক জনপ্রিয়</span>}
                    </div>
                    <button
                      type="button"
                      className="sa-link danger"
                      onClick={() => {
                        setF((s: any) => ({
                          ...s,
                          packages: (s.packages || []).filter((_: any, i: number) => i !== idx)
                        }));
                      }}
                    >
                      🗑️ রিমুভ করুন
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                        প্যাকেজের নাম ও বিবরণ (Title)
                      </label>
                      <input
                        value={pkg.title || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setF((s: any) => {
                            const pkgs = [...(s.packages || [])];
                            pkgs[idx] = { ...pkgs[idx], title: val };
                            return { ...s, packages: pkgs };
                          });
                        }}
                        placeholder="যেমন: যাদের পেনিস ৪ ইঞ্চি থেকে ৫.৫ ইঞ্চি তাদের জন্য ৬.৭ দাম"
                        style={{ width: '100%', padding: '8px 10px', background: '#100e1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                        অফার মূল্য (৳ Price)
                      </label>
                      <input
                        type="number"
                        value={pkg.price ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setF((s: any) => {
                            const pkgs = [...(s.packages || [])];
                            pkgs[idx] = { ...pkgs[idx], price: val };
                            return { ...s, packages: pkgs };
                          });
                        }}
                        placeholder="999"
                        style={{ width: '100%', padding: '8px 10px', background: '#100e1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                        পূর্বের মূল্য (৳ Original Price)
                      </label>
                      <input
                        type="number"
                        value={pkg.originalPrice ?? ''}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setF((s: any) => {
                            const pkgs = [...(s.packages || [])];
                            pkgs[idx] = { ...pkgs[idx], originalPrice: val };
                            return { ...s, packages: pkgs };
                          });
                        }}
                        placeholder="1500"
                        style={{ width: '100%', padding: '8px 10px', background: '#100e1a', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: 18 }}>
                      <label className="sa-chk" style={{ cursor: 'pointer', color: '#e2e8f0', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={!!pkg.popular}
                          onChange={(e) => {
                            const chk = e.target.checked;
                            setF((s: any) => {
                              const pkgs = [...(s.packages || [])];
                              pkgs[idx] = { ...pkgs[idx], popular: chk };
                              return { ...s, packages: pkgs };
                            });
                          }}
                        />
                        &nbsp; "সর্বাধিক জনপ্রিয়" ব্যাজ দিন
                      </label>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                      প্যাকেজের ছবি (Package Photo)
                    </label>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#100e1c', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                      {pkg.image ? (
                        <img
                          src={pkg.image}
                          alt="Pkg"
                          style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: '#000' }}
                        />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 20 }}>
                          🖼️
                        </div>
                      )}

                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="sa-btn primary"
                            style={{ padding: '6px 14px', fontSize: 12, background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            onClick={() => {
                              openMediaPicker(
                                `প্যাকেজ #${idx + 1} (${pkg.title || 'প্যাকেজ'})`,
                                pkg.image || '',
                                (url) => {
                                  setF((s: any) => {
                                    const pkgs = [...(s.packages || [])];
                                    pkgs[idx] = { ...pkgs[idx], image: url };
                                    return { ...s, packages: pkgs };
                                  });
                                }
                              );
                            }}
                          >
                            <span>🖼️ গ্যালারি / মিডিয়া লাইব্রেরি থেকে বেছে নিন</span>
                          </button>

                          <label className="sa-btn ghost" style={{ cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 12px', fontSize: 12 }}>
                            {uploadingKey === `pkg_${idx}` ? 'আপলোড হচ্ছে...' : '📁 পিসি থেকে ফাইল আপলোড'}
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  uploadFile(file, (url) => {
                                    setF((s: any) => {
                                      const pkgs = [...(s.packages || [])];
                                      pkgs[idx] = { ...pkgs[idx], image: url };
                                      return { ...s, packages: pkgs };
                                    });
                                  }, `pkg_${idx}`);
                                }
                              }}
                            />
                          </label>

                          {pkg.image && (
                            <button
                              type="button"
                              className="sa-link danger"
                              style={{ fontSize: 12 }}
                              onClick={() => {
                                setF((s: any) => {
                                  const pkgs = [...(s.packages || [])];
                                  pkgs[idx] = { ...pkgs[idx], image: '' };
                                  return { ...s, packages: pkgs };
                                });
                              }}
                            >
                              ছবি সরান
                            </button>
                          )}
                        </div>

                        <input
                          value={pkg.image || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setF((s: any) => {
                              const pkgs = [...(s.packages || [])];
                              pkgs[idx] = { ...pkgs[idx], image: val };
                              return { ...s, packages: pkgs };
                            });
                          }}
                          placeholder="বা ছবির URL (যেমন: /landing/package-6-7.jpg)"
                          style={{ width: '100%', padding: '6px 10px', background: '#090812', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, fontSize: 11 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {(!f.packages || f.packages.length === 0) && (
                <div className="sa-empty">কোনো প্যাকেজ এখনো যোগ করা হয়নি।</div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: BENEFITS */}
        {tab === 'benefits' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>পণ্যের সুবিধাসমূহ (Key Benefits)</h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  ল্যান্ডিং পেজে টিক চিহ্ন সহ প্রদর্শিত পয়েন্টসমূহ
                </div>
              </div>
              <button
                type="button"
                className="sa-btn"
                onClick={() => {
                  setF((s: any) => ({ ...s, benefits: [...(s.benefits || []), ''] }));
                }}
              >
                + নতুন সুবিধা যোগ করুন
              </button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                সেকশন শিরোনাম (Benefits Heading)
              </label>
              <input
                value={f.benefitsHeading || ''}
                onChange={(e) => setF((s: any) => ({ ...s, benefitsHeading: e.target.value }))}
                placeholder="কেন নিবেন এই ম্যাজিক কনডম?"
                style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(f.benefits || []).map((b: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14 }}>✓</span>
                  <input
                    value={b}
                    onChange={(e) => {
                      const val = e.target.value;
                      setF((s: any) => {
                        const next = [...(s.benefits || [])];
                        next[idx] = val;
                        return { ...s, benefits: next };
                      });
                    }}
                    placeholder={`সুবিধা পয়েন্ট #${idx + 1}`}
                    style={{ flex: 1, padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                  <button
                    type="button"
                    className="sa-link danger"
                    onClick={() => {
                      setF((s: any) => ({
                        ...s,
                        benefits: (s.benefits || []).filter((_: any, i: number) => i !== idx)
                      }));
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: USAGE GUIDE */}
        {tab === 'usage' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>ব্যবহারের নিয়মাবলী (Usage Instructions)</h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  ধাপ অনুসারে সঠিক ব্যবহারের নির্দেশিকা
                </div>
              </div>
              <button
                type="button"
                className="sa-btn"
                onClick={() => {
                  setF((s: any) => ({ ...s, usageSteps: [...(s.usageSteps || []), ''] }));
                }}
              >
                + নতুন ধাপ যোগ করুন
              </button>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                সেকশন শিরোনাম (Usage Heading)
              </label>
              <input
                value={f.usageHeading || ''}
                onChange={(e) => setF((s: any) => ({ ...s, usageHeading: e.target.value }))}
                placeholder="ব্যবহারের নিয়মাবলী :"
                style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {(f.usageSteps || []).map((step: string, idx: number) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ background: '#7c3aed', color: '#fff', width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {idx + 1}
                  </span>
                  <input
                    value={step}
                    onChange={(e) => {
                      const val = e.target.value;
                      setF((s: any) => {
                        const next = [...(s.usageSteps || [])];
                        next[idx] = val;
                        return { ...s, usageSteps: next };
                      });
                    }}
                    placeholder={`ব্যবহারের ধাপ #${idx + 1}`}
                    style={{ flex: 1, padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                  <button
                    type="button"
                    className="sa-link danger"
                    onClick={() => {
                      setF((s: any) => ({
                        ...s,
                        usageSteps: (s.usageSteps || []).filter((_: any, i: number) => i !== idx)
                      }));
                    }}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '20px 0' }} />

            <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#f8fafc' }}>ব্যবহারের নির্দেশিকা ছবি ও ক্যাপশন</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  নির্দেশিকা ছবি (Usage Image)
                </label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#100e1c', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                  {f.usageImage ? (
                    <img src={f.usageImage} alt="Usage Preview" style={{ width: 80, height: 80, objectFit: 'contain', background: '#000', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)' }} />
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 24 }}>🖼️</div>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="sa-btn primary"
                        style={{ padding: '7px 14px', fontSize: 12, background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        onClick={() => openMediaPicker('ব্যবহারের নির্দেশিকা ছবি', f.usageImage || '', (url) => setF((s: any) => ({ ...s, usageImage: url })))}
                      >
                        <span>🖼️ গ্যালারি / মিডিয়া লাইব্রেরি থেকে বেছে নিন</span>
                      </button>
                      <label className="sa-btn ghost" style={{ cursor: 'pointer', whiteSpace: 'nowrap', padding: '7px 12px', fontSize: 12 }}>
                        {uploadingKey === 'usageImg' ? 'আপলোড হচ্ছে...' : '📁 পিসি থেকে ফাইল আপলোড'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(file, (url) => setF((s: any) => ({ ...s, usageImage: url })), 'usageImg');
                          }}
                        />
                      </label>
                      {f.usageImage && (
                        <button className="sa-link danger" type="button" onClick={() => setF((s: any) => ({ ...s, usageImage: '' }))} style={{ fontSize: 12 }}>
                          ছবি সরান
                        </button>
                      )}
                    </div>
                    <input
                      value={f.usageImage || ''}
                      onChange={(e) => setF((s: any) => ({ ...s, usageImage: e.target.value }))}
                      placeholder="/landing/usage-guide.jpg বা ছবির লিংক"
                      style={{ width: '100%', padding: '7px 10px', background: '#090812', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, fontSize: 11 }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  ছবির ক্যাপশন (Usage Image Caption)
                </label>
                <input
                  value={f.usageCaption || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, usageCaption: e.target.value }))}
                  placeholder="সহজ লক সিস্টেম — শতভাগ নিরাপদ ফিটিং"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: REVIEWS */}
        {tab === 'reviews' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>কাস্টমার রিভিউ ছবি সমূহ (Review Screenshots)</h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                  হোয়াটসঅ্যাপ বা ইনবক্স রিভিউ স্ক্রিনশট গ্যালারি
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="sa-btn primary"
                  style={{ background: '#7c3aed', borderColor: '#7c3aed', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => {
                    openMediaPicker('নতুন রিভিউ ছবি', '', (url) => {
                      setF((s: any) => ({ ...s, reviews: [...(s.reviews || []), url] }));
                    });
                  }}
                >
                  <span>🖼️ মিডিয়া লাইব্রেরি থেকে যোগ করুন</span>
                </button>
                <label className="sa-btn ghost" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {uploadingKey === 'newReview' ? 'আপলোড হচ্ছে...' : '📁 পিসি থেকে নতুন আপলোড'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        uploadFile(file, (url) => {
                          setF((s: any) => ({ ...s, reviews: [...(s.reviews || []), url] }));
                        }, 'newReview');
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  রিভিউ ব্যাজ টেক্সট (Reviews Badge)
                </label>
                <input
                  value={f.reviewsBadge || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, reviewsBadge: e.target.value }))}
                  placeholder="১,৪০০+ ভেরিফায়েড ক্রেতার সন্তুষ্টি"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  রিভিউ সেকশন শিরোনাম (Reviews Title)
                </label>
                <input
                  value={f.reviewsTitle || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, reviewsTitle: e.target.value }))}
                  placeholder="বাস্তব কাস্টমার অভিজ্ঞতা ও রিভিউ"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
              {(f.reviews || []).map((revUrl: string, idx: number) => (
                <div
                  key={idx}
                  style={{
                    background: '#151224',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <img
                    src={revUrl}
                    alt={`Review ${idx + 1}`}
                    style={{ width: '100%', height: 160, objectFit: 'cover', background: '#000' }}
                  />
                  <div style={{ padding: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>#{idx + 1}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="sa-link"
                        style={{ fontSize: 11, color: '#a78bfa' }}
                        onClick={() => {
                          openMediaPicker(`রিভিউ #${idx + 1}`, revUrl, (url) => {
                            setF((s: any) => {
                              const revs = [...(s.reviews || [])];
                              revs[idx] = url;
                              return { ...s, reviews: revs };
                            });
                          });
                        }}
                      >
                        বদলান
                      </button>
                      <button
                        type="button"
                        className="sa-link danger"
                        style={{ fontSize: 11 }}
                        onClick={() => {
                          setF((s: any) => ({
                            ...s,
                            reviews: (s.reviews || []).filter((_: any, i: number) => i !== idx)
                          }));
                        }}
                      >
                        মুছুন
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 8: GUARANTEE & CONTACT */}
        {tab === 'guarantee' && (
          <div className="sa-card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: '#f8fafc' }}>গ্যারান্টি পলিসি ও জরুরি যোগাযোগ</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  গ্যারান্টি ব্যাজ (Guarantee Badge Heading)
                </label>
                <input
                  value={f.guaranteeBadge || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, guaranteeBadge: e.target.value }))}
                  placeholder="শতভাগ সন্তুষ্টি ও নিশ্চিন্ত ক্রয়ের অঙ্গীকার"
                  style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                  রিটার্ন পলিসি ও গ্যারান্টি বিবরণ (Guarantee Full Text)
                </label>
                <textarea
                  rows={4}
                  value={f.guaranteeText || ''}
                  onChange={(e) => setF((s: any) => ({ ...s, guaranteeText: e.target.value }))}
                  placeholder="আমাদের প্রদর্শিত পণ্যের সাথে প্রাপ্ত পণ্যের মিল না থাকলে এক টাকাও দিতে হবে না..."
                  style={{ width: '100%', padding: '10px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, lineHeight: 1.5 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    📞 সরাসরি ফোন নম্বর (Direct Call Phone Number)
                  </label>
                  <input
                    value={f.phone || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, phone: e.target.value }))}
                    placeholder="09638752122"
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    ল্যান্ডিং পেজের "সরাসরি কল করতে পারেন" বাটনে এই নম্বরে কল যাবে।
                  </div>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>
                    <WhatsAppIcon size={16} variant="official" />
                    <span>হোয়াটসঅ্যাপ নম্বর (WhatsApp Number with Country Code)</span>
                  </label>
                  <input
                    value={f.whatsapp || ''}
                    onChange={(e) => setF((s: any) => ({ ...s, whatsapp: e.target.value }))}
                    placeholder="8801351107157"
                    style={{ width: '100%', padding: '9px 12px', background: '#13111f', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
                  />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    কান্ট্রি কোড সহ (যেমন 8801...) দিলে সরাসরি WhatsApp চ্যাটে যাবে।
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Save Bar */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
          <button className="sa-btn ghost" onClick={() => { setEditItem(null); load(); }}>
            বাতিল (Cancel)
          </button>
          <button
            className="sa-btn primary"
            onClick={saveLanding}
            disabled={saving}
            style={{ minWidth: 160, fontWeight: 600, background: '#8b5cf6', borderColor: '#8b5cf6' }}
          >
            {saving ? 'সংরক্ষণ হচ্ছে...' : '💾 সেভ করুন (Save Changes)'}
          </button>
        </div>

        {/* MEDIA LIBRARY PICKER MODAL */}
        {mediaPickerTarget && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.82)',
              backdropFilter: 'blur(5px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16
            }}
            onClick={() => setMediaPickerTarget(null)}
          >
            <div
              style={{
                width: 'min(920px, 98%)',
                maxHeight: '90vh',
                background: '#161326',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 14,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
                overflow: 'hidden'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#120f20' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 17, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>🖼️</span>
                    <span>মিডিয়া লাইব্রেরি থেকে ছবি সিলেক্ট করুন</span>
                  </h3>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                    <strong>{mediaPickerTarget.title}</strong> এর জন্য ছবি বেছে নিন
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMediaPickerTarget(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>

              {/* Top Action / Search Bar */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, alignItems: 'center', background: '#151224', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input
                    value={mediaSearch}
                    onChange={(e) => setMediaSearch(e.target.value)}
                    placeholder="🔍 ছবির নাম দিয়ে ফিল্টার করুন (Filter images)..."
                    style={{ width: '100%', padding: '8px 12px', background: '#0e0c18', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: '#fff', fontSize: 13 }}
                  />
                </div>
                <label className="sa-btn primary" style={{ cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#7c3aed', borderColor: '#7c3aed' }}>
                  <span>📁 পিসি থেকে নতুন আপলোড</span>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        uploadFile(file, (url) => {
                          setMediaLibrary((prev) => [{ url, name: file.name, category: 'upload' }, ...prev]);
                          setSelectedModalImg(url);
                        }, 'modalUpload');
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="sa-btn ghost"
                  onClick={loadMediaLibrary}
                  style={{ padding: '8px 12px' }}
                >
                  🔄 রিফ্রেশ
                </button>
              </div>

              {/* Gallery Grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, minHeight: 320, maxHeight: '55vh' }}>
                {mediaLoading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>ছবি লোড হচ্ছে...</div>}

                {!mediaLoading && (
                  <>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                      মোট {filteredMedia.length} টি ছবি পাওয়া গেছে (সিলেক্ট করতে যেকোনো ছবির উপর ক্লিক করুন):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 14 }}>
                      {filteredMedia.map((m: any, idx: number) => {
                        const isSelected = selectedModalImg === m.url;
                        return (
                          <div
                            key={m.url || idx}
                            onClick={() => setSelectedModalImg(m.url)}
                            onDoubleClick={() => {
                              mediaPickerTarget.onSelect(m.url);
                              setMediaPickerTarget(null);
                            }}
                            style={{
                              position: 'relative',
                              cursor: 'pointer',
                              borderRadius: 8,
                              overflow: 'hidden',
                              border: isSelected ? '2px solid #a855f7' : '1px solid rgba(255,255,255,0.1)',
                              background: '#0d0b17',
                              boxShadow: isSelected ? '0 0 12px rgba(168,85,247,0.5)' : 'none',
                              transition: 'all 0.15s'
                            }}
                          >
                            <div style={{ width: '100%', height: 110, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={m.url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            <div style={{ padding: '6px 8px', fontSize: 11, color: isSelected ? '#a855f7' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: isSelected ? 700 : 400 }}>
                              {m.name || m.url}
                            </div>
                            {isSelected && (
                              <div style={{ position: 'absolute', top: 6, right: 6, background: '#a855f7', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
                                ✓
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#120f20', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {selectedModalImg ? (
                    <>
                      <img src={selectedModalImg} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, border: '1px solid #a855f7' }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>সিলেক্টেড ছবি:</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedModalImg}</div>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>যেকোনো একটি ছবি সিলেক্ট করুন</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="sa-btn ghost" onClick={() => setMediaPickerTarget(null)}>
                    বাতিল (Cancel)
                  </button>
                  <button
                    type="button"
                    className="sa-btn primary"
                    disabled={!selectedModalImg}
                    onClick={() => {
                      if (selectedModalImg) {
                        mediaPickerTarget.onSelect(selectedModalImg);
                        setMediaPickerTarget(null);
                      }
                    }}
                    style={{ background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 600, minWidth: 140 }}
                  >
                    ✓ সিলেক্ট করুন (Apply)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List View
  return (
    <>
      <div className="sa-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>🎯</span>
            <span>Landing Pages (ল্যান্ডিং পেজসমূহ)</span>
          </h1>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            উচ্চ কনভার্সন যুক্ত একক প্রোডাক্টের ল্যান্ডিং পেজ তৈরি ও সম্পূর্ণ নিয়ন্ত্রণ করুন
          </div>
        </div>
        <button
          className="sa-btn primary"
          onClick={createNewLanding}
          style={{ background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 600 }}
        >
          + নতুন ল্যান্ডিং পেজ তৈরি করুন
        </button>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>লোড হচ্ছে...</div>}

      {!loading && (
        <div className="sa-card" style={{ marginTop: 16 }}>
          <table className="sa-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>ছবি</th>
                <th>শিরোনাম ও স্ল্যাগ</th>
                <th>লাইভ লিংকসমূহ</th>
                <th>প্যাকেজ</th>
                <th>স্ট্যাটাস</th>
                <th className="r">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id || item.slug}>
                  <td>
                    <img
                      src={item.heroImage || '/landing/banner-product.png'}
                      alt=""
                      style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, background: '#151224', border: '1px solid rgba(255,255,255,0.08)' }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 14 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#a78bfa' }}>
                      Slug: <code>{item.slug}</code>
                      {Array.isArray(item.aliases) && item.aliases.length > 0 && (
                        <span style={{ color: '#64748b' }}> ({item.aliases.join(', ')})</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <a
                          href={`/step/${item.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: '#38bdf8', textDecoration: 'none' }}
                        >
                          /step/{item.slug} ↗
                        </a>
                        <button
                          className="sa-link"
                          style={{ fontSize: 11 }}
                          onClick={() => copyUrl(`/step/${item.slug}`)}
                        >
                          Copy
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <a
                          href={`/page/${item.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}
                        >
                          /page/{item.slug} ↗
                        </a>
                        <button
                          className="sa-link"
                          style={{ fontSize: 11 }}
                          onClick={() => copyUrl(`/page/${item.slug}`)}
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                      {(item.packages || []).length} টি প্যাকেজ
                    </div>
                    <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
                      {item.offerPriceText || '৳ ৯৯৯'}
                    </div>
                  </td>
                  <td>
                    <span className={`sa-badge ${item.status === 'live' ? 'b-ok' : 'b-draft'}`}>
                      {item.status === 'live' ? 'Live' : 'Draft'}
                    </span>
                  </td>
                  <td className="r">
                    <button
                      className="sa-btn ghost"
                      style={{ marginRight: 8, padding: '4px 10px', fontSize: 12 }}
                      onClick={() => {
                        setEditItem(JSON.parse(JSON.stringify(item)));
                        setTab('general');
                      }}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="sa-link danger"
                      style={{ fontSize: 12 }}
                      onClick={() => deleteLanding(item.id, item.title)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && (
            <div className="sa-empty" style={{ padding: 40, textAlign: 'center' }}>
              কোনো ল্যান্ডিং পেজ পাওয়া যায়নি। নতুন একটি তৈরি করতে উপরের বাটনে চাপুন।
            </div>
          )}
        </div>
      )}
    </>
  );
}

function MediaAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'used' | 'unused' | 'duplicate' | 'broken'>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [inspecting, setInspecting] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [msg, setMsg] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    return aFetch('/admin/media')
      .then((r) => r.json())
      .then((d) => {
        setList(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const kb = (b: number) => {
    if (!b || b <= 0) return '0 KB';
    if (b > 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return Math.round(b / 1024) + ' KB';
  };

  const copy = (url: string) => {
    try { navigator.clipboard.writeText(location.origin + url); } catch {}
    setMsg('URL copied to clipboard ✓');
    setTimeout(() => setMsg(''), 2000);
  };

  // Client-side auto-compress to modern WebP / SVG (max 100KB)
  const compressImage = async (file: File): Promise<string> => {
    return processImageToWebpOrSvg(file);
  };

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    setUploading(true);
    let done = 0;
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      setUploadProgress(`Optimizing & uploading ${i + 1} of ${arr.length} (${f.name})…`);
      try {
        const dataUrl = await compressImage(f);
        const r = await aFetch('/upload', { method: 'POST', body: JSON.stringify({ dataUrl }) }).then((x) => x.json());
        if (r.url) done++;
      } catch {}
    }
    setUploading(false);
    setUploadProgress('');
    setMsg(`Uploaded & compressed ${done} image${done > 1 ? 's' : ''} ✓`);
    setTimeout(() => setMsg(''), 3000);
    load();
  };

  const del = async (name: string) => {
    if (!confirm(`Delete "${name}" permanently?`)) return;
    await aFetch('/admin/media/' + name, { method: 'DELETE' });
    if (inspecting?.name === name) setInspecting(null);
    load();
  };

  const deleteSelected = async () => {
    const names = Object.keys(selected).filter((k) => selected[k]);
    if (!names.length) return;
    if (!confirm(`Permanently delete ${names.length} selected files?`)) return;
    await aFetch('/admin/media/bulk-delete', { method: 'POST', body: JSON.stringify({ names }) });
    setSelected({});
    if (inspecting && names.includes(inspecting.name)) setInspecting(null);
    load();
    setMsg(`Deleted ${names.length} files ✓`);
    setTimeout(() => setMsg(''), 2500);
  };

  const cleanDuplicates = async () => {
    if (!confirm('Clean unused duplicate images? The oldest original image will be preserved.')) return;
    const r = await aFetch('/admin/media/clean-duplicates', { method: 'POST' }).then((x) => x.json());
    load();
    setMsg(`Cleaned ${r.deleted || 0} duplicate images ✓`);
    setTimeout(() => setMsg(''), 2500);
  };

  const cleanBroken = async () => {
    if (!confirm('Remove broken (0 KB) files from the server?')) return;
    const r = await aFetch('/admin/media/clean-broken', { method: 'POST' }).then((x) => x.json());
    load();
    setMsg(`Removed ${r.deleted || 0} broken files ✓`);
    setTimeout(() => setMsg(''), 2500);
  };

  // Stats calculation
  const totalBytes = useMemo(() => list.reduce((s, m) => s + (m.size || 0), 0), [list]);
  const usedCount = useMemo(() => list.filter((m) => m.usedCount > 0).length, [list]);
  const unusedCount = useMemo(() => list.filter((m) => !m.usedCount && !m.isBroken).length, [list]);
  const dupCount = useMemo(() => list.filter((m) => m.isDuplicate).length, [list]);
  const brokenCount = useMemo(() => list.filter((m) => m.isBroken).length, [list]);

  // Filtering
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return list.filter((m) => {
      if (filter === 'used' && !m.usedCount) return false;
      if (filter === 'unused' && (m.usedCount > 0 || m.isBroken)) return false;
      if (filter === 'duplicate' && !m.isDuplicate) return false;
      if (filter === 'broken' && !m.isBroken) return false;
      if (query) {
        const inName = m.name.toLowerCase().includes(query);
        const inUsed = (m.usedIn || []).some((u: any) => (u.title || '').toLowerCase().includes(query));
        if (!inName && !inUsed) return false;
      }
      return true;
    });
  }, [list, filter, q]);

  const selectedCount = Object.keys(selected).filter((k) => selected[k]).length;
  const allChecked = shown.length > 0 && shown.every((m) => selected[m.name]);
  const toggleAll = () => {
    const next = { ...selected };
    if (allChecked) shown.forEach((m) => delete next[m.name]);
    else shown.forEach((m) => { next[m.name] = true; });
    setSelected(next);
  };

  return (
    <>
      <div className="sa-top">
        <h1>Media Library</h1>
        <div className="sa-toprow">
          <input
            className="sa-search"
            placeholder="Search filenames or used products…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="sa-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : 'Upload Images'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
          />
        </div>
      </div>

      {msg && (
        <div className="sa-card" style={{ padding: '10px 16px', marginBottom: 14, color: '#34d399', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
          {msg}
        </div>
      )}

      {/* Top summary stats & bulk clean buttons */}
      <div className="media-top-stats">
        <span className="media-stat-chip">Total Files <b>{list.length}</b></span>
        <span className="media-stat-chip">Storage Used <b>{kb(totalBytes)}</b></span>
        <span className="media-stat-chip">In Use <b>{usedCount}</b></span>
        <span className="media-stat-chip">Unused <b>{unusedCount}</b></span>
        {dupCount > 0 && (
          <button className="sa-btn ghost sa-mini" style={{ color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }} onClick={cleanDuplicates}>
            🧹 Clean {dupCount} Duplicates
          </button>
        )}
        {brokenCount > 0 && (
          <button className="sa-btn ghost sa-mini" style={{ color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }} onClick={cleanBroken}>
            🗑️ Remove {brokenCount} Broken (0 KB)
          </button>
        )}
      </div>

      {/* Filter Tabs & Bulk Selection Row */}
      <div className="sa-toolbar">
        <div className="sa-filters">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All {list.length}</button>
          <button className={filter === 'used' ? 'on' : ''} onClick={() => setFilter('used')}>Used in Store {usedCount}</button>
          <button className={filter === 'unused' ? 'on' : ''} onClick={() => setFilter('unused')}>Unused {unusedCount}</button>
          {dupCount > 0 && (
            <button className={filter === 'duplicate' ? 'on' : ''} onClick={() => setFilter('duplicate')}>Duplicates {dupCount}</button>
          )}
          {brokenCount > 0 && (
            <button className={filter === 'broken' ? 'on' : ''} onClick={() => setFilter('broken')}>Broken {brokenCount}</button>
          )}
        </div>
        {selectedCount > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="dim small">{selectedCount} selected</span>
            <button className="sa-btn ghost sa-mini danger" onClick={deleteSelected}>Delete Selected</button>
            <button className="sa-btn ghost sa-mini" onClick={() => setSelected({})}>Clear</button>
          </div>
        )}
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        className={'media-dropzone' + (isDragging ? ' active' : '')}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="media-dropzone-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div className="media-dropzone-title">
          {uploading ? (uploadProgress || 'Uploading images…') : 'Drag & drop images here to upload in bulk, or click to browse'}
        </div>
        <div className="media-dropzone-sub">
          Auto-converts to optimized WebP format · Supports JPEG, PNG, WebP, GIF
        </div>
      </div>

      {/* Media Grid */}
      <div className="mediagrid">
        {shown.map((m) => {
          const isSel = !!selected[m.name];
          return (
            <div className={'mediacard' + (isSel ? ' is-selected' : '')} key={m.name}>
              {/* Checkbox and Status Badges */}
              <div className="mediacard-top-actions">
                <input
                  type="checkbox"
                  className="mediacard-check"
                  checked={isSel}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [m.name]: e.target.checked }))}
                />
                <div className="media-badge-group">
                  {m.usedCount > 0 ? (
                    <span className="media-badge-pill media-badge-used" title={`Used in: ${m.usedIn.map((x: any) => x.title).join(', ')}`}>
                      In Use ({m.usedCount})
                    </span>
                  ) : m.isBroken ? (
                    <span className="media-badge-pill media-badge-broken">Broken 0 KB</span>
                  ) : m.isDuplicate ? (
                    <span className="media-badge-pill media-badge-dup">Duplicate</span>
                  ) : (
                    <span className="media-badge-pill media-badge-unused">Unused</span>
                  )}
                </div>
              </div>

              {/* Thumbnail */}
              <div className="mediathumb" onClick={() => setInspecting(m)} title="Click to view details">
                {m.isBroken ? (
                  <div className="mediathumb-broken">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 24, height: 24 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>Corrupted file</span>
                  </div>
                ) : (
                  <img src={m.url} alt={m.name} loading="lazy" />
                )}
              </div>

              {/* Info & Action Buttons */}
              <div className="mediainfo">
                <div className="mediainfo-row">
                  <span className="dim small">{kb(m.size)}</span>
                  <div className="mediaacts">
                    <button className="sa-link" onClick={() => copy(m.url)} title="Copy URL">Copy</button>
                    <button className="sa-link danger" onClick={() => del(m.name)} title="Delete image">Delete</button>
                  </div>
                </div>
                <div className="mediainfo-name" title={m.name}>{m.name}</div>
              </div>
            </div>
          );
        })}
      </div>

      {loading && <div className="sa-empty">Loading media library…</div>}
      {!loading && shown.length === 0 && (
        <div className="sa-card" style={{ marginTop: 16 }}>
          <div className="sa-empty">
            {q || filter !== 'all' ? 'No media files match your filter.' : 'No uploaded media yet. Drag & drop images above to start.'}
          </div>
        </div>
      )}

      {/* Inspector / Detail Modal */}
      {inspecting && (
        <div className="media-inspect-modal" onClick={() => setInspecting(null)}>
          <div className="media-inspect-card" onClick={(e) => e.stopPropagation()}>
            <div className="media-inspect-head">
              <h3>Image Details</h3>
              <button className="sa-om-close" onClick={() => setInspecting(null)}>×</button>
            </div>
            <div className="media-inspect-body">
              <div className="media-inspect-preview">
                {inspecting.isBroken ? (
                  <div className="mediathumb-broken">
                    <span>Corrupted 0 KB File</span>
                  </div>
                ) : (
                  <img src={inspecting.url} alt={inspecting.name} />
                )}
              </div>
              <div className="media-inspect-details">
                <div className="media-inspect-field">
                  <label>File Name</label>
                  <div className="val mono">{inspecting.name}</div>
                </div>
                <div className="media-inspect-field">
                  <label>File Size</label>
                  <div className="val">{kb(inspecting.size)} ({inspecting.size.toLocaleString()} bytes)</div>
                </div>
                <div className="media-inspect-field">
                  <label>Uploaded Date</label>
                  <div className="val">{new Date(inspecting.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </div>
                <div className="media-inspect-field">
                  <label>Public Link</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input readOnly value={location.origin + inspecting.url} style={{ flex: 1, fontSize: 12, padding: '5px 8px' }} />
                    <button className="sa-btn sa-mini" onClick={() => copy(inspecting.url)}>Copy</button>
                  </div>
                </div>

                <div className="media-inspect-field">
                  <label>Store Usage Status</label>
                  {inspecting.usedCount > 0 ? (
                    <div>
                      <span className="media-badge-pill media-badge-used" style={{ display: 'inline-block', marginBottom: 6 }}>
                        Used in {inspecting.usedCount} location{inspecting.usedCount > 1 ? 's' : ''}
                      </span>
                      <div className="media-used-tags">
                        {inspecting.usedIn.map((u: any, idx: number) => (
                          <span className="media-used-pill" key={idx}>
                            {u.type}: {u.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : inspecting.isBroken ? (
                    <span className="media-badge-pill media-badge-broken">Broken file (0 bytes)</span>
                  ) : (
                    <div style={{ color: '#94a3b8', fontSize: 12.5 }}>
                      Not currently used in any products or landing pages. Safe to delete.
                    </div>
                  )}
                </div>

                {inspecting.isDuplicate && (
                  <div className="sa-card" style={{ padding: 10, background: 'rgba(245, 158, 11, 0.08)', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#fbbf24', fontSize: 12 }}>
                    ⚠️ This file is an exact duplicate of another uploaded image.
                  </div>
                )}
              </div>
            </div>
            <div className="media-inspect-foot">
              <button className="sa-btn ghost danger" onClick={() => del(inspecting.name)}>
                Delete Image
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="sa-btn ghost" href={inspecting.url} download={inspecting.name} target="_blank" rel="noreferrer">
                  Download
                </a>
                <button className="sa-btn" onClick={() => setInspecting(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScannerAdmin() {
  const [mode, setMode] = useState<'ship' | 'return' | 'lookup'>('ship');
  const [courierBatch, setCourierBatch] = useState<string>(() => {
    try {
      return localStorage.getItem('dot_scanner_courier') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [activeCouriers, setActiveCouriers] = useState<string[]>([]);

  useEffect(() => {
    aFetch('/admin/integrations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d?.couriers || [])
          .filter((c: any) => c.enabled)
          .map((c: any) => c.label || c.provider)
          .filter(Boolean);
        setActiveCouriers(list);
      })
      .catch(() => {});
  }, []);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [camError, setCamError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [inputVal, setInputVal] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = sessionStorage.getItem('dot_scan_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const gunInputRef = useRef<HTMLInputElement>(null);

  const playSound = (type: 'success' | 'return' | 'error') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      } else if (type === 'return') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
        osc.start();
        osc.stop(ctx.currentTime + 0.28);
      }
    } catch {}
  };

  const cleanCode = (raw: string) => {
    let s = String(raw || '').trim();
    try {
      if (s.includes('http://') || s.includes('https://')) {
        const url = new URL(s);
        const id = url.searchParams.get('id') || url.searchParams.get('order');
        if (id) return id.trim();
      }
    } catch {}
    const m = s.match(/(DOT-[A-Za-z0-9-]+)/i);
    if (m) return m[1];
    return s;
  };

  const executeScan = async (codeStr: string, activeMode = mode) => {
    const code = cleanCode(codeStr);
    if (!code || processing) return;
    setProcessing(true);
    setCamError('');

    try {
      const res = await aFetch('/scanner/scan', {
        method: 'POST',
        body: JSON.stringify({ code, mode: activeMode, courierName: courierBatch }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        playSound('error');
        const errObj = { ok: false, error: data.error || 'Scan failed', code, mode: activeMode };
        setLastResult(errObj);
        setHistory((prev) => {
          const updated = [
            { id: Date.now(), time: new Date().toLocaleTimeString(), code, mode: activeMode, ok: false, error: data.error },
            ...prev.slice(0, 49),
          ];
          try { sessionStorage.setItem('dot_scan_history', JSON.stringify(updated)); } catch {}
          return updated;
        });
      } else {
        if (activeMode === 'return') playSound('return');
        else playSound('success');
        const successObj = { ok: true, data, code, mode: activeMode };
        setLastResult(successObj);
        setHistory((prev) => {
          const updated = [
            {
              id: Date.now(),
              time: new Date().toLocaleTimeString(),
              code,
              mode: activeMode,
              ok: true,
              orderId: data.order?.id,
              customer: data.order?.customer?.name,
              phone: data.order?.customer?.phone,
              total: data.order?.total,
              action: data.action,
              courier: data.courier || data.order?.courier?.name,
            },
            ...prev.slice(0, 49),
          ];
          try { sessionStorage.setItem('dot_scan_history', JSON.stringify(updated)); } catch {}
          return updated;
        });
      }
    } catch (err: any) {
      playSound('error');
      setLastResult({ ok: false, error: err.message || 'Connection error', code, mode: activeMode });
    } finally {
      setProcessing(false);
      if (gunInputRef.current) gunInputRef.current.focus();
    }
  };

  const handleCameraScan = (decodedText: string) => {
    const code = cleanCode(decodedText);
    const now = Date.now();
    if (lastScanRef.current.code === code && now - lastScanRef.current.time < 3000) {
      return;
    }
    lastScanRef.current = { code, time: now };
    executeScan(code, mode);
  };

  useEffect(() => {
    if (!cameraEnabled) {
      setCameraActive(false);
      return;
    }
    let html5QrCode: import('html5-qrcode').Html5Qrcode | null = null;
    let mounted = true;

    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode('qr-reader');
      html5QrCode = scanner;
      return scanner
        .start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText: string) => {
            if (mounted) handleCameraScan(decodedText);
          },
          () => {}
        )
        .then(() => {
          if (mounted) {
            setCameraActive(true);
            setCamError('');
          }
        })
        .catch((err: any) => {
          if (mounted) {
            setCameraActive(false);
            setCamError('Camera not available or permission denied. You can use Barcode Gun or manual entry below.');
          }
        });
    }).catch((e: any) => {
      setCameraActive(false);
      setCamError(e?.message || 'Camera init failed');
    });

    return () => {
      mounted = false;
      if (html5QrCode) {
        if (html5QrCode.isScanning) {
          html5QrCode.stop().then(() => {
            try { html5QrCode?.clear(); } catch {}
          }).catch(() => {});
        } else {
          try { html5QrCode.clear(); } catch {}
        }
      }
    };
  }, [cameraEnabled]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    executeScan(inputVal.trim(), mode);
    setInputVal('');
  };

  const clearHistory = () => {
    setHistory([]);
    try { sessionStorage.removeItem('dot_scan_history'); } catch {}
  };

  const stats = useMemo(() => {
    const ship = history.filter((h) => h.mode === 'ship' && h.ok).length;
    const ret = history.filter((h) => h.mode === 'return' && h.ok).length;
    const look = history.filter((h) => h.mode === 'lookup' && h.ok).length;
    return { ship, ret, look, total: history.length };
  }, [history]);

  return (
    <div className="scanner-wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            📦 Warehouse QR & Barcode Scanner
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
            Instant order dispatch, automatic return restocking & inventory updates
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="sa-btn small"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title="Toggle Sound Effects"
          >
            {soundEnabled ? '🔊 Sound On' : '🔇 Muted'}
          </button>
          <button
            type="button"
            className="sa-btn small"
            onClick={() => setCameraEnabled(!cameraEnabled)}
          >
            {cameraEnabled ? '📷 Cam Active' : '🚫 Cam Off'}
          </button>
        </div>
      </div>

      {/* Mode Selector */}
      <div className="scanner-mode-tabs">
        <button
          type="button"
          className={`scanner-mode-tab ${mode === 'ship' ? 'on-ship' : ''}`}
          onClick={() => setMode('ship')}
        >
          <span className="m-icon">🚚</span>
          <span className="m-title">Ship / Dispatch</span>
          <span className="m-sub">Courier Handover</span>
        </button>
        <button
          type="button"
          className={`scanner-mode-tab ${mode === 'return' ? 'on-return' : ''}`}
          onClick={() => setMode('return')}
        >
          <span className="m-icon">🔄</span>
          <span className="m-title">Receive Return</span>
          <span className="m-sub">Auto Restock Stock</span>
        </button>
        <button
          type="button"
          className={`scanner-mode-tab ${mode === 'lookup' ? 'on-lookup' : ''}`}
          onClick={() => setMode('lookup')}
        >
          <span className="m-icon">🔍</span>
          <span className="m-title">Lookup / Inspect</span>
          <span className="m-sub">View Order Details</span>
        </button>
      </div>

      {/* Courier Handover Dropdown Selector (in Ship mode) */}
      {mode === 'ship' && (
        <div className="scanner-courier-row">
          <div className="scanner-courier-label">
            <span>🚚 Handover Courier:</span>
          </div>
          <div className="scanner-courier-select-wrap">
            <select
              className="scanner-courier-dropdown"
              value={courierBatch}
              onChange={(e) => {
                setCourierBatch(e.target.value);
                try { localStorage.setItem('dot_scanner_courier', e.target.value); } catch {}
              }}
            >
              <option value="auto">🎯 Auto (Detect / Follow Order Address)</option>
              {activeCouriers.length > 0 && (
                <optgroup label="Active Courier Integrations">
                  {activeCouriers.map((c) => (
                    <option key={c} value={c}>
                      ⚡ {c} (Active Integration)
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All Supported Couriers">
                {COURIERS.filter(
                  (c) => !activeCouriers.some((a) => a.toLowerCase() === c.toLowerCase())
                ).map((c) => (
                  <option key={c} value={c}>
                    📦 {c}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          {courierBatch !== 'auto' && (
            <button
              type="button"
              className="sa-btn small ghost"
              onClick={() => {
                setCourierBatch('auto');
                try { localStorage.setItem('dot_scanner_courier', 'auto'); } catch {}
              }}
              title="Reset to Auto Detection"
            >
              Reset to Auto
            </button>
          )}
        </div>
      )}

      {/* Camera & Gun Area */}
      <div className="scanner-view-card">
        {cameraEnabled ? (
          <div className="scanner-camera-container">
            <div id="qr-reader" />
            <div className="scanner-crosshair-wrap">
              <div className="scanner-crosshair-box">
                <div className="scanner-corner tl" />
                <div className="scanner-corner tr" />
                <div className="scanner-corner bl" />
                <div className="scanner-corner br" />
                <div className="scanner-laser" />
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: '#94a3b8',
              background: '#090810',
              borderRadius: 12,
              width: '100%',
              maxWidth: 440,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>🔫</div>
            <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Camera Disabled</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Barcode gun scanning & manual entry active below
            </div>
            <button
              className="sa-btn small"
              style={{ marginTop: 12 }}
              onClick={() => setCameraEnabled(true)}
            >
              Turn Camera On
            </button>
          </div>
        )}

        {camError && (
          <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 10, textAlign: 'center' }}>
            ⚠️ {camError}
          </div>
        )}

        {/* Barcode Gun / Manual Input */}
        <form onSubmit={handleManualSubmit} className="scanner-gun-input-row">
          <input
            ref={gunInputRef}
            type="text"
            className="sa-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="⚡ Scan Barcode Gun or enter Order / Consignment ID..."
            disabled={processing}
            autoFocus
          />
          <button
            type="submit"
            className={`sa-btn ${mode === 'return' ? 'danger' : 'primary'}`}
            disabled={processing || !inputVal.trim()}
          >
            {processing ? 'Processing...' : 'Scan'}
          </button>
        </form>
      </div>

      {/* Result Display Box */}
      {lastResult && (
        <div className={`scanner-res-box ${lastResult.ok ? 'scanner-res-success' : 'scanner-res-error'}`}>
          {!lastResult.ok ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>❌</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Scan Failed</div>
                <div style={{ fontSize: 13, opacity: 0.9 }}>{lastResult.error}</div>
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Code: {lastResult.code}</div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>
                    {lastResult.mode === 'ship' ? '🚚' : lastResult.mode === 'return' ? '🔄' : '🔍'}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#10b981' }}>
                      {lastResult.mode === 'ship' && 'Order Dispatched & Shipped!'}
                      {lastResult.mode === 'return' && 'Return Received & Stock Restocked!'}
                      {lastResult.mode === 'lookup' && 'Order Found & Verified'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
                      {lastResult.data.order?.id} • {lastResult.data.order?.customer?.name} ({lastResult.data.order?.customer?.phone})
                    </div>
                  </div>
                </div>
                <span className={`status-pill st-${lastResult.data.order?.status}`}>
                  {lastResult.data.order?.status?.toUpperCase()}
                </span>
              </div>

              {/* Courier Handover Direction Banner */}
              {lastResult.mode !== 'return' && lastResult.data && (
                <div
                  className={`scanner-handover-banner ${
                    String(lastResult.data.courier || '').toLowerCase() === 'steadfast'
                      ? 'c-steadfast'
                      : String(lastResult.data.courier || '').toLowerCase() === 'pathao'
                      ? 'c-pathao'
                      : 'c-default'
                  }`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 26 }}>
                      {String(lastResult.data.courier || '').toLowerCase() === 'pathao' ? '🛵' : '🚚'}
                    </span>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.85 }}>
                        COURIER HANDOVER DIRECTION
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800 }}>
                        GIVE TO: {lastResult.data.courier?.toUpperCase() || 'COURIER'}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, opacity: 0.9, marginTop: 2 }}>
                        📍 {lastResult.data.zone || 'Destination'} ({lastResult.data.order?.customer?.district || lastResult.data.order?.customer?.city || 'Bangladesh'})
                        {lastResult.data.consignment ? ` • Consignment #${lastResult.data.consignment}` : ''}
                      </div>
                    </div>
                  </div>
                  {lastResult.data.warning && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.25)', border: '1px solid #ef4444', color: '#fca5a5', padding: '6px 10px', borderRadius: 6, fontSize: 11, maxWidth: 260 }}>
                      ⚠️ {lastResult.data.warning}
                    </div>
                  )}
                </div>
              )}

              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 8,
                }}
              >
                <div>
                  <strong>Address:</strong> {lastResult.data.order?.customer?.address || 'N/A'}, {lastResult.data.order?.customer?.city}
                </div>
                <div>
                  <strong>Total:</strong> {taka(lastResult.data.order?.total || 0)} ({lastResult.data.order?.paymentMethod || 'COD'})
                </div>
                {lastResult.data.order?.courier?.name && (
                  <div>
                    <strong>Courier:</strong> {lastResult.data.order.courier.name} {lastResult.data.order.courier.consignment ? `(#${lastResult.data.order.courier.consignment})` : ''}
                  </div>
                )}
                {lastResult.data.restocked && (
                  <div style={{ color: '#34d399', fontWeight: 600, gridColumn: '1 / -1' }}>
                    📦 Restocked items back into catalog: {lastResult.data.restocked.map((i: any) => `${i.name} (x${i.qty || 1})`).join(', ')}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Log */}
      <div className="scanner-history-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14 }}>Session Scan Log</h3>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Total: {stats.total} | Shipped: {stats.ship} | Returns: {stats.ret} | Lookups: {stats.look}
            </div>
          </div>
          {history.length > 0 && (
            <button className="sa-btn small" onClick={clearHistory}>
              Clear Log
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
            No scans yet in this session. Start scanning with camera or barcode gun.
          </div>
        ) : (
          <div className="scanner-history-list">
            {history.map((h) => (
              <div key={h.id} className="scanner-history-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>
                    {h.mode === 'ship' ? '🚚' : h.mode === 'return' ? '🔄' : '🔍'}
                  </span>
                  <div>
                    <span style={{ fontWeight: 600, color: h.ok ? '#f1f5f9' : '#f87171' }}>
                      {h.orderId || h.code}
                    </span>
                    {h.customer && (
                      <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 12 }}>
                        • {h.customer} {h.total ? `(${taka(h.total)})` : ''}
                      </span>
                    )}
                    {h.error && (
                      <span style={{ color: '#ef4444', marginLeft: 6, fontSize: 11 }}>
                        • {h.error}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {h.courier && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        fontWeight: 700,
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#cbd5e1',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      {h.courier}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#64748b' }}>{h.time}</span>
                  <span
                    style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      background:
                        h.mode === 'ship'
                          ? 'rgba(16, 185, 129, 0.2)'
                          : h.mode === 'return'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(99, 102, 241, 0.2)',
                      color:
                        h.mode === 'ship'
                          ? '#34d399'
                          : h.mode === 'return'
                          ? '#f87171'
                          : '#818cf8',
                    }}
                  >
                    {h.mode}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomersAdmin() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  const load = () => {
    setLoading(true);
    aFetch('/admin/customers')
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((d) => {
        setCustomers(Array.isArray(d.customers) ? d.customers : []);
        setLoading(false);
      })
      .catch(() => {
        setCustomers([]);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const exportCSV = () => {
    if (!customers.length) return;
    const header = 'Name,Phone,Email,Orders,Total Spent,Welcome 5% Used,Last Order\n';
    const rows = customers.map((c) =>
      `"${c.name || ''}","${c.phone}","${c.email || ''}",${c.ordersCount || 0},${c.totalSpent || 0},${c.welcomeCouponUsed ? 'Yes' : 'No'},"${c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString() : ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metrroma_customers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const query = q.trim().toLowerCase();
  const filtered = customers.filter((c) =>
    ((c.name || '') + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().includes(query)
  );

  return (
    <>
      <div className="sa-top">
        <div>
          <h1>Customers &amp; VIP Accounts</h1>
          <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
            Registered VIP members and customer database with purchase history and loyalty tier.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="sa-search"
            placeholder="Search name, phone or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="sa-btn ghost" onClick={exportCSV} disabled={customers.length === 0}>
            Export CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="sa-card" style={{ padding: 18 }}>
          <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Customers</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>{customers.length}</div>
        </div>
        <div className="sa-card" style={{ padding: 18 }}>
          <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Buyers</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#4ade80', marginTop: 4 }}>
            {customers.filter((c) => c.ordersCount > 0).length}
          </div>
        </div>
        <div className="sa-card" style={{ padding: 18 }}>
          <div className="dim" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Customer Spend</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>
            {taka(customers.reduce((s, c) => s + (c.totalSpent || 0), 0))}
          </div>
        </div>
      </div>

      <div className="sa-card">
        <table className="sa-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>VIP Welcome (5%)</th>
              <th>Orders</th>
              <th>Last Activity</th>
              <th className="r">Total Spent</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id || c.phone}>
                <td>
                  <div style={{ fontWeight: 600, color: '#f8fafc' }}>{c.name || 'VIP Member'}</div>
                  {c.email && <div className="dim" style={{ fontSize: 11.5 }}>{c.email}</div>}
                </td>
                <td className="dim" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  +88 {c.phone}
                </td>
                <td>
                  <span
                    style={{
                      background: c.welcomeCouponUsed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                      color: c.welcomeCouponUsed ? '#f87171' : '#4ade80',
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    {c.welcomeCouponUsed ? 'Redeemed' : 'Active (5% OFF)'}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{c.ordersCount || 0}</span>
                </td>
                <td className="dim">
                  {c.lastOrderAt ? fmt(c.lastOrderAt) : fmt(c.createdAt)}
                </td>
                <td className="r" style={{ fontWeight: 600, color: '#f8fafc' }}>
                  {taka(c.totalSpent || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="sa-empty">Loading customers…</div>}
        {!loading && filtered.length === 0 && <div className="sa-empty">No customers found.</div>}
      </div>
    </>
  );
}

function StaffAdmin() {
  const [list, setList] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [f, setF] = useState<any>({ username: '', name: '', email: '', password: '', role: 'staff', accessAll: true, allowedProducts: [] });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('metroomaa@gmail.com');
  const [editingEmail, setEditingEmail] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [pwModal, setPwModal] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // Edit staff modal state
  const [editUser, setEditUser] = useState<any>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  const load = () => {
    aFetch('/admin/users').then((r) => (r.ok ? r.json() : [])).then((d) => setList(Array.isArray(d) ? d : [])).catch(() => setList([]));
    fetch('/api/products').then((r) => (r.ok ? r.json() : [])).then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => setProducts([]));
    aFetch('/admin/integrations').then((r) => r.json()).then((ig) => {
      if (ig?.email?.adminEmail) setOwnerEmail(ig.email.adminEmail);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const add = async (e: any) => {
    e?.preventDefault();
    setErr(''); setMsg('');
    const payload = {
      ...f,
      allowedProducts: f.accessAll ? [] : f.allowedProducts,
      skipOtp: !!f.skipOtp
    };
    try {
      const r = await aFetch('/admin/users', { method: 'POST', body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg(f.email ? `Team member added! Login details emailed to ${f.email}` : 'Team member added successfully!');
      setF({ username: '', name: '', email: '', password: '', role: 'staff', accessAll: true, allowedProducts: [], skipOtp: false });
      load();
      setTimeout(() => setMsg(''), 6000);
    }
    catch (e: any) { setErr(e.message); }
  };

  const saveEdit = async () => {
    if (!editUser) return;
    setEditErr(''); setEditBusy(true);
    const payload = {
      name: editUser.name,
      email: editUser.email,
      role: editUser.role,
      skipOtp: !!editUser.skipOtp,
      allowedProducts: editUser.accessAll ? [] : editUser.allowedProducts,
      password: editUser.password || undefined
    };
    try {
      const r = await aFetch('/admin/users/' + editUser.id, { method: 'PATCH', body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg('Permissions updated for ' + editUser.name);
      setEditUser(null);
      load();
      setTimeout(() => setMsg(''), 4000);
    } catch (e: any) { setEditErr(e.message); }
    finally { setEditBusy(false); }
  };

  const updateSecurityEmail = async () => {
    try {
      const r = await aFetch('/admin/security-email', { method: 'PUT', body: JSON.stringify({ email: newOwnerEmail }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setOwnerEmail(d.adminEmail);
      setEditingEmail(false);
      setMsg('2FA security email updated successfully!');
      setTimeout(() => setMsg(''), 4000);
    } catch (e: any) { alert(e.message || 'Failed to update email'); }
  };

  const changePw = async () => {
    setPwErr(''); setPwMsg(''); setPwBusy(true);
    try {
      const r = await aFetch('/admin/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPwMsg(d.message);
      setCurPw(''); setNewPw('');
      setTimeout(() => { setPwModal(false); setPwMsg(''); }, 2500);
    } catch (e: any) { setPwErr(e.message); }
    finally { setPwBusy(false); }
  };

  const del = async (id: string) => { if (!confirm('Remove this staff member?')) return; await aFetch('/admin/users/' + id, { method: 'DELETE' }); load(); };

  return (
    <>
      <div className="sa-top">
        <h1>Team &amp; Security Management</h1>
        <button className="sa-btn ghost" onClick={() => setPwModal(true)}>🔑 Change Master Password</button>
      </div>

      {/* Owner Security Status Card */}
      <div className="sa-card" style={{ padding: 22, marginBottom: 20, border: '1px solid rgba(139,92,246,0.3)', background: 'linear-gradient(180deg, rgba(139,92,246,0.08) 0%, rgba(19,17,28,0.95) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Store Owner Account</span>
              <span className="sa-badge" style={{ background: '#7c3aed', color: '#fff', border: '1px solid #8b5cf6' }}>Super Admin</span>
              <span className="sa-badge" style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}>2FA Active ✓</span>
            </div>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>Full administrative control over store, orders, inventory, courier integrations, and staff.</p>
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, background: 'rgba(0,0,0,0.3)', padding: 16, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Owner Username</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginTop: 3 }}><code>owner</code></div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>2FA Security Email</div>
            {editingEmail ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input style={{ padding: '5px 8px', fontSize: 13 }} value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} placeholder="new@gmail.com" />
                <button className="sa-btn sa-mini" onClick={updateSecurityEmail}>Save</button>
                <button className="sa-btn ghost sa-mini" onClick={() => setEditingEmail(false)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#a78bfa' }}>{ownerEmail}</span>
                <button style={{ background: 'none', border: 'none', color: '#94a3b8', textDecoration: 'underline', fontSize: 12, cursor: 'pointer' }} onClick={() => { setNewOwnerEmail(ownerEmail); setEditingEmail(true); }}>Edit</button>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Email Sender</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0', marginTop: 3 }}><code>admin@metrroma.com</code></div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Session Security</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#4ade80', marginTop: 3 }}>48-Hour Auto-Lock Active</div>
          </div>
        </div>
      </div>

      {/* Add New Team Member Form */}
      <div className="sa-card" style={{ padding: 22, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#fff' }}>Add New Team Member</h3>
        <p className="dim" style={{ fontSize: 13, marginBottom: 18 }}>Create staff or manager accounts with role-based permissions and specific product assignments.</p>

        <form onSubmit={add} autoComplete="off">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
              Full Name *
              <input autoComplete="new-password" name="staff_name" placeholder="e.g. Md. Tanvir Hasan" value={f.name} onChange={(e) => setF((s: any) => ({ ...s, name: e.target.value }))} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
              Username *
              <input autoComplete="new-password" name="staff_uname" placeholder="e.g. tanvir" value={f.username} onChange={(e) => setF((s: any) => ({ ...s, username: e.target.value }))} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
              Staff Email (for Login OTP)
              <input type="email" autoComplete="new-password" name="staff_email" placeholder="e.g. tanvir@gmail.com" value={f.email} onChange={(e) => setF((s: any) => ({ ...s, email: e.target.value }))} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
              Password (min. 4 chars) *
              <input type="password" autoComplete="new-password" name="staff_pwd" placeholder="Create temporary password" value={f.password} onChange={(e) => setF((s: any) => ({ ...s, password: e.target.value }))} required />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
              Role &amp; Permissions *
              <select value={f.role} onChange={(e) => setF((s: any) => ({ ...s, role: e.target.value }))}>
                <option value="staff">Staff — Orders &amp; QR Scanner only</option>
                <option value="manager">Manager — Full Store (except staff)</option>
              </select>
            </label>
          </div>

          {/* Product Permission Scope */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Product Permission Scope</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button type="button" className={`sa-btn sa-mini ${f.accessAll ? '' : 'ghost'}`} onClick={() => setF((s: any) => ({ ...s, accessAll: true, allowedProducts: [] }))}>
                ✓ All Store Products (Full Access)
              </button>
              <button type="button" className={`sa-btn sa-mini ${!f.accessAll ? '' : 'ghost'}`} onClick={() => setF((s: any) => ({ ...s, accessAll: false }))}>
                🎯 Assign Specific Products Only ({f.allowedProducts.length} selected)
              </button>
            </div>
            {!f.accessAll && (
              <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Select which products this staff member can see &amp; process in Orders and Scanner:</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="sa-link" style={{ fontSize: 12 }} onClick={() => setF((s: any) => ({ ...s, allowedProducts: products.map((p) => p.id) }))}>Select All</button>
                    <button type="button" className="sa-link" style={{ fontSize: 12 }} onClick={() => setF((s: any) => ({ ...s, allowedProducts: [] }))}>Clear All</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                  {products.map((p) => {
                    const checked = f.allowedProducts.includes(p.id);
                    return (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: checked ? 'rgba(139,92,246,0.14)' : 'rgba(255,255,255,0.03)', border: checked ? '1px solid rgba(139,92,246,0.4)' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked ? [...f.allowedProducts, p.id] : f.allowedProducts.filter((id: string) => id !== p.id);
                            setF((s: any) => ({ ...s, allowedProducts: next }));
                          }}
                        />
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: checked ? '#fff' : '#cbd5e1' }}>{p.name}</span>
                        <span className="dim" style={{ fontSize: 11.5 }}>৳{p.price}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Direct Login / OTP Toggle */}
          <div style={{ marginTop: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#e2e8f0' }}>
              <input
                type="checkbox"
                checked={!!f.skipOtp}
                onChange={(e) => setF((s: any) => ({ ...s, skipOtp: e.target.checked }))}
              />
              <span>⚡ <strong>Direct Login (Skip OTP):</strong> Allow this team member to log in directly with Username &amp; Password without requiring email OTP</span>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
            <button type="submit" className="sa-btn" style={{ padding: '10px 22px' }}>Create Team Member</button>
            <span className="dim" style={{ fontSize: 12.5 }}>🔒 Staff sessions automatically expire every 48 hours for store security.</span>
          </div>
        </form>

        {err && <div className="err2" style={{ marginTop: 12 }}>{err}</div>}
        {msg && <div style={{ color: '#4ade80', fontSize: 13.5, fontWeight: 500, marginTop: 12 }}>{msg}</div>}
      </div>

      {/* Team Directory Table */}
      <div className="sa-card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Team Members Directory</h3>
          <span className="dim" style={{ fontSize: 12.5 }}>{list.length} active account{list.length === 1 ? '' : 's'}</span>
        </div>
        <table className="sa-table">
          <thead>
            <tr>
              <th>Member Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Role</th>
              <th>Authentication</th>
              <th>Product Permissions</th>
              <th className="r">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => {
              const hasSpecific = Array.isArray(u.allowedProducts) && u.allowedProducts.length > 0;
              return (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td><code style={{ background: 'rgba(255,255,255,0.06)', padding: '3px 7px', borderRadius: 5 }}>{u.username}</code></td>
                  <td>{u.email ? <span style={{ color: '#a78bfa' }}>{u.email}</span> : <span className="dim">None</span>}</td>
                  <td><span className="sa-badge" style={{ background: u.role === 'manager' ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.08)', color: u.role === 'manager' ? '#c4b5fd' : '#cbd5e1' }}>{u.role}</span></td>
                  <td>
                    {u.skipOtp ? (
                      <span className="sa-badge" style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.3)' }}>
                        ⚡ Direct Login
                      </span>
                    ) : (
                      <span className="sa-badge" style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
                        🔒 2FA OTP Required
                      </span>
                    )}
                  </td>
                  <td>
                    {hasSpecific ? (
                      <span className="sa-badge" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}>
                        🎯 {u.allowedProducts.length} Product{u.allowedProducts.length === 1 ? '' : 's'}
                      </span>
                    ) : (
                      <span className="sa-badge" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
                        ✓ All Products (Full)
                      </span>
                    )}
                  </td>
                  <td className="r">
                    <button className="sa-link" style={{ marginRight: 10, color: '#a78bfa' }} onClick={() => setEditUser({ ...u, accessAll: !u.allowedProducts || u.allowedProducts.length === 0, allowedProducts: u.allowedProducts || [], password: '' })}>
                      Edit Access
                    </button>
                    <button className="sa-link danger" onClick={() => del(u.id)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="sa-empty">No team members added yet. You can add staff or manager accounts above.</div>}
      </div>

      {/* Edit Staff Permissions Modal */}
      {editUser && (
        <div className="sa-modal" onClick={() => setEditUser(null)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="sa-modal-head">
              <h3>Edit Staff Permissions: {editUser.name}</h3>
              <button className="sa-modal-close" onClick={() => setEditUser(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#cbd5e1' }}>
                  Full Name
                  <input value={editUser.name} onChange={(e) => setEditUser((s: any) => ({ ...s, name: e.target.value }))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#cbd5e1' }}>
                  Role
                  <select value={editUser.role} onChange={(e) => setEditUser((s: any) => ({ ...s, role: e.target.value }))}>
                    <option value="staff">Staff — Orders &amp; Scanner only</option>
                    <option value="manager">Manager — Full Store</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#cbd5e1' }}>
                Email (for Login OTP)
                <input type="email" value={editUser.email || ''} onChange={(e) => setEditUser((s: any) => ({ ...s, email: e.target.value }))} placeholder="staff@gmail.com" />
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: '#e2e8f0' }}>
                <input
                  type="checkbox"
                  checked={!!editUser.skipOtp}
                  onChange={(e) => setEditUser((s: any) => ({ ...s, skipOtp: e.target.checked }))}
                />
                <span>⚡ <strong>Direct Login (Skip OTP):</strong> Allow direct login with Password only</span>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: '#cbd5e1' }}>
                Update Password <span className="dim">(leave blank to keep current)</span>
                <input type="password" value={editUser.password || ''} onChange={(e) => setEditUser((s: any) => ({ ...s, password: e.target.value }))} placeholder="New password" />
              </label>

              {/* Product permissions in edit modal */}
              <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Product Permission Scope</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button type="button" className={`sa-btn sa-mini ${editUser.accessAll ? '' : 'ghost'}`} onClick={() => setEditUser((s: any) => ({ ...s, accessAll: true, allowedProducts: [] }))}>
                    All Products
                  </button>
                  <button type="button" className={`sa-btn sa-mini ${!editUser.accessAll ? '' : 'ghost'}`} onClick={() => setEditUser((s: any) => ({ ...s, accessAll: false }))}>
                    Specific Products Only ({editUser.allowedProducts?.length || 0})
                  </button>
                </div>
                {!editUser.accessAll && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, maxHeight: 180, overflowY: 'auto' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6 }}>
                      {products.map((p) => {
                        const checked = (editUser.allowedProducts || []).includes(p.id);
                        return (
                          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: checked ? 'rgba(139,92,246,0.15)' : 'transparent', cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const cur = editUser.allowedProducts || [];
                                const next = e.target.checked ? [...cur, p.id] : cur.filter((id: string) => id !== p.id);
                                setEditUser((s: any) => ({ ...s, allowedProducts: next }));
                              }}
                            />
                            <span style={{ flex: 1, color: checked ? '#fff' : '#cbd5e1' }}>{p.name}</span>
                            <span className="dim" style={{ fontSize: 11.5 }}>৳{p.price}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {editErr && <div className="err2">{editErr}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="sa-btn full" disabled={editBusy} onClick={saveEdit}>{editBusy ? 'Saving…' : 'Save Changes'}</button>
                <button className="sa-btn ghost" onClick={() => setEditUser(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {pwModal && (
        <div className="sa-modal" onClick={() => setPwModal(false)}>
          <div className="sa-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="sa-modal-head">
              <h3>Change Master Password</h3>
              <button className="sa-modal-close" onClick={() => setPwModal(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                Current Password
                <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Enter current master password" />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cbd5e1' }}>
                New Password (min 4 chars)
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Enter new password" />
              </label>
              {pwErr && <div className="err2">{pwErr}</div>}
              {pwMsg && <div style={{ color: '#4ade80', fontSize: 13 }}>{pwMsg}</div>}
              <button className="sa-btn full" disabled={pwBusy || !curPw || newPw.length < 4} onClick={changePw} style={{ marginTop: 8 }}>
                {pwBusy ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReviewsAdmin() {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await aFetch('/admin/reviews');
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch (e) {
      console.warn('Failed to fetch reviews', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleApprove = async (r: any) => {
    setActionBusy(r.id);
    try {
      const res = await aFetch(`/admin/reviews/${r.productId || 'general'}/${r.id}/approve`, { method: 'PUT' });
      if (res.ok) {
        setReviews((prev) => prev.map((x) => (x.id === r.id ? { ...x, approved: true } : x)));
      }
    } catch {}
    setActionBusy(null);
  };

  const handleReject = async (r: any) => {
    setActionBusy(r.id);
    try {
      const res = await aFetch(`/admin/reviews/${r.productId || 'general'}/${r.id}/reject`, { method: 'PUT' });
      if (res.ok) {
        setReviews((prev) => prev.map((x) => (x.id === r.id ? { ...x, approved: false } : x)));
      }
    } catch {}
    setActionBusy(null);
  };

  const handleDelete = async (r: any) => {
    if (!confirm(`Are you sure you want to delete the review by "${r.name}"?`)) return;
    setActionBusy(r.id);
    try {
      const res = await aFetch(`/admin/reviews/${r.productId || 'general'}/${r.id}`, { method: 'DELETE' });
      if (res.ok) {
        setReviews((prev) => prev.filter((x) => x.id !== r.id));
      }
    } catch {}
    setActionBusy(null);
  };

  const filtered = useMemo(() => {
    return reviews.filter((r) => {
      if (filter === 'pending' && r.approved) return false;
      if (filter === 'approved' && !r.approved) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const n = (r.name || '').toLowerCase();
        const t = (r.text || '').toLowerCase();
        const p = (r.productName || '').toLowerCase();
        if (!n.includes(q) && !t.includes(q) && !p.includes(q)) return false;
      }
      return true;
    });
  }, [reviews, filter, search]);

  const pendingCount = reviews.filter((r) => !r.approved).length;

  return (
    <div className="sa-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f8fafc' }}>
            কাস্টমার রিভিউ ম্যানেজমেন্ট (Customer Reviews)
          </h2>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            কাস্টমারদের জমা দেওয়া রিভিউ পর্যালোচনা এবং ওয়েবসাইটে প্রকাশের অনুমোদন দিন
          </p>
        </div>
        <button className="sa-btn" onClick={load} disabled={loading} style={{ fontSize: 13, padding: '8px 16px' }}>
          🔄 রিফ্রেশ
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#1e1b34', border: '1px solid #332d56', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#94a3b8', fontSize: 12 }}>মোট রিভিউ</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', marginTop: 4 }}>{reviews.length}</div>
        </div>
        <div style={{ background: '#1e1b34', border: '1px solid #f59e0b44', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#fbbf24', fontSize: 12 }}>অপেক্ষমাণ রিভিউ (Pending)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fbbf24', marginTop: 4 }}>{pendingCount}</div>
        </div>
        <div style={{ background: '#1e1b34', border: '1px solid #10b98144', borderRadius: 12, padding: 14 }}>
          <div style={{ color: '#34d399', fontSize: 12 }}>অনুমোদিত রিভিউ (Approved)</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#34d399', marginTop: 4 }}>{reviews.filter((r) => r.approved).length}</div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="কাস্টমার নাম, পণ্য বা কমেন্ট খুঁজুন..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, background: '#18152b', border: '1px solid #332d56', borderRadius: 8, padding: '8px 14px', color: '#f8fafc', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={`sa-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={{ fontSize: 12, background: filter === 'all' ? '#7c3aed' : '#1e1b34', borderColor: filter === 'all' ? '#7c3aed' : '#332d56' }}
          >
            সব ({reviews.length})
          </button>
          <button
            className={`sa-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
            style={{ fontSize: 12, background: filter === 'pending' ? '#d97706' : '#1e1b34', borderColor: filter === 'pending' ? '#d97706' : '#332d56' }}
          >
            অপেক্ষমাণ ({pendingCount})
          </button>
          <button
            className={`sa-btn ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
            style={{ fontSize: 12, background: filter === 'approved' ? '#059669' : '#1e1b34', borderColor: filter === 'approved' ? '#059669' : '#332d56' }}
          >
            অনুমোদিত ({reviews.filter((r) => r.approved).length})
          </button>
        </div>
      </div>

      {/* Reviews Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>রিভিউ লোড হচ্ছে...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', background: '#18152b', borderRadius: 12, border: '1px dashed #332d56' }}>
          কোনো রিভিউ পাওয়া যায়নি
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((r) => (
            <div
              key={r.id}
              style={{
                background: '#18152b',
                border: r.approved ? '1px solid #10b98144' : '1px solid #f59e0b66',
                borderRadius: 12,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#3b2d54', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#e2e8f0', fontSize: 16 }}>
                    {(r.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: 14 }}>
                      {r.name}{' '}
                      <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>📍 {r.location || 'বাংলাদেশ'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ color: '#f59e0b', fontSize: 13 }}>{'★'.repeat(r.rating || 5)}{'☆'.repeat(5 - (r.rating || 5))}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{new Date(r.at || Date.now()).toLocaleDateString('bn-BD')}</span>
                      {r.productName && (
                        <span style={{ fontSize: 11, background: '#252044', color: '#c4b5fd', padding: '2px 8px', borderRadius: 6 }}>
                          🛍️ {r.productName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 20,
                      background: r.approved ? '#064e3b' : '#78350f',
                      color: r.approved ? '#34d399' : '#fcd34d',
                      border: r.approved ? '1px solid #059669' : '1px solid #d97706',
                    }}
                  >
                    {r.approved ? '✅ অনুমোদিত (Live)' : '⏳ অপেক্ষমাণ (Pending)'}
                  </span>
                </div>
              </div>

              {/* Comment text */}
              <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, background: '#1e1b34', padding: '12px 14px', borderRadius: 8 }}>
                "{r.text}"
              </div>

              {/* Photo if attached */}
              {r.image && (
                <div style={{ marginTop: 2 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>সংযুক্ত শিশুর ছবি:</span>
                  <a href={r.image} target="_blank" rel="noopener noreferrer">
                    <img
                      src={r.image}
                      alt="Review baby photo"
                      style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #475569' }}
                    />
                  </a>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                {!r.approved ? (
                  <button
                    className="sa-btn"
                    onClick={() => handleApprove(r)}
                    disabled={actionBusy === r.id}
                    style={{ background: '#059669', borderColor: '#059669', color: '#fff', fontSize: 12, padding: '6px 14px' }}
                  >
                    ✅ অনুমোদন করুন (Approve)
                  </button>
                ) : (
                  <button
                    className="sa-btn"
                    onClick={() => handleReject(r)}
                    disabled={actionBusy === r.id}
                    style={{ background: '#d97706', borderColor: '#d97706', color: '#fff', fontSize: 12, padding: '6px 14px' }}
                  >
                    ↩️ বাতিল করুন (Reject)
                  </button>
                )}
                <button
                  className="sa-btn"
                  onClick={() => handleDelete(r)}
                  disabled={actionBusy === r.id}
                  style={{ background: '#dc2626', borderColor: '#dc2626', color: '#fff', fontSize: 12, padding: '6px 14px' }}
                >
                  🗑️ মুছে ফেলুন
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
