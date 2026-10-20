import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, 'data');
const PERSISTENT_DIR = join(DATA_DIR, 'persistent');
const BACKUPS_DIR = join(DATA_DIR, 'backups');

// External safe storage sitting completely outside the git repository
let EXTERNAL_DIR = process.env.PERSISTENT_DATA_DIR;
if (!EXTERNAL_DIR) {
  const storeBaseName = 'babywear_persistent_data';
  const candidates = [
    join(__dir, '..', '..', storeBaseName),
    join(__dir, '..', 'persistent_data'),
    join('/var/www', storeBaseName)
  ];
  for (const cand of candidates) {
    try {
      if (!existsSync(cand)) mkdirSync(cand, { recursive: true });
      writeFileSync(join(cand, '.probe'), '1');
      unlinkSync(join(cand, '.probe'));
      EXTERNAL_DIR = cand;
      break;
    } catch (_) {}
  }
}
if (!EXTERNAL_DIR) EXTERNAL_DIR = join(DATA_DIR, 'persistent');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(PERSISTENT_DIR)) mkdirSync(PERSISTENT_DIR, { recursive: true });
if (!existsSync(BACKUPS_DIR)) mkdirSync(BACKUPS_DIR, { recursive: true });
try { if (!existsSync(EXTERNAL_DIR)) mkdirSync(EXTERNAL_DIR, { recursive: true }); } catch (_) {}
console.log('[Store] Baby Wear external database locked at:', EXTERNAL_DIR);

// Primary file paths
const CATALOG = join(DATA_DIR, 'catalog.json');
const PERSISTENT_CATALOG = join(PERSISTENT_DIR, 'catalog.json');
const BACKUP_CATALOG = join(DATA_DIR, 'catalog.backup.json');
const EXT_CATALOG = join(EXTERNAL_DIR, 'catalog.json');

const ORDERS = join(DATA_DIR, 'orders.json');
const PERSISTENT_ORDERS = join(PERSISTENT_DIR, 'orders.json');
const BACKUP_ORDERS = join(DATA_DIR, 'orders.backup.json');
const EXT_ORDERS = join(EXTERNAL_DIR, 'orders.json');

const SETTINGS = join(DATA_DIR, 'settings.json');
const PERSISTENT_SETTINGS = join(PERSISTENT_DIR, 'settings.json');
const BACKUP_SETTINGS = join(DATA_DIR, 'settings.metrroma.backup.json');
const EXT_SETTINGS = join(EXTERNAL_DIR, 'settings.json');

const COLORS = join(DATA_DIR, 'colors.json');
const PERSISTENT_COLORS = join(PERSISTENT_DIR, 'colors.json');
const BACKUP_COLORS = join(DATA_DIR, 'colors.metrroma.backup.json');
const EXT_COLORS = join(EXTERNAL_DIR, 'colors.json');

const CUSTOMERS = join(DATA_DIR, 'customers.json');
const PERSISTENT_CUSTOMERS = join(PERSISTENT_DIR, 'customers.json');
const BACKUP_CUSTOMERS = join(DATA_DIR, 'customers.metrroma.backup.json');
const EXT_CUSTOMERS = join(EXTERNAL_DIR, 'customers.json');

const COUPONS = join(DATA_DIR, 'coupons.json');
const PERSISTENT_COUPONS = join(PERSISTENT_DIR, 'coupons.json');
const BACKUP_COUPONS = join(DATA_DIR, 'coupons.metrroma.backup.json');
const EXT_COUPONS = join(EXTERNAL_DIR, 'coupons.json');

const REVIEWS = join(DATA_DIR, 'reviews.json');
const PERSISTENT_REVIEWS = join(PERSISTENT_DIR, 'reviews.json');
const BACKUP_REVIEWS = join(DATA_DIR, 'reviews.metrroma.backup.json');
const EXT_REVIEWS = join(EXTERNAL_DIR, 'reviews.json');

const USERS = join(DATA_DIR, 'users.json');
const PERSISTENT_USERS = join(PERSISTENT_DIR, 'users.json');
const BACKUP_USERS = join(DATA_DIR, 'users.metrroma.backup.json');
const EXT_USERS = join(EXTERNAL_DIR, 'users.json');

const INTEGRATIONS = join(DATA_DIR, 'integrations.json');
const PERSISTENT_INTEGRATIONS = join(PERSISTENT_DIR, 'integrations.json');
const BACKUP_INTEGRATIONS = join(DATA_DIR, 'integrations.metrroma.backup.json');
const EXT_INTEGRATIONS = join(EXTERNAL_DIR, 'integrations.json');

const LANDINGS = join(DATA_DIR, 'landings.json');
const PERSISTENT_LANDINGS = join(PERSISTENT_DIR, 'landings.json');
const BACKUP_LANDINGS = join(DATA_DIR, 'landings.metrroma.backup.json');
const EXT_LANDINGS = join(EXTERNAL_DIR, 'landings.json');

export const DEFAULT_COLORS = [
  { id: 'jet-black', name: 'Jet Black', hex: '#111111' },
  { id: 'pure-white', name: 'Pure White', hex: '#FFFFFF' },
  { id: 'pearl-white', name: 'Pearl / Off-White', hex: '#F8F9FA' },
  { id: 'charcoal-grey', name: 'Charcoal Grey', hex: '#495057' },
  { id: 'silver', name: 'Silver / Metallic', hex: '#C0C0C0' },
  { id: 'gold', name: 'Luxury Gold', hex: '#D4AF37' },
  { id: 'rose-gold', name: 'Rose Gold', hex: '#B76E79' },
  { id: 'gunmetal', name: 'Gunmetal / Matte Grey', hex: '#2C3539' },
  { id: 'navy-blue', name: 'Navy Blue', hex: '#1A2B4C' },
  { id: 'royal-blue', name: 'Royal Blue', hex: '#2563EB' },
  { id: 'sky-blue', name: 'Sky Blue', hex: '#87CEEB' },
  { id: 'deep-maroon', name: 'Deep Maroon', hex: '#58111A' },
  { id: 'burgundy', name: 'Burgundy / Wine', hex: '#800020' },
  { id: 'dusty-rose', name: 'Dusty Rose', hex: '#DCAE96' },
  { id: 'emerald-green', name: 'Emerald Green', hex: '#1B4D3E' },
  { id: 'olive-green', name: 'Olive Green', hex: '#556B2F' },
  { id: 'mint-green', name: 'Mint Green', hex: '#98FF98' },
  { id: 'mocha-brown', name: 'Mocha Brown', hex: '#4A2E1B' },
  { id: 'tan-camel', name: 'Tan / Camel', hex: '#C19A6B' },
  { id: 'desert-beige', name: 'Desert Beige', hex: '#D9CBB7' },
  { id: 'chocolate', name: 'Dark Chocolate', hex: '#3D2314' },
  { id: 'tortoise', name: 'Tortoise Shell / Amber', hex: '#8B4513' },
  { id: 'lavender', name: 'Lavender', hex: '#E6E6FA' },
  { id: 'coral', name: 'Peach / Coral', hex: '#F88379' },
];

export const DEFAULT_SETTINGS = {
  storeName: 'SECRATE',
  announce: '🌿 PURE BOTANICAL SKINCARE · 100% AUTHENTIC DERMATOLOGICALLY CRAFTED · CASH ON DELIVERY NATIONWIDE',
  deliveryInside: 80,
  deliveryOutside: 130,
  freeShipThreshold: 2500,
  lowStockAt: 5,
  whatsapp: '8801878374762',
  phone: '8801878374762',
  gtmId: 'GTM-KFFN69B8',
  fbPixelId: '848875214054132',
  logo: '/uploads/logo_secrate.png',
  favicon: '/uploads/favicon_32.png',
  sliders: [],
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
};

// Safe generic reader that checks external safe copy first (outside git), then persistent, then standard, then backup
function readSafe(extPath, persistentPath, stdPath, defaultVal, backupPath = null) {
  try {
    if (extPath && existsSync(extPath)) {
      const parsed = JSON.parse(readFileSync(extPath, 'utf8'));
      if (parsed != null) return parsed;
    }
  } catch (_) {}
  try {
    if (existsSync(persistentPath)) {
      const parsed = JSON.parse(readFileSync(persistentPath, 'utf8'));
      if (parsed != null) {
        if (extPath) try { writeFileSync(extPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        return parsed;
      }
    }
  } catch (_) {}
  try {
    if (existsSync(stdPath)) {
      const parsed = JSON.parse(readFileSync(stdPath, 'utf8'));
      if (parsed != null) {
        if (extPath) try { writeFileSync(extPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        try { writeFileSync(persistentPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
        return parsed;
      }
    }
  } catch (_) {}
  if (backupPath) {
    try {
      if (existsSync(backupPath)) {
        const parsed = JSON.parse(readFileSync(backupPath, 'utf8'));
        if (parsed != null) {
          if (extPath) try { writeFileSync(extPath, JSON.stringify(parsed, null, 2)); } catch (_) {}
          try {
            writeFileSync(persistentPath, JSON.stringify(parsed, null, 2));
            writeFileSync(stdPath, JSON.stringify(parsed, null, 2));
          } catch (_) {}
          return parsed;
        }
      }
    } catch (_) {}
  }
  return defaultVal;
}

// Safe writer that writes to external storage (outside git), persistent storage, standard storage, and immutable backup
function writeSafe(extPath, persistentPath, stdPath, val, backupPrefix = null, backupPath = null) {
  const jsonStr = JSON.stringify(val, null, 2);
  if (extPath) {
    try { writeFileSync(extPath, jsonStr); } catch (e) { console.error('[Store] External write error:', e.message); }
  }
  try { writeFileSync(persistentPath, jsonStr); } catch (e) { console.error('[Store] Persistent write error:', e.message); }
  try { writeFileSync(stdPath, jsonStr); } catch (e) { console.error('[Store] Standard write error:', e.message); }
  if (backupPath) {
    try { writeFileSync(backupPath, jsonStr); } catch (_) {}
  }
  if (backupPrefix) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      writeFileSync(join(BACKUPS_DIR, `${backupPrefix}-${day}.json`), jsonStr);
    } catch (_) {}
  }
}

export function getSettings() {
  const base = { ...DEFAULT_SETTINGS };
  const saved = readSafe(EXT_SETTINGS, PERSISTENT_SETTINGS, SETTINGS, {}, BACKUP_SETTINGS);
  return { ...base, ...saved };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeSafe(EXT_SETTINGS, PERSISTENT_SETTINGS, SETTINGS, next, 'settings', BACKUP_SETTINGS);
  return next;
}

export function getCatalog() {
  try {
    if (existsSync(EXT_CATALOG)) {
      const d = JSON.parse(readFileSync(EXT_CATALOG, 'utf8'));
      if (d && Array.isArray(d.products) && d.products.length > 0) return d;
    }
  } catch (_) {}
  try {
    if (existsSync(CATALOG)) return JSON.parse(readFileSync(CATALOG, 'utf8'));
  } catch (_) {}
  return { categories: [], products: [] };
}

export function saveCatalog(cat) {
  if (!cat || !Array.isArray(cat.products)) return;
  writeSafe(EXT_CATALOG, PERSISTENT_CATALOG, CATALOG, cat, 'catalog', BACKUP_CATALOG);
}

export function addProduct(p) {
  const cat = getCatalog();
  cat.products.push(p);
  saveCatalog(cat);
  return p;
}

export function updateProduct(id, patch) {
  const cat = getCatalog();
  const i = cat.products.findIndex((x) => x.id === id);
  if (i < 0) return null;
  cat.products[i] = { ...cat.products[i], ...patch, id };
  saveCatalog(cat);
  return cat.products[i];
}

export function deleteProduct(id) {
  const cat = getCatalog();
  const before = cat.products.length;
  cat.products = cat.products.filter((x) => x.id !== id);
  if (cat.products.length === before) return false;
  saveCatalog(cat);
  return true;
}

export function addCategory(c) {
  const cat = getCatalog();
  if (!c.slug || cat.categories.find((x) => x.slug === c.slug)) return null;
  cat.categories.push(c);
  saveCatalog(cat);
  return c;
}

export function updateCategory(slug, patch) {
  const cat = getCatalog();
  const i = cat.categories.findIndex((x) => x.slug === slug);
  if (i < 0) return null;
  cat.categories[i] = { ...cat.categories[i], ...patch, slug };
  saveCatalog(cat);
  return cat.categories[i];
}

export function deleteCategory(slug) {
  const cat = getCatalog();
  const n = cat.categories.length;
  cat.categories = cat.categories.filter((x) => x.slug !== slug);
  if (cat.categories.length === n) return false;
  saveCatalog(cat);
  return true;
}

export function getOrders() {
  // EXCLUSIVE SHIELD: If external safe storage exists, it is the 100% SINGLE SOURCE OF TRUTH.
  // NEVER read BACKUP_ORDERS or ORDERS from inside the Git repo, because Git pulls overwrite them!
  try {
    if (existsSync(EXT_ORDERS)) {
      const extList = JSON.parse(readFileSync(EXT_ORDERS, 'utf8'));
      if (Array.isArray(extList) && extList.length > 0) {
        return extList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      }
    }
  } catch (_) {}

  // Only reached on brand new blank server initialization
  const map = new Map();

  const absorb = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((o) => {
        if (o && o.id) {
          const prev = map.get(o.id);
          if (!prev) {
            map.set(o.id, o);
          } else {
            const prevHist = (prev.history || []).length;
            const newHist = (o.history || []).length;
            const prevItems = (prev.items || []).length;
            const newItems = (o.items || []).length;
            if (prev.status === 'approved' && o.status === 'shipped') {
              // keep approved
            } else if (newHist > prevHist || newItems > prevItems || (o.status !== 'incomplete' && prev.status === 'incomplete')) {
              map.set(o.id, { ...prev, ...o });
            }
          }
        }
      });
    }
  };

  // Check fallback paths for one-time initialization
  try { if (existsSync(PERSISTENT_ORDERS)) absorb(JSON.parse(readFileSync(PERSISTENT_ORDERS, 'utf8'))); } catch (_) {}
  try { if (existsSync(ORDERS)) absorb(JSON.parse(readFileSync(ORDERS, 'utf8'))); } catch (_) {}
  try { if (existsSync(BACKUP_ORDERS)) absorb(JSON.parse(readFileSync(BACKUP_ORDERS, 'utf8'))); } catch (_) {}

  if (map.size === 0) {
    try {
      if (existsSync(BACKUPS_DIR)) {
        const files = readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('orders-') && f.endsWith('.json')).sort().reverse();
        for (const f of files) {
          const b = JSON.parse(readFileSync(join(BACKUPS_DIR, f), 'utf8'));
          absorb(b);
          if (map.size > 0) break;
        }
      }
    } catch (_) {}
  }

  const list = Array.from(map.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  if (list.length > 0) {
    try {
      const jsonStr = JSON.stringify(list, null, 2);
      if (existsSync(dirname(EXT_ORDERS))) writeFileSync(EXT_ORDERS, jsonStr);
      writeFileSync(PERSISTENT_ORDERS, jsonStr);
      writeFileSync(ORDERS, jsonStr);
      writeFileSync(BACKUP_ORDERS, jsonStr);
    } catch (_) {}
  }
  return list;
}

export function saveOrders(orders) {
  if (!Array.isArray(orders)) return;
  // Safety guard: if attempting to save empty array while existing orders existed, keep an emergency snapshot
  if (orders.length === 0) {
    try {
      if (existsSync(PERSISTENT_ORDERS)) {
        const prev = JSON.parse(readFileSync(PERSISTENT_ORDERS, 'utf8'));
        if (Array.isArray(prev) && prev.length > 0) {
          writeFileSync(join(BACKUPS_DIR, `pre_wipe_orders_${Date.now()}.json`), JSON.stringify(prev, null, 2));
        }
      }
    } catch (_) {}
  }
  writeSafe(EXT_ORDERS, PERSISTENT_ORDERS, ORDERS, orders, 'orders', BACKUP_ORDERS);
}

export function deleteOrder(id) {
  const orders = getOrders();
  const next = orders.filter((x) => x.id !== id);
  if (next.length !== orders.length) {
    saveOrders(next);
    return true;
  }
  return false;
}

export function addOrder(order) {
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

export function updateOrderStatus(id, status) {
  const orders = getOrders();
  const o = orders.find((x) => x.id === id);
  if (!o) return null;
  o.status = status;
  saveOrders(orders);
  return o;
}

export function updateOrder(id, patch) {
  const orders = getOrders();
  const o = orders.find((x) => x.id === id);
  if (!o) return null;
  if (typeof patch.status === 'string' && patch.status && patch.status !== o.status) {
    o.status = patch.status;
    o.history = o.history || [];
    o.history.push({ status: patch.status, at: new Date().toISOString() });
  }
  if (patch.courier && typeof patch.courier === 'object') {
    const c = patch.courier;
    o.courier = {
      name: String(c.name || '').trim(),
      consignment: String(c.consignment || '').trim(),
      phone: String(c.phone || '').trim(),
      url: String(c.url || '').trim(),
      accountId: c.accountId ? String(c.accountId) : (o.courier?.accountId || ''),
      liveStatus: c.liveStatus != null ? String(c.liveStatus) : (o.courier?.liveStatus || ''),
      lastSync: c.lastSync != null ? String(c.lastSync) : (o.courier?.lastSync || ''),
    };
  }
  if (typeof patch.adminNote === 'string') o.adminNote = patch.adminNote.slice(0, 500);

  if (patch.customer && typeof patch.customer === 'object') {
    o.customer = {
      ...o.customer,
      name: patch.customer.name != null ? String(patch.customer.name).trim() : o.customer.name,
      phone: patch.customer.phone != null ? String(patch.customer.phone).trim() : o.customer.phone,
      phone2: patch.customer.phone2 != null ? String(patch.customer.phone2).trim() : (o.customer.phone2 || ''),
      address: patch.customer.address != null ? String(patch.customer.address).trim() : o.customer.address,
      district: patch.customer.district != null ? String(patch.customer.district).trim() : (o.customer.district || ''),
      thana: patch.customer.thana != null ? String(patch.customer.thana).trim() : (o.customer.thana || ''),
      area: patch.customer.area != null ? String(patch.customer.area).trim() : (o.customer.area || ''),
      note: patch.customer.note != null ? String(patch.customer.note).trim() : (o.customer.note || ''),
    };
  }

  if (Array.isArray(patch.items)) {
    o.items = patch.items.map((it) => ({
      id: it.id || '',
      name: String(it.name || '').trim(),
      price: Math.max(0, parseInt(it.price, 10) || 0),
      qty: Math.max(1, parseInt(it.qty, 10) || 1),
      subtotal: Math.max(0, (parseInt(it.price, 10) || 0) * (parseInt(it.qty, 10) || 1)),
      image: it.image || '',
    }));
    o.itemsTotal = o.items.reduce((s, it) => s + it.subtotal, 0);
  }

  if (patch.delivery != null) {
    o.delivery = Math.max(0, parseInt(patch.delivery, 10) || 0);
  }
  if (patch.discount != null) {
    o.discount = Math.max(0, parseInt(patch.discount, 10) || 0);
  }
  if (patch.itemsTotal != null || Array.isArray(patch.items) || patch.delivery != null || patch.discount != null) {
    const itTot = o.itemsTotal != null ? o.itemsTotal : (o.items || []).reduce((s, it) => s + (it.subtotal || it.price * it.qty), 0);
    const del = o.delivery != null ? o.delivery : 0;
    const disc = o.discount != null ? o.discount : 0;
    o.total = Math.max(0, itTot + del - disc);
  } else if (patch.total != null) {
    o.total = Math.max(0, parseInt(patch.total, 10) || 0);
  }

  saveOrders(orders);
  return o;
}

export function getCoupons() {
  const list = readSafe(EXT_COUPONS, PERSISTENT_COUPONS, COUPONS, [], BACKUP_COUPONS);
  return Array.isArray(list) ? list : [];
}
export function saveCoupons(c) {
  writeSafe(EXT_COUPONS, PERSISTENT_COUPONS, COUPONS, Array.isArray(c) ? c : [], 'coupons', BACKUP_COUPONS);
}

export function getReviews() {
  const r = readSafe(EXT_REVIEWS, PERSISTENT_REVIEWS, REVIEWS, {}, BACKUP_REVIEWS);
  return typeof r === 'object' && r !== null ? r : {};
}
export function saveReviews(r) {
  writeSafe(EXT_REVIEWS, PERSISTENT_REVIEWS, REVIEWS, typeof r === 'object' && r !== null ? r : {}, 'reviews', BACKUP_REVIEWS);
}

export function getUsers() {
  const u = readSafe(EXT_USERS, PERSISTENT_USERS, USERS, [], BACKUP_USERS);
  return Array.isArray(u) ? u : [];
}
export function saveUsers(u) {
  writeSafe(EXT_USERS, PERSISTENT_USERS, USERS, Array.isArray(u) ? u : [], 'users', BACKUP_USERS);
}

export const DEFAULT_INTEGRATIONS = {
  email: { enabled: true, provider: 'resend', resendApiKey: process.env.RESEND_API_KEY || '', adminEmail: 'metroomaa@gmail.com', host: '', port: 587, secure: false, user: '', pass: '', fromName: 'METRROMA', fromEmail: 'admin@metrroma.com' },
  sms: { enabled: false, url: '', method: 'GET', senderId: '', apiKey: '', templatePlaced: 'METRROMA: order {id} received. total {total}. we will call to confirm. track: {track}', templateStatus: 'METRROMA: order {id} is now {status}. {courier}' },
  couriers: [],
  tracking: { fbEnabled: false, fbPixelId: '1122829254194671', fbToken: '', fbTestCode: '', ttkEnabled: false, ttkPixelId: '', ttkToken: '' },
  fraud: { enabled: false, url: '', method: 'GET', headers: '', totalPath: '', successPath: '', cancelPath: '' },
};

export function getIntegrations() {
  const saved = readSafe(EXT_INTEGRATIONS, PERSISTENT_INTEGRATIONS, INTEGRATIONS, {}, BACKUP_INTEGRATIONS);
  return {
    email: { ...DEFAULT_INTEGRATIONS.email, ...(saved.email || {}) },
    sms: { ...DEFAULT_INTEGRATIONS.sms, ...(saved.sms || {}) },
    couriers: Array.isArray(saved.couriers) ? saved.couriers : [],
    tracking: { ...DEFAULT_INTEGRATIONS.tracking, ...(saved.tracking || {}) },
    fraud: { ...DEFAULT_INTEGRATIONS.fraud, ...(saved.fraud || {}) },
  };
}
export function saveIntegrations(next) {
  writeSafe(EXT_INTEGRATIONS, PERSISTENT_INTEGRATIONS, INTEGRATIONS, next, 'integrations', BACKUP_INTEGRATIONS);
  return next;
}

export const DEFAULT_LOVELOCK_LANDING = {
  id: 'landing_love_forever',
  title: '“LOVE FOREVER” লাক্সারি গিফট বক্স — প্রিয়জনের সেরা উপহার',
  slug: 'love-forever',
  aliases: ['love-forever', 'love-forever-gift-box', 'gift-box', 'lovelock', 'love-lock'],
  status: 'live',
  freeDelivery: false,
  badgeTop: '১০০% অরিজিনাল প্রিমিয়াম কোয়ালিটি নিশ্চিত',
  badgeGuarantee: 'একমাত্র আমরাই দিচ্ছি পণ্য দেখে মূল্য পরিশোধের সুবিধা',
  headline: '“LOVE FOREVER” লাক্সারি গিফট বক্স',
  subtitle: 'ভালোবাসার দিনে প্রিয়জনের মুখে হাসি ফোটান। ১২টি সুবাসিত লাল গোলাপ, প্রিমিয়াম নেকলেস ও গিফট ব্যাগ সহ আকর্ষণীয় প্যাকেজ।',
  videoUrl: '',
  videoBadge: '',
  productTitle: '“LOVE FOREVER” Gift Box',
  productTagline: '১২টি সুবাসিত রয়্যাল রেড সিল্ক রোজ + প্রিমিয়াম গলার হার + ফ্রি গিফট ক্যারিয়ার ব্যাগ + গ্রিটিংস কার্ড',
  heroImage: '/uploads/img_mvcvyjixc2dpi.webp',
  packageTitle: '“LOVE FOREVER” লাক্সারি গিফট বক্স কম্বো',
  offerPriceText: 'অফার মূল্য মাত্র ৫৯০ টাকা',
  freeDeliveryText: '(ক্যাশ অন ডেলিভারিতে সারা বাংলাদেশে দ্রুত হোম ডেলিভারি)',
  benefitsHeading: 'কেন এই গিফট বক্সটি সেরা উপহার?',
  benefits: [
    '🌹 ১২টি আকর্ষণীয় লাল গোলাপ: প্রিমিয়াম রয়্যাল রেড ফিনিশ ও দেখতে একদম তাজা গোলাপের মতো।',
    '💎 Premium Necklace: চকচকে প্রিমিয়াম ডিজাইনের গলার হার যা যেকোনো পোশাকে মানিয়ে যায়।',
    '🛍️ Free Gift Bag: আকর্ষণীয় গিফট ক্যারিয়ার ব্যাগ সহ পরিপাটি প্রেজেন্টেশন।',
    '💌 Greeting Card: মনের না-বলা ভালোবাসার অনুভূতি লিখে জানানোর স্পেশাল কার্ড।',
    '✨ সিক্রেট ড্রয়ার স্পেস: জুয়েলারি বা সারপ্রাইজ গিফট লুকিয়ে রাখার এক্সক্লুসিভ কম্পার্টমেন্ট।',
    '💰 নিশ্চিন্ত ক্যাশ অন ডেলিভারি: কোনো অগ্রিম টাকা ছাড়া ঘরে বসে পণ্য দেখে মূল্য পরিশোধ করুন।'
  ],
  usageHeading: 'উপহার দেয়ার উপযুক্ত উপলক্ষ্যসমূহ:',
  usageSteps: [
    'ওয়াইফ বা প্রিয়তমার জন্মদিনের শুভেচ্ছা জানাতে।',
    'বিবাহবার্ষিকী বা রিলেশনশিপ অ্যানিভার্সারিতে বিশেষ চমক দিতে।',
    'প্রপোজাল মুহূর্ত বা ভালোবাসার বিশেষ দিনকে স্মরণীয় করতে।',
    'প্রিয় মানুষকে অনাবিল আনন্দ ও সারপ্রাইজ উপহার দিতে।'
  ],
  usageImage: '/uploads/img_mvcvyqa8tgqa6.webp',
  usageCaption: 'ভালোবাসার শ্রেষ্ঠ উপহার — পরিপাটি রয়্যাল ফিনিশ',
  reviews: [
    '/uploads/img_mvcvyqj4ab8xt.webp',
    '/uploads/img_mvcvywji3jv5e.webp',
    '/uploads/img_mvcvyjixc2dpi.webp'
  ],
  reviewsBadge: 'ভেরিফায়েড ক্রেতার সন্তুষ্টি',
  reviewsTitle: 'বাস্তব কাস্টমার অভিজ্ঞতা ও ছবি',
  guaranteeBadge: '১০০% সন্তুষ্টি ও নিশ্চিন্ত ক্রয়ের অঙ্গীকার',
  guaranteeText: 'আমাদের প্রদর্শিত পণ্যের সাথে প্রাপ্ত পণ্যের মিল না থাকলে এক টাকাও দিতে হবে না, সরাসরি পার্সেল রিটার্ন করতে পারবেন। যেকোনো প্রশ্ন বা বিস্তারিত জানতে কল করুন।',
  phone: '01633617136',
  whatsapp: '8801633617136',
  packages: [
    {
      id: 'mm-29267',
      title: '“LOVE FOREVER” Gift Box (Black / Red)',
      price: 590,
      originalPrice: 1200,
      image: '/uploads/img_mvcvyjixc2dpi.webp',
      popular: true
    }
  ]
};

export function getLandings() {
  const map = new Map();
  const absorb = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((L) => {
        if (L && (L.slug || L.id)) {
          const key = String(L.slug || L.id).toLowerCase();
          map.set(key, { ...(map.get(key) || {}), ...L });
        }
      });
    }
  };
  try { if (existsSync(EXT_LANDINGS)) absorb(JSON.parse(readFileSync(EXT_LANDINGS, 'utf8'))); } catch (_) {}
  try { if (existsSync(BACKUP_LANDINGS)) absorb(JSON.parse(readFileSync(BACKUP_LANDINGS, 'utf8'))); } catch (_) {}
  try { if (existsSync(LANDINGS)) absorb(JSON.parse(readFileSync(LANDINGS, 'utf8'))); } catch (_) {}
  try { if (existsSync(PERSISTENT_LANDINGS)) absorb(JSON.parse(readFileSync(PERSISTENT_LANDINGS, 'utf8'))); } catch (_) {}

  if (map.size === 0) {
    saveLandings([DEFAULT_LOVELOCK_LANDING]);
    return [DEFAULT_LOVELOCK_LANDING];
  }
  const list = Array.from(map.values());
  try {
    const jsonStr = JSON.stringify(list, null, 2);
    if (existsSync(dirname(EXT_LANDINGS))) writeFileSync(EXT_LANDINGS, jsonStr);
    writeFileSync(PERSISTENT_LANDINGS, jsonStr);
    writeFileSync(LANDINGS, jsonStr);
    writeFileSync(BACKUP_LANDINGS, jsonStr);
  } catch (_) {}
  return list;
}

export function saveLandings(list) {
  writeSafe(EXT_LANDINGS, PERSISTENT_LANDINGS, LANDINGS, list, 'landings', BACKUP_LANDINGS);
}

export function getLandingBySlug(slug) {
  const s = String(slug || '').toLowerCase().trim();
  const list = getLandings();
  const found = list.find((L) =>
    (L.slug && L.slug.toLowerCase() === s) ||
    (Array.isArray(L.aliases) && L.aliases.some((a) => a.toLowerCase() === s))
  );
  if (found) return found;
  if (!s || s === 'lovelock' || s === 'love-lock' || s === 'magic-condom') {
    return list[0] || DEFAULT_LOVELOCK_LANDING;
  }
  return null;
}

export function addLanding(landing) {
  const list = getLandings();
  list.push(landing);
  saveLandings(list);
  return landing;
}

export function updateLanding(id, patch) {
  const list = getLandings();
  const idx = list.findIndex((L) => L.id === id || L.slug === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  saveLandings(list);
  return list[idx];
}

export function deleteLanding(id) {
  const list = getLandings();
  const next = list.filter((L) => L.id !== id && L.slug !== id);
  if (next.length === list.length) return false;
  saveLandings(next);
  return true;
}

export function getColors() {
  const list = readSafe(EXT_COLORS, PERSISTENT_COLORS, COLORS, null, BACKUP_COLORS);
  if (!Array.isArray(list) || list.length === 0) {
    saveColors(DEFAULT_COLORS);
    return DEFAULT_COLORS;
  }
  return list;
}

export function saveColors(colors) {
  writeSafe(EXT_COLORS, PERSISTENT_COLORS, COLORS, colors, 'colors', BACKUP_COLORS);
  return colors;
}

export function addColor({ name, hex }) {
  if (!name || !name.trim()) return null;
  const list = getColors();
  const cleanName = name.trim();
  const cleanHex = (hex && hex.trim()) || '#111111';
  const existing = list.find((c) => c.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    existing.hex = cleanHex;
    saveColors(list);
    return existing;
  }
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('color-' + Date.now());
  const item = { id, name: cleanName, hex: cleanHex };
  list.push(item);
  saveColors(list);
  return item;
}

export function deleteColor(idOrName) {
  const list = getColors();
  const next = list.filter((c) => c.id !== idOrName && c.name.toLowerCase() !== idOrName.toLowerCase());
  saveColors(next);
  return next;
}

export function syncCustomersFromOrders() {
  const orders = getOrders() || [];
  const list = readSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, []) || [];
  let modified = false;

  for (const o of orders) {
    if (!o.customer || !o.customer.phone) continue;
    const cleanPhone = String(o.customer.phone).replace(/\D/g, '').slice(-11);
    if (!cleanPhone || cleanPhone.length < 10) continue;

    let existing = list.find((c) => String(c.phone).replace(/\D/g, '').slice(-11) === cleanPhone);
    const myOrders = orders.filter((x) => {
      if (x.status === 'cancelled') return false;
      const xPhone = String(x.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return xPhone === cleanPhone;
    });
    const deliveredOrders = myOrders.filter((x) => x.status === 'delivered');
    const totalSpent = deliveredOrders.reduce((s, x) => s + (Number(x.total) || 0), 0);
    const sorted = [...myOrders].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const latestOrder = sorted[0];
    const earliestOrder = sorted[sorted.length - 1];

    if (!existing) {
      existing = {
        id: 'cust_' + cleanPhone,
        phone: o.customer.phone,
        name: o.customer.name || 'Customer',
        email: o.customer.email || '',
        ordersCount: myOrders.length,
        totalSpent,
        savedAddress: o.customer.address ? {
          address: o.customer.address,
          district: o.customer.district || '',
          thana: o.customer.thana || '',
          area: o.customer.area || 'outside'
        } : null,
        createdAt: earliestOrder?.createdAt || o.createdAt || new Date().toISOString(),
        lastOrderAt: latestOrder?.createdAt || o.createdAt || new Date().toISOString(),
        welcomeCouponUsed: myOrders.some((x) => String(x.coupon || '').toUpperCase() === 'WELCOME5'),
      };
      list.push(existing);
      modified = true;
    } else {
      let upd = false;
      if (!existing.name && o.customer.name) { existing.name = o.customer.name; upd = true; }
      if (!existing.email && o.customer.email) { existing.email = o.customer.email; upd = true; }
      if (!existing.savedAddress && o.customer.address) {
        existing.savedAddress = {
          address: o.customer.address,
          district: o.customer.district || '',
          thana: o.customer.thana || '',
          area: o.customer.area || 'outside'
        };
        upd = true;
      }
      if (existing.ordersCount !== myOrders.length) { existing.ordersCount = myOrders.length; upd = true; }
      if (existing.totalSpent !== totalSpent) { existing.totalSpent = totalSpent; upd = true; }
      if (latestOrder && existing.lastOrderAt !== latestOrder.createdAt) { existing.lastOrderAt = latestOrder.createdAt; upd = true; }
      if (upd) modified = true;
    }
  }

  if (modified) {
    writeSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, list, 'customers', BACKUP_CUSTOMERS);
  }
  return list;
}

export function getCustomers() {
  const map = new Map();
  const getPhoneKey = (c) => {
    if (!c) return '';
    const p = String(c.phone || c.id || '').replace(/\D/g, '').slice(-11);
    return p || c.id || '';
  };
  const absorb = (arr) => {
    if (Array.isArray(arr)) {
      arr.forEach((c) => {
        const k = getPhoneKey(c);
        if (k) {
          const prev = map.get(k);
          if (!prev) map.set(k, c);
          else map.set(k, { ...prev, ...c, ordersCount: Math.max(prev.ordersCount || 0, c.ordersCount || 0), totalSpent: Math.max(prev.totalSpent || 0, c.totalSpent || 0) });
        }
      });
    }
  };
  // 1. External safe customers outside git
  try { if (existsSync(EXT_CUSTOMERS)) absorb(JSON.parse(readFileSync(EXT_CUSTOMERS, 'utf8'))); } catch (_) {}
  // 2. Immutable backup
  try { if (existsSync(BACKUP_CUSTOMERS)) absorb(JSON.parse(readFileSync(BACKUP_CUSTOMERS, 'utf8'))); } catch (_) {}
  // 3. Standard customers
  try { if (existsSync(CUSTOMERS)) absorb(JSON.parse(readFileSync(CUSTOMERS, 'utf8'))); } catch (_) {}
  // 4. Persistent customers
  try { if (existsSync(PERSISTENT_CUSTOMERS)) absorb(JSON.parse(readFileSync(PERSISTENT_CUSTOMERS, 'utf8'))); } catch (_) {}

  let list = Array.from(map.values());
  if (list.length === 0) {
    list = syncCustomersFromOrders();
  } else {
    try {
      const jsonStr = JSON.stringify(list, null, 2);
      if (existsSync(dirname(EXT_CUSTOMERS))) writeFileSync(EXT_CUSTOMERS, jsonStr);
      writeFileSync(PERSISTENT_CUSTOMERS, jsonStr);
      writeFileSync(CUSTOMERS, jsonStr);
      writeFileSync(BACKUP_CUSTOMERS, jsonStr);
    } catch (_) {}
  }
  return list;
}

export function saveCustomers(list) {
  writeSafe(EXT_CUSTOMERS, PERSISTENT_CUSTOMERS, CUSTOMERS, list, 'customers', BACKUP_CUSTOMERS);
  return list;
}

export function getCustomerByPhone(phone) {
  if (!phone) return null;
  const clean = String(phone).replace(/\D/g, '').slice(-11);
  return getCustomers().find((c) => String(c.phone).replace(/\D/g, '').slice(-11) === clean) || null;
}

export function saveCustomer(cust) {
  if (!cust || !cust.phone) return null;
  const list = getCustomers();
  const clean = String(cust.phone).replace(/\D/g, '').slice(-11);
  const idx = list.findIndex((c) => String(c.phone).replace(/\D/g, '').slice(-11) === clean);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...cust, updatedAt: new Date().toISOString() };
    saveCustomers(list);
    return list[idx];
  } else {
    const item = { ...cust, createdAt: cust.createdAt || new Date().toISOString() };
    list.unshift(item);
    saveCustomers(list);
    return item;
  }
}

// Persistent Storage Protection Initializer (Called on server startup)
export function initStorageProtection() {
  try {
    const cat = getCatalog();
    const orders = getOrders();
    const settings = getSettings();
    syncCustomersFromOrders();
    const customers = getCustomers();
    console.log(`[StorageProtection] Live data secured. Safe directory: ${EXTERNAL_DIR}`);
    console.log(`[StorageProtection] Data counts: Products: ${(cat.products || []).length}, Categories: ${(cat.categories || []).length}, Orders: ${orders.length}, Customers: ${customers.length}, Store: ${settings.storeName}`);
    
    // Create an automatic startup snapshot
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = join(BACKUPS_DIR, `startup_snapshot_${ts}.json`);
    writeFileSync(snapshotPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      productsCount: (cat.products || []).length,
      categoriesCount: (cat.categories || []).length,
      ordersCount: orders.length,
      customersCount: customers.length,
      storeName: settings.storeName
    }, null, 2));

    // Prune snapshots older than 30 days
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    const files = readdirSync(BACKUPS_DIR);
    for (const f of files) {
      if (f.startsWith('startup_snapshot_') && f.endsWith('.json')) {
        const full = join(BACKUPS_DIR, f);
        try {
          const stats = statSync(full);
          if (now - stats.mtimeMs > maxAge) {
            unlinkSync(full);
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error('[StorageProtection] Startup check error:', err.message);
  }
}
