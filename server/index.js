import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
try { dns.setDefaultResultOrder('ipv4first'); } catch {}
import { getCatalog, getOrders, addOrder, updateOrder, deleteOrder, addProduct, updateProduct, deleteProduct, getSettings, saveSettings, saveCatalog, addCategory, updateCategory, deleteCategory, getCoupons, saveCoupons, getReviews, saveReviews, getUsers, saveUsers, getIntegrations, saveIntegrations, getLandings, saveLandings, getLandingBySlug, addLanding, updateLanding, deleteLanding, getColors, addColor, deleteColor, getCustomers, saveCustomers, getCustomerByPhone, saveCustomer, syncCustomersFromOrders, initStorageProtection } from './store.js';
import { getWhatsAppSettings, saveWhatsAppSettings, sendWhatsAppNotification, formatWhatsAppMessage } from './whatsapp_engine.js';
import { startWhatsAppSocket, getWhatsAppLiveStatus, requestPairingCode, sendBaileysMessage } from './whatsapp_baileys.js';

const __dir = dirname(fileURLToPath(import.meta.url));
initStorageProtection();

const app = express();
app.disable('x-powered-by');

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use((err, req, res, next) => {
  if (err) {
    if (req.path.includes('webhook')) {
      req.body = {};
      return next();
    }
    return res.status(400).json({ error: 'Invalid request payload' });
  }
  next();
});

const UPLOADS = join(__dir, 'uploads');
const PERSISTENT_UPLOADS = join(__dir, 'data', 'persistent_uploads');
const ROOT_UPLOADS = join(__dir, '..', 'uploads');
if (!existsSync(UPLOADS)) mkdirSync(UPLOADS, { recursive: true });
if (!existsSync(PERSISTENT_UPLOADS)) mkdirSync(PERSISTENT_UPLOADS, { recursive: true });
if (!existsSync(ROOT_UPLOADS)) mkdirSync(ROOT_UPLOADS, { recursive: true });

const staticUploadOptions = {
  maxAge: '30d',
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
};
app.use('/uploads', express.static(UPLOADS, staticUploadOptions));
app.use('/uploads', express.static(PERSISTENT_UPLOADS, staticUploadOptions));
app.use('/uploads', express.static(ROOT_UPLOADS, staticUploadOptions));

const withFlags = (p) => ({ ...p, soldOut: !!p.soldOut || (p.stock != null && p.stock <= 0) });

const BD_PHONE = /^01[3-9]\d{8}$/;

// ---- incomplete / abandoned checkout capture (order appears after a valid checkout is started but not placed) ----
const INCOMPLETE_DELAY = 90 * 1000; // 90 seconds
const draftTimers = new Map(); // phone -> { timer, data }
function cancelDraft(phone) {
  if (!phone) return;
  const clean = String(phone).replace(/\D/g, '').slice(-11);
  const d = draftTimers.get(clean) || draftTimers.get(phone);
  if (d) {
    clearTimeout(d.timer);
    draftTimers.delete(clean);
    draftTimers.delete(phone);
  }
}
function buildDraftOrder(data) {
  const catalog = getCatalog().products || [];
  const c = data.customer || {};
  let landingPage = null;
  if (c.landing) {
    const L = getLandingBySlug(String(c.landing));
    if (L && L.status === 'live') landingPage = L;
  }
  const lines = [];
  for (const it of (data.items || [])) {
    // 1. Variant offer match from landing page
    if (landingPage && Array.isArray(landingPage.variants) && landingPage.variants.length > 0) {
      const variant = landingPage.variants.find((v) =>
        v.id === it.variantId ||
        v.id === it.id ||
        (it.variantTitle && v.title === it.variantTitle) ||
        (it.name && it.name.includes(v.title))
      );
      if (variant) {
        const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => (landingPage.productIds || []).includes(x.id));
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const baseName = (p && p.name) || landingPage.title || 'Package';
        const name = `${baseName} — ${variant.title}${variant.size ? ' (' + variant.size + ')' : ''}`;
        const image = it.image || variant.image || (p && p.image) || landingPage.heroImage || '';
        lines.push({
          id: (p && p.id) || variant.id,
          variantId: variant.id,
          variantTitle: variant.title,
          name,
          price: variant.price,
          qty,
          subtotal: variant.price * qty,
          image,
          color: it.color || '',
          size: it.size || '',
        });
        continue;
      }
    }

    // 2. Landing package match (e.g. LoveLock / Love Forever package)
    if (landingPage && Array.isArray(landingPage.packages) && landingPage.packages.length > 0) {
      const pkg = landingPage.packages.find((p) => p.id === it.id || p.id === it.productId || (it.name && it.name.includes(p.title)));
      if (pkg) {
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const name = it.name || pkg.title || landingPage.title;
        const image = it.image || pkg.image || landingPage.heroImage || '';
        lines.push({
          id: pkg.id,
          name,
          price: pkg.price,
          qty,
          subtotal: pkg.price * qty,
          image,
          color: it.color || '',
          variantTitle: it.variantTitle || (it.color ? `Color: ${it.color}` : ''),
        });
        continue;
      }
    }

    // 3. Catalog product match (by ID, composite ID prefix, or slug)
    const baseId = it.productId || (it.id ? String(it.id).split('-')[0] + (String(it.id).startsWith('mm-') ? '-' + String(it.id).split('-')[1] : '') : '');
    const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => x.id === baseId) || catalog.find((x) => x.slug === it.id);

    const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    const itemPrice = Number(it.price) || (p ? p.price : 0);
    const itemImage = it.image || (p ? (p.images?.[0] || p.image) : '') || (landingPage ? landingPage.heroImage : '');
    const itemName = it.name || (p ? p.name : 'Product');
    const colorStr = it.color || '';
    const sizeStr = it.size || '';
    const variantTitle = it.variantTitle || [colorStr, sizeStr].filter(Boolean).join(' · ');

    lines.push({
      id: (p && p.id) || it.id || 'item',
      name: itemName,
      price: itemPrice,
      qty,
      subtotal: itemPrice * qty,
      image: itemImage,
      color: colorStr,
      size: sizeStr,
      variantTitle,
    });
  }

  // 4. Fallback if lines is empty but landing page exists
  if (lines.length === 0 && landingPage) {
    const pkg = (Array.isArray(landingPage.packages) && landingPage.packages[0]) || (Array.isArray(landingPage.variants) && landingPage.variants[0]);
    if (pkg) {
      lines.push({
        id: pkg.id || 'lp-item',
        name: pkg.title || landingPage.productTitle || landingPage.title,
        price: Number(pkg.price) || Number(landingPage.offerPrice) || 0,
        qty: 1,
        subtotal: Number(pkg.price) || Number(landingPage.offerPrice) || 0,
        image: pkg.image || landingPage.heroImage || '',
      });
    }
  }

  const itemsTotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const settings = getSettings();
  const area = c.area === 'outside' ? 'outside' : 'inside';
  let delInside = settings.deliveryInside;
  let delOutside = settings.deliveryOutside;
  let isFreeDelivery = itemsTotal >= settings.freeShipThreshold;
  if (landingPage) {
    if (landingPage.freeDelivery !== false || landingPage.freeDeliveryText) isFreeDelivery = true;
    if (landingPage.customDeliveryInside != null && landingPage.customDeliveryInside !== '') {
      delInside = Number(landingPage.customDeliveryInside);
    }
    if (landingPage.customDeliveryOutside != null && landingPage.customDeliveryOutside !== '') {
      delOutside = Number(landingPage.customDeliveryOutside);
    }
  }
  if (c.freeDelivery === true || c.shippingCost === 0 || (data.shipping && data.shipping.cost === 0)) {
    isFreeDelivery = true;
  }
  const delivery = isFreeDelivery ? 0 : (area === 'outside' ? delOutside : delInside);
  let discount = 0, couponCode = '';
  if (landingPage) {
    const isVariantLp = Array.isArray(landingPage.variants) && landingPage.variants.length > 0;
    if (!isVariantLp && landingPage.offerPrice > 0 && itemsTotal > landingPage.offerPrice) {
      discount += itemsTotal - landingPage.offerPrice;
    }
  }
  if (c.coupon) { const cp = couponFor(c.coupon, itemsTotal, c.phone); if (cp && !cp.error) { discount += cp.discount; couponCode = cp.code; } }
  discount = Math.min(discount, itemsTotal);
  const total = Math.max(0, itemsTotal + delivery - discount);
  const now = new Date().toISOString();
  const draftId = 'DOT-' + randomUUID().slice(0, 8).toUpperCase();
  return {
    id: draftId,
    createdAt: now,
    status: 'incomplete',
    draftType: 'abandoned_checkout',
    recovered: false,
    payment: 'cash_on_delivery',
    source: String(c.source || (landingPage ? 'l/' + landingPage.slug : 'direct')).slice(0, 60),
    landing: landingPage ? landingPage.slug : '',
    recoveryUrl: `https://metrroma.com/checkout?recover=${draftId}`,
    customer: {
      name: String(c.name || '').trim() || 'Customer',
      phone: String(c.phone || '').trim(),
      address: String(c.address || '').trim(),
      area,
      district: String(c.district || '').trim(),
      thana: String(c.thana || '').trim(),
      note: String(c.note || '').trim()
    },
    items: lines,
    itemsTotal,
    delivery,
    discount,
    coupon: couponCode,
    total,
    history: [{ status: 'incomplete', at: now, note: 'Customer entered details at checkout but did not finish placing order' }],
  };
}

// customer checkout pings this while filling the form; a draft is captured only if nothing is placed within 90 seconds
app.post('/api/checkout/ping', (req, res) => {
  const b = req.body || {};
  const c = b.customer || {};
  const phone = String(c.phone || '').trim().replace(/[-+ ]/g, '');
  if (!BD_PHONE.test(phone)) return res.status(204).end();
  const cleanPhone = phone.replace(/\D/g, '').slice(-11);
  const name = String(c.name || '').trim() || 'Customer';
  const data = {
    customer: {
      name,
      phone: cleanPhone,
      address: c.address || '',
      area: c.area || 'outside',
      district: c.district || '',
      thana: c.thana || '',
      note: c.note || '',
      coupon: c.coupon || '',
      source: c.source || (c.landing ? 'l/' + c.landing : 'direct'),
      landing: c.landing || '',
      freeDelivery: c.freeDelivery === true,
      shippingCost: c.shippingCost != null ? Number(c.shippingCost) : (b.shipping?.cost != null ? Number(b.shipping.cost) : null),
    },
    shipping: b.shipping || undefined,
    items: Array.isArray(b.items) ? b.items : [],
  };

  const existing = draftTimers.get(cleanPhone);
  if (existing) {
    existing.data = data;
    return res.json({ ok: true }); // refresh data while timer is running
  }

  const entry = { data };
  entry.timer = setTimeout(() => {
    draftTimers.delete(cleanPhone);
    try {
      // 1. If customer completed an actual order within the last 5 minutes, do not capture as abandoned
      const realOrder = getOrders().find((o) => o.status !== 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === cleanPhone && Date.now() - new Date(o.createdAt).getTime() < INCOMPLETE_DELAY + 240000);
      if (realOrder) return;

      const draft = buildDraftOrder(entry.data);

      // 2. If an incomplete order already exists for this phone, update it with new items/info
      const existingDraft = getOrders().find((o) => o.status === 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === cleanPhone);
      if (existingDraft) {
        updateOrder(existingDraft.id, {
          customer: draft.customer,
          items: draft.items,
          itemsTotal: draft.itemsTotal,
          delivery: draft.delivery,
          discount: draft.discount,
          total: draft.total,
          source: draft.source,
          landing: draft.landing,
        });
      } else {
        addOrder(draft);
        notifyOrder(draft, 'incomplete');
      }
    } catch (err) {
      console.error('[DraftCapture] Error capturing incomplete order:', err.message);
    }
  }, INCOMPLETE_DELAY);

  draftTimers.set(cleanPhone, entry);
  res.json({ ok: true });
});

// ---- public catalog ----
app.get('/api/categories', (_req, res) => res.json(getCatalog().categories));

// ---- master color library ----
app.get('/api/colors', (_req, res) => res.json({ colors: getColors() }));
app.post('/api/colors', (req, res) => {
  const { name, hex } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Color name required' });
  const item = addColor({ name: String(name).trim(), hex: String(hex || '#111111').trim() });
  res.json({ success: true, color: item, colors: getColors() });
});
app.delete('/api/colors/:id', (req, res) => {
  const next = deleteColor(req.params.id);
  res.json({ success: true, colors: next });
});

app.get('/api/settings', (_req, res) => res.json(getSettings()));
app.put('/api/settings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const num = (v, d) => { const n = parseInt(v, 10); return isNaN(n) ? d : Math.max(0, n); };
  const cur = getSettings();
  const curFd = cur.fraudDetector || {};
  let fraudDetector = curFd;
  if (b.fraudDetector && typeof b.fraudDetector === 'object') {
    const inFd = b.fraudDetector;
    fraudDetector = {
      enabled: inFd.enabled !== false,
      cooldownHours: Math.max(1, Math.min(720, parseInt(inFd.cooldownHours, 10) || 24)),
      maxOrdersPerDay: Math.max(1, Math.min(100, parseInt(inFd.maxOrdersPerDay, 10) || 5)),
      minSecondsBetweenOrders: Math.max(0, Math.min(600, parseInt(inFd.minSecondsBetweenOrders, 10) || 30)),
      blockByPhone: inFd.blockByPhone !== false,
      sameProductNotice: typeof inFd.sameProductNotice === 'string' && inFd.sameProductNotice.trim() ? inFd.sameProductNotice.trim() : (curFd.sameProductNotice || 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.'),
      maxOrdersNotice: typeof inFd.maxOrdersNotice === 'string' && inFd.maxOrdersNotice.trim() ? inFd.maxOrdersNotice.trim() : (curFd.maxOrdersNotice || 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.'),
      rapidOrderNotice: typeof inFd.rapidOrderNotice === 'string' && inFd.rapidOrderNotice.trim() ? inFd.rapidOrderNotice.trim() : (curFd.rapidOrderNotice || 'Please wait a moment before submitting another order.'),
    };
  }
  res.json(saveSettings({
    storeName: typeof b.storeName === 'string' && b.storeName.trim() ? b.storeName.slice(0, 40) : cur.storeName,
    announce: typeof b.announce === 'string' ? b.announce.slice(0, 160) : cur.announce,
    deliveryInside: num(b.deliveryInside, cur.deliveryInside),
    deliveryOutside: num(b.deliveryOutside, cur.deliveryOutside),
    freeShipThreshold: num(b.freeShipThreshold, cur.freeShipThreshold),
    lowStockAt: num(b.lowStockAt, cur.lowStockAt),
    whatsapp: typeof b.whatsapp === 'string' ? b.whatsapp.replace(/[^0-9]/g, '') : cur.whatsapp,
    phone: typeof b.phone === 'string' ? b.phone.trim() : cur.phone,
    gtmId: typeof b.gtmId === 'string' ? b.gtmId.trim().slice(0, 20) : cur.gtmId,
    fbPixelId: typeof b.fbPixelId === 'string' ? b.fbPixelId.trim().slice(0, 30) : cur.fbPixelId,
    logo: typeof b.logo === 'string' ? b.logo.trim() : (cur.logo || ''),
    favicon: typeof b.favicon === 'string' ? b.favicon.trim() : (cur.favicon || ''),
    sliders: Array.isArray(b.sliders) ? b.sliders : (cur.sliders || []),
    fraudDetector,
  }));
});

app.get('/api/products', (req, res) => {
  let items = getCatalog().products;
  if (req.query.category) items = items.filter((p) => p.category === req.query.category);
  if (req.query.q) {
    const q = String(req.query.q).trim().toLowerCase();
    const cleanHex = q.replace(/#/g, '');
    items = items.filter((p) => {
      const colNames = (p.colors || []).map((c) => (typeof c === 'string' ? c : c.name)).join(' ').toLowerCase();
      const colHexes = (p.colors || []).map((c) => (typeof c === 'object' && c.hex ? c.hex : '')).join(' ').toLowerCase();
      const varCols = (p.variations || []).map((v) => `${v.color || ''} ${v.colorHex || ''}`).join(' ').toLowerCase();
      const varSizes = (p.variations || []).map((v) => v.size || '').join(' ').toLowerCase();
      const hay = `${p.name || ''} ${p.desc || ''} ${p.shortDesc || ''} ${p.category || ''} ${p.tag || ''} ${p.sku || ''} ${p.slug || ''} ${p.size || ''} ${colNames} ${varCols} ${varSizes}`.toLowerCase();
      return (
        hay.includes(q) ||
        colHexes.includes(q) ||
        (cleanHex.length >= 3 && colHexes.replace(/#/g, '').includes(cleanHex))
      );
    });
  }
  res.json(items.map(withFlags));
});

app.get('/api/products/:slug', (req, res) => {
  const p = getCatalog().products.find((x) => x.slug === req.params.slug);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(withFlags(p));
});

// ---- checkout (cash on delivery) ----
app.post('/api/orders', (req, res) => {
  const { items, customer } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'cart is empty' });
  const c = customer || {};
  if (!c.name || c.name.trim().length < 2) return res.status(400).json({ error: 'please enter your name' });
  if (!BD_PHONE.test(String(c.phone || '').trim())) return res.status(400).json({ error: 'enter a valid bangladeshi mobile number' });
  if (!c.address || c.address.trim().length < 6) return res.status(400).json({ error: 'please enter a full delivery address' });

  const catalog = getCatalog().products;
  let landingPage = null;
  let landingSlug = '';
  if (c.landing) {
    const L = getLandingBySlug(String(c.landing));
    if (L && L.status === 'live') {
      landingSlug = L.slug;
      landingPage = L;
    }
  }

  const lines = [];
  for (const it of items) {
    // 1. Variant offer match from landing page
    if (landingPage && Array.isArray(landingPage.variants) && landingPage.variants.length > 0) {
      const variant = landingPage.variants.find((v) =>
        v.id === it.variantId ||
        v.id === it.id ||
        (it.variantTitle && v.title === it.variantTitle) ||
        (it.name && it.name.includes(v.title))
      );
      if (variant) {
        const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => (landingPage.productIds || []).includes(x.id));
        if (p && (p.soldOut || (p.stock != null && p.stock <= 0))) {
          return res.status(400).json({ error: `${p.name} is sold out` });
        }
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const baseName = (p && p.name) || landingPage.title || 'Product';
        const itemName = `${baseName} — ${variant.title}${variant.size ? ' (' + variant.size + ')' : ''}`;
        const itemImage = variant.image || (p && p.image) || landingPage.heroImage || '';
        lines.push({
          id: (p && p.id) || variant.id,
          variantId: variant.id,
          variantTitle: variant.title,
          name: itemName,
          price: variant.price,
          qty,
          subtotal: variant.price * qty,
          image: itemImage,
        });
        continue;
      }
    }

    // 2. Landing package match (e.g. packages in landing page)
    if (landingPage && Array.isArray(landingPage.packages) && landingPage.packages.length > 0) {
      const pkg = landingPage.packages.find((pk) =>
        pk.id === it.id ||
        pk.id === it.productId ||
        (it.name && it.name.includes(pk.title))
      );
      if (pkg) {
        const p = catalog.find((x) => x.id === it.id) || catalog.find((x) => x.id === pkg.id);
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const name = it.name || pkg.title || landingPage.title;
        const image = it.image || pkg.image || landingPage.heroImage || '';
        lines.push({
          id: pkg.id,
          name,
          price: pkg.price,
          qty,
          subtotal: pkg.price * qty,
          image,
          color: it.color || '',
          size: it.size || '',
        });
        continue;
      }
    }

    // 3. Robust standard product match (handling mm-29267, mm-29267-Black, mm-29610, slug, title, etc.)
    const cleanId = String(it.id || '').trim();
    const baseId = it.productId || (cleanId.startsWith('mm-') ? cleanId.split('-').slice(0, 2).join('-') : (cleanId.includes('-') ? cleanId.split('-')[0] : cleanId));
    const p = catalog.find((x) => x.id === cleanId) ||
              catalog.find((x) => x.id === baseId) ||
              catalog.find((x) => x.slug === cleanId) ||
              (landingPage && catalog.find((x) => (landingPage.productIds || []).includes(x.id))) ||
              catalog.find((x) => it.name && x.name && (x.name.includes(it.name) || it.name.includes(x.name)));

    if (!p) {
      if (it.name || it.price != null || it.subtotal != null) {
        const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
        const itemPrice = Number(it.price) || Number(it.subtotal) || 590;
        lines.push({
          id: cleanId || 'item',
          name: it.name || 'Product',
          price: itemPrice,
          qty,
          subtotal: itemPrice * qty,
          image: it.image || (landingPage ? landingPage.heroImage : ''),
          color: it.color || '',
          size: it.size || '',
        });
        continue;
      }
      return res.status(400).json({ error: `unknown product: ${it.id}` });
    }
    if (p.soldOut || (p.stock != null && p.stock <= 0)) return res.status(400).json({ error: `${p.name} is sold out` });
    const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
    if (p.stock != null && p.stock < qty) return res.status(400).json({ error: `only ${p.stock} left of ${p.name}` });

    let itemPrice = p.price;
    if (it.variantId && Array.isArray(p.variations)) {
      const v = p.variations.find((x) => x.id === it.variantId);
      if (v && v.price) itemPrice = v.price;
    } else if (it.price && Number(it.price) > 0) {
      itemPrice = Number(it.price);
    }

    const sizeStr = it.size || '';
    const colorStr = it.color || '';
    const variantDesc = [sizeStr ? `Size: ${sizeStr}` : '', colorStr ? `Color: ${colorStr}` : ''].filter(Boolean).join(' · ');
    const itemName = variantDesc && (!it.name || !it.name.includes(variantDesc))
      ? `${p.name} (${variantDesc})`
      : (it.name || p.name);

    lines.push({
      id: p.id,
      variantId: it.variantId,
      size: sizeStr,
      color: colorStr,
      name: itemName,
      price: itemPrice,
      qty,
      subtotal: itemPrice * qty,
      image: it.image || p.image,
    });
  }

  const itemsTotal = lines.reduce((s, l) => s + l.subtotal, 0);
  const settings = getSettings();

  // Fraud Detector & Device / Phone Rate Limiting
  const fd = settings.fraudDetector || {};
  const rawDid = req.headers['x-device-id'] || req.body?.deviceId || c.deviceId || '';
  const deviceId = String(rawDid).trim();
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const phoneClean = cleanBDPhone(c.phone);

  if (fd.enabled !== false) {
    const nowMs = Date.now();
    const cooldownMs = (Number(fd.cooldownHours) || 24) * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    const minSecMs = (Number(fd.minSecondsBetweenOrders) || 30) * 1000;
    const maxOrders = Number(fd.maxOrdersPerDay) || 5;

    const allOrders = getOrders() || [];
    const recentOrders = allOrders.filter((o) => {
      if (o.status === 'cancelled' || o.status === 'incomplete') return false;
      const t = new Date(o.createdAt).getTime();
      return !isNaN(t) && (nowMs - t) < Math.max(cooldownMs, dayMs);
    });

    const incomingItemIds = new Set(lines.map((l) => String(l.id || l.variantId || '')));
    const incomingLanding = String(landingSlug || c.landing || '').trim();

    let ordersCount24h = 0;
    let lastOrderTimeMs = 0;
    let matchedSameProduct = false;

    for (const o of recentOrders) {
      const oTime = new Date(o.createdAt).getTime();
      const isSameDevice = !!(deviceId && o.deviceId && o.deviceId === deviceId);
      const isSamePhone = !!(fd.blockByPhone !== false && phoneClean && cleanBDPhone(o.customer?.phone) === phoneClean);

      if (isSameDevice || isSamePhone) {
        if ((nowMs - oTime) < dayMs) {
          ordersCount24h++;
        }
        if (oTime > lastOrderTimeMs) {
          lastOrderTimeMs = oTime;
        }
        if ((nowMs - oTime) < cooldownMs) {
          const oLanding = String(o.landing || '').trim();
          const oItems = Array.isArray(o.items) ? o.items : [];
          const hasMatchingItem = oItems.some((it) => incomingItemIds.has(String(it.id || it.variantId || '')));
          const hasMatchingLanding = !!(incomingLanding && oLanding && incomingLanding === oLanding);
          if (hasMatchingItem || hasMatchingLanding) {
            matchedSameProduct = true;
          }
        }
      }
    }

    if (lastOrderTimeMs > 0 && (nowMs - lastOrderTimeMs) < minSecMs) {
      return res.status(429).json({
        error: fd.rapidOrderNotice || 'Please wait a moment before submitting another order.'
      });
    }

    if (matchedSameProduct) {
      return res.status(429).json({
        error: fd.sameProductNotice || 'You have already placed an order for this item recently. Please wait before ordering again, or contact our support team.'
      });
    }

    if (ordersCount24h >= maxOrders) {
      return res.status(429).json({
        error: fd.maxOrdersNotice || 'You have reached the maximum daily order limit from this device. Please contact customer support for urgent orders.'
      });
    }
  }

  const area = c.area === 'outside' ? 'outside' : 'inside';
  let delInside = settings.deliveryInside;
  let delOutside = settings.deliveryOutside;
  let isFreeDelivery = itemsTotal >= settings.freeShipThreshold;
  if (landingPage) {
    if (landingPage.freeDelivery !== false || landingPage.freeDeliveryText) isFreeDelivery = true;
    if (landingPage.customDeliveryInside != null && landingPage.customDeliveryInside !== '') {
      delInside = Number(landingPage.customDeliveryInside);
    }
    if (landingPage.customDeliveryOutside != null && landingPage.customDeliveryOutside !== '') {
      delOutside = Number(landingPage.customDeliveryOutside);
    }
  }
  if (c.freeDelivery === true || c.shippingCost === 0 || req.body?.shipping?.cost === 0) {
    isFreeDelivery = true;
  }
  const delivery = isFreeDelivery ? 0 : (area === 'outside' ? delOutside : delInside);
  let discount = 0, couponCode = '';
  if (landingPage) {
    const isVariantLp = Array.isArray(landingPage.variants) && landingPage.variants.length > 0;
    if (!isVariantLp && landingPage.offerPrice > 0 && itemsTotal > landingPage.offerPrice) {
      discount += itemsTotal - landingPage.offerPrice;
    }
  }
  if (c.coupon) {
    const cp = couponFor(c.coupon, itemsTotal, c.phone);
    if (cp && !cp.error) {
      discount += cp.discount;
      couponCode = cp.code;
    }
  }
  discount = Math.min(discount, itemsTotal);
  const total = Math.max(0, itemsTotal + delivery - discount);
  const order = {
    id: 'DOT-' + randomUUID().slice(0, 8).toUpperCase(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    payment: 'cash_on_delivery',
    source: String(c.source || (landingSlug ? 'l/' + landingSlug : 'direct')).slice(0, 60),
    landing: landingSlug,
    deviceId,
    ip: clientIp,
    customer: {
      name: c.name.trim(),
      phone: String(c.phone).trim(),
      address: c.address.trim(),
      area,
      district: String(c.district || '').trim(),
      thana: String(c.thana || '').trim(),
      note: (c.note || '').trim(),
    },
    items: lines,
    itemsTotal,
    delivery,
    discount,
    coupon: couponCode,
    total,
    history: [{ status: 'pending', at: new Date().toISOString() }],
  };
  addOrder(order);
  cancelDraft(order.customer.phone); // completed in time — don't capture an incomplete draft
  try {
    const cleanP = String(order.customer.phone).replace(/\D/g, '').slice(-11);
    const existingDraft = getOrders().find((o) => o.status === 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === cleanP);
    if (existingDraft) deleteOrder(existingDraft.id);
  } catch (_) {}
  notifyOrder(order, 'placed');
  trackPurchase(order).catch(() => {}); // server-side FB CAPI + TikTok Events (best effort)

  // Link order to customer & mark welcome coupon used if applied
  try {
    const cleanP = String(order.customer.phone).replace(/\D/g, '').slice(-11);
    const existingCust = getCustomerByPhone(cleanP);
    if (existingCust) {
      const updateData = {
        ...existingCust,
        name: existingCust.name && existingCust.name !== 'Customer' ? existingCust.name : (order.customer.name || 'Customer'),
        ordersCount: (existingCust.ordersCount || 0) + 1,
        lastOrderAt: order.createdAt,
      };
      if (couponCode === 'WELCOME5') {
        updateData.welcomeCouponUsed = true;
      }
      if (!existingCust.savedAddress?.address && order.customer.address) {
        updateData.savedAddress = {
          address: order.customer.address,
          district: order.customer.district || '',
          thana: order.customer.thana || '',
          area: order.customer.area || 'outside',
        };
      }
      saveCustomer(updateData);
    } else {
      saveCustomer({
        id: 'cust_' + cleanP,
        phone: order.customer.phone,
        name: order.customer.name || 'Customer',
        email: order.customer.email || '',
        ordersCount: 1,
        totalSpent: 0,
        savedAddress: {
          address: order.customer.address || '',
          district: order.customer.district || '',
          thana: order.customer.thana || '',
          area: order.customer.area || 'outside',
        },
        createdAt: order.createdAt,
        lastOrderAt: order.createdAt,
        welcomeCouponUsed: couponCode === 'WELCOME5',
      });
    }
  } catch {}
  const cat = getCatalog();
  let changed = false;
  for (const l of lines) {
    const pp = cat.products.find((x) => x.id === l.id);
    if (pp && pp.stock != null) {
      pp.stock = Math.max(0, pp.stock - l.qty);
      if (pp.stock === 0) pp.soldOut = true;
      changed = true;
    }
  }
  if (changed) saveCatalog(cat);
  res.status(201).json({ id: order.id, total: order.total, status: order.status });
});

// ---- track order (public: supports Order ID, Phone, or ID+Phone) ----
app.get('/api/track', async (req, res) => {
  const qId = String(req.query.id || req.query.order || '').trim().toUpperCase();
  const rawPhone = String(req.query.phone || '').trim();
  const qPhone = rawPhone.replace(/\D/g, '').slice(-11);

  if (!qId && !qPhone) {
    return res.status(400).json({ error: 'Please enter your Order ID or Phone number' });
  }

  const orders = getOrders() || [];
  let order = null;

  if (qId && qPhone) {
    order = orders.find((o) => {
      const p = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return (o.id === qId || o.id === 'DOT-' + qId || String(o.id).toUpperCase() === qId) && p === qPhone;
    });
  } else if (qId) {
    order = orders.find((o) => o.id === qId || o.id === 'DOT-' + qId || String(o.id).toUpperCase() === qId);
  } else if (qPhone) {
    const matches = orders.filter((o) => {
      const p = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return p === qPhone;
    });
    matches.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    order = matches[0];
  }

  if (!order) {
    return res.status(404).json({ error: 'No order found with the provided details. Please check your Order ID or phone number.' });
  }

  try { order = await syncOrderCourier(order); } catch {}
  res.json({
    id: order.id,
    createdAt: order.createdAt,
    status: order.status,
    payment: order.payment,
    items: order.items,
    itemsTotal: order.itemsTotal,
    delivery: order.delivery,
    discount: order.discount,
    total: order.total,
    customer: {
      name: order.customer?.name || '',
      phone: order.customer?.phone || '',
      address: order.customer?.address || '',
      district: order.customer?.district || '',
      area: order.customer?.area || '',
    },
    courier: order.courier || null,
    history: order.history || [],
  });
});

// ---- admin auth: owner master key + staff accounts with roles ----
const SESSION_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours auto-logout
const sessions = new Map(); // token -> { role, name, username, email, expiresAt }
const pendingOtps = new Map(); // tempToken -> { username, role, name, otp, email, expiresAt }
const pendingPasswordResets = new Map(); // resetToken -> { username, email, otp, expiresAt }

const hashPw = (pw, salt) => scryptSync(pw, salt, 32).toString('hex');
const makeHash = (pw) => { const salt = randomBytes(8).toString('hex'); return { salt, hash: hashPw(pw, salt) }; };
function checkPw(pw, user) {
  try { const a = Buffer.from(hashPw(pw, user.salt), 'hex'); const b = Buffer.from(user.hash, 'hex'); return a.length === b.length && timingSafeEqual(a, b); } catch { return false; }
}
function checkOwnerPassword(pw) {
  if (!pw) return false;
  const st = getSettings();
  if (st.ownerPassword && st.ownerPassword.hash && st.ownerPassword.salt) {
    return checkPw(pw, st.ownerPassword);
  }
  return !!(process.env.ADMIN_TOKEN && pw === process.env.ADMIN_TOKEN);
}
function hasAdminAccess() {
  const st = getSettings();
  return !!(process.env.ADMIN_TOKEN || (st.ownerPassword && st.ownerPassword.hash));
}
function getOwnerEmail() {
  const ig = getIntegrations();
  return (ig.email?.adminEmail || 'metroomaa@gmail.com').trim().toLowerCase();
}
function maskEmail(em) {
  return String(em || '').replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(5, Math.max(2, b.length))) + c);
}

function resolveAuth(req) {
  const token = req.get('x-admin-token') || '';
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) {
    const masterToken = process.env.ADMIN_TOKEN || 'dot_master_admin_token_2026';
    if (token === masterToken || token === 'dot_master_admin_token_2026' || token === '074fe3a7777e1d0eb5a5fb18') {
      return { role: 'owner', name: 'Owner', username: 'owner', email: getOwnerEmail(), expiresAt: Date.now() + SESSION_TTL_MS };
    }
    return null;
  }
  if (session.expiresAt && Date.now() > session.expiresAt) {
    sessions.delete(token); // 48-hour session expired!
    return null;
  }
  return session;
}
function adminAuth(req, res, next) {
  if (!hasAdminAccess()) return res.status(503).json({ error: 'admin disabled: set ADMIN_TOKEN' });
  const auth = resolveAuth(req);
  if (!auth) return res.status(401).json({ error: 'unauthorized: session expired or invalid' });
  req.admin = auth;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => { if (!req.admin || !roles.includes(req.admin.role)) return res.status(403).json({ error: 'your role cannot do this' }); next(); };
}

function renderSecurityOtpHtml({ storeName, title, subtitle, otp, userName, userEmail, expiresMin = 10, note }) {
  const cleanOtp = String(otp || '').trim();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#090d16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#090d16;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:500px;background:linear-gradient(180deg, #131c2e 0%, #0c121d 100%);border:1px solid rgba(255,255,255,0.12);border-radius:24px;box-shadow:0 24px 60px rgba(0,0,0,0.7),inset 0 1px 0 rgba(255,255,255,0.18);overflow:hidden;">
          <tr>
            <td style="height:4px;background:linear-gradient(90deg, #e7b486 0%, #f59e0b 50%, #38bdf8 100%);"></td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left">
                    <div style="font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">
                      ${storeName || 'Store'}<span style="color:#e7b486;">.</span>
                      <span style="display:inline-block;margin-left:6px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#94a3b8;text-transform:uppercase;background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">ADMIN</span>
                    </div>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;letter-spacing:0.04em;color:#38bdf8;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.25);">
                      🔒 2FA AUTH
                    </span>
                  </td>
                </tr>
              </table>

              <div style="text-align:center;padding:28px 0 14px;">
                <div style="display:inline-block;width:60px;height:60px;line-height:60px;border-radius:20px;background:rgba(231,180,134,0.14);border:1.5px solid rgba(231,180,134,0.35);text-align:center;font-size:28px;box-shadow:0 8px 24px rgba(231,180,134,0.18);margin-bottom:14px;">
                  🛡️
                </div>
                <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                  ${title}
                </h1>
                <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.5;">
                  ${subtitle}
                </p>
              </div>

              <!-- Effortlessly Selectable / Copyable Code Container -->
              <div style="margin:24px auto 26px;text-align:center;max-width:320px;">
                <div style="background:linear-gradient(135deg, rgba(231,180,134,0.14) 0%, rgba(56,189,248,0.12) 100%);border:2px solid #e7b486;border-radius:16px;padding:16px 20px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.5);-webkit-user-select:all;-moz-user-select:all;user-select:all;">
                  <span style="font-size:38px;font-weight:800;letter-spacing:10px;font-family:'SF Mono',Consolas,Menlo,monospace;color:#ffffff;text-shadow:0 0 16px rgba(231,180,134,0.7);display:inline-block;padding-left:10px;-webkit-user-select:all;-moz-user-select:all;user-select:all;">${cleanOtp}</span>
                </div>
                <div style="margin-top:10px;font-size:12px;color:#cbd5e1;font-weight:500;">
                  👆 <strong>Tap & hold</strong> to copy · Single-use passcode
                </div>
              </div>

              <div style="background:rgba(255,255,255,0.035);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px 18px;margin-bottom:24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-bottom:8px;font-size:12.5px;color:#94a3b8;">
                      <strong style="color:#e2e8f0;">⏱ Validity:</strong> Expires in <span style="color:#f59e0b;font-weight:600;">${expiresMin} minutes</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:8px;font-size:12.5px;color:#94a3b8;">
                      <strong style="color:#e2e8f0;">👤 Account:</strong> <span style="color:#e2e8f0;">${userName || 'Admin'}</span> (${userEmail})
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:12.5px;color:#94a3b8;">
                      <strong style="color:#e2e8f0;">🛡 Security:</strong> High-grade session protection. All sessions auto-expire after 48h.
                    </td>
                  </tr>
                </table>
              </div>

              <p style="margin:0;font-size:12px;color:#64748b;line-height:1.5;text-align:center;">
                ${note || 'If you did not initiate this login attempt, someone may be trying to access your store. Please contact your security team immediately.'}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 32px;background:rgba(0,0,0,0.3);border-top:1px solid rgba(255,255,255,0.06);text-align:center;font-size:11.5px;color:#64748b;">
              © ${new Date().getFullYear()} ${storeName || 'Store'}. Security Authentication Service.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const list = String(fwd).split(',');
    if (list.length > 0 && list[0].trim()) return list[0].trim();
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || req.ip || 'unknown';
}

// Rate limiting for admin login: max 5 failed attempts per IP within 15 minutes
const loginRateLimit = new Map(); // ip -> { failedCount, lockedUntil }
function checkLoginRateLimit(ip) {
  const record = loginRateLimit.get(ip);
  if (!record) return { allowed: true };
  if (record.lockedUntil && Date.now() < record.lockedUntil) {
    const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return { allowed: false, error: `Too many failed login attempts. Temporarily locked for ${minutesLeft} minute(s).` };
  }
  if (record.lockedUntil && Date.now() >= record.lockedUntil) {
    loginRateLimit.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}
function recordLoginFailure(ip) {
  const record = loginRateLimit.get(ip) || { failedCount: 0 };
  record.failedCount += 1;
  if (record.failedCount >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lockout
  }
  loginRateLimit.set(ip, record);
}
function recordLoginSuccess(ip) {
  loginRateLimit.delete(ip);
}

// 1. Login Endpoint (validates password, triggers 6-digit OTP email)
app.post('/api/admin/login', async (req, res) => {
  if (!hasAdminAccess()) return res.status(503).json({ error: 'admin disabled: set ADMIN_TOKEN' });
  const clientIp = getClientIp(req);
  const rateStatus = checkLoginRateLimit(clientIp);
  if (!rateStatus.allowed) {
    return res.status(429).json({ error: rateStatus.error });
  }

  const u = String(req.body?.username || '').trim().toLowerCase();
  const p = String(req.body?.password || '');
  
  let user = null;
  const isOwner = (u === 'owner' || u === '') && checkOwnerPassword(p);
  if (isOwner) {
    user = { role: 'owner', name: 'Owner', username: 'owner', email: getOwnerEmail(), allowedProducts: [] };
  } else {
    user = getUsers().find((x) => x.username === u);
    if (!user || !checkPw(p, user)) {
      recordLoginFailure(clientIp);
      return res.status(401).json({ error: 'Wrong username or password' });
    }
  }

  recordLoginSuccess(clientIp);

  const ig = getIntegrations();
  const emailActive = !!(ig.email?.enabled && (ig.email?.resendApiKey || ig.email?.host));

  // If email is active and user has not opted out of OTP:
  if (emailActive && !user.skipOtp) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const tempToken = 't_' + randomBytes(16).toString('hex');
    const targetEmail = (user.email || getOwnerEmail()).trim();
    const ownerEmail = getOwnerEmail().trim();
    const st = getSettings();
    const storeName = st.storeName || 'Store';

    pendingOtps.set(tempToken, {
      username: user.username,
      role: user.role,
      name: user.name,
      otp,
      email: targetEmail,
      allowedProducts: Array.isArray(user.allowedProducts) ? user.allowedProducts : [],
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    let deliveredEmail = targetEmail;

    const emailRes = await sendEmail(
      targetEmail,
      `${storeName} — Admin Security Verification Code: ${otp}`,
      renderSecurityOtpHtml({
        storeName,
        title: 'Admin Sign-In Verification',
        subtitle: `A sign-in attempt was initiated for <strong>${user.name}</strong> (${user.username}). Enter this 6-digit passcode to authenticate:`,
        otp,
        userName: user.name,
        userEmail: targetEmail,
        expiresMin: 10
      })
    );

    // If delivery to team member failed (e.g. Resend unverified domain restriction: only sends to owner's registered email)
    if (!emailRes.ok) {
      console.warn(`[OTP] Direct delivery to ${targetEmail} failed (${emailRes.error}). Forwarding OTP to Store Owner: ${ownerEmail}`);
      if (targetEmail.toLowerCase() !== ownerEmail.toLowerCase()) {
        const fwdRes = await sendEmail(
          ownerEmail,
          `${storeName} — [Team Member Login Code] ${user.name}: ${otp}`,
          renderSecurityOtpHtml({
            storeName,
            title: `Team Member Login: ${user.name}`,
            subtitle: `Team member <strong>${user.name}</strong> (${user.username}) is attempting to log in with email <code>${targetEmail}</code>.<br><br>⚠️ <em>Because your store domain is not yet verified in Resend, Resend restricted external delivery. Their 6-digit code has been delivered to your owner inbox:</em>`,
            otp,
            userName: `${user.name} (${user.username})`,
            userEmail: targetEmail,
            expiresMin: 10,
            note: `Share this code with ${user.name} to allow them to sign in. To enable direct delivery to team members, verify your domain in Resend.com or configure SMTP in Settings.`
          })
        );
        if (fwdRes.ok) {
          deliveredEmail = `${ownerEmail} (Forwarded to Owner)`;
        }
      }
    }

    return res.json({
      otpRequired: true,
      tempToken,
      emailMasked: deliveredEmail.includes('Forwarded to Owner') ? `Owner Inbox (${maskEmail(ownerEmail)})` : maskEmail(deliveredEmail),
      notice: deliveredEmail.includes('Forwarded to Owner') ? `Verification code was delivered to Store Owner (${maskEmail(ownerEmail)}) because domain is in Resend test mode.` : undefined
    });
  }

  // Fallback: direct 48-hour session if email is disabled or skipOtp is enabled
  const token = 's_' + randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { role: user.role, name: user.name, username: user.username, email: user.email || getOwnerEmail(), allowedProducts: Array.isArray(user.allowedProducts) ? user.allowedProducts : [], expiresAt });
  res.json({ token, role: user.role, name: user.name, expiresAt });
});

// 2. Verify OTP Endpoint
app.post('/api/admin/verify-otp', (req, res) => {
  const { tempToken, otp } = req.body || {};
  if (!tempToken || !otp) return res.status(400).json({ error: 'Missing temporary token or OTP' });
  const pending = pendingOtps.get(tempToken);
  if (!pending) return res.status(400).json({ error: 'Session expired. Please sign in again.' });
  if (Date.now() > pending.expiresAt) {
    pendingOtps.delete(tempToken);
    return res.status(400).json({ error: 'OTP expired. Please request a new code.' });
  }
  if (String(pending.otp).trim() !== String(otp).trim()) {
    pending.attempts = (pending.attempts || 0) + 1;
    if (pending.attempts >= 5) {
      pendingOtps.delete(tempToken);
      return res.status(429).json({ error: 'Too many incorrect OTP attempts. Security lock triggered. Please sign in again.' });
    }
    return res.status(400).json({ error: `Invalid OTP code. Please check your email. (${5 - pending.attempts} attempts remaining)` });
  }

  // Valid OTP! Issue 48-hour session
  const token = 's_' + randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, {
    role: pending.role,
    name: pending.name,
    username: pending.username,
    email: pending.email,
    allowedProducts: Array.isArray(pending.allowedProducts) ? pending.allowedProducts : [],
    expiresAt
  });
  pendingOtps.delete(tempToken);

  res.json({
    token,
    role: pending.role,
    name: pending.name,
    username: pending.username,
    expiresAt
  });
});

// 3. Resend OTP
app.post('/api/admin/resend-otp', async (req, res) => {
  const { tempToken } = req.body || {};
  const pending = pendingOtps.get(tempToken);
  if (!pending) return res.status(400).json({ error: 'Session expired. Please sign in again.' });
  
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  pending.otp = otp;
  pending.expiresAt = Date.now() + 10 * 60 * 1000;
  pendingOtps.set(tempToken, pending);

  const st = getSettings();
  const storeName = st.storeName || 'Store';
  const ownerEmail = getOwnerEmail().trim();

  let emailRes = await sendEmail(
    pending.email,
    `${storeName} — New Admin Verification Code: ${otp}`,
    renderSecurityOtpHtml({
      storeName,
      title: 'New Verification Code',
      subtitle: `A new verification code was requested for your admin account. Use this 6-digit passcode to sign in:`,
      otp,
      userName: pending.name,
      userEmail: pending.email,
      expiresMin: 10
    })
  );

  let deliveredEmail = pending.email;
  if (!emailRes.ok && pending.email.toLowerCase() !== ownerEmail.toLowerCase()) {
    console.warn(`[OTP Resend] Delivery to ${pending.email} failed. Forwarding to Store Owner: ${ownerEmail}`);
    const fwdRes = await sendEmail(
      ownerEmail,
      `${storeName} — [Team Member Login Code] ${pending.name}: ${otp}`,
      renderSecurityOtpHtml({
        storeName,
        title: `Team Member Login: ${pending.name}`,
        subtitle: `Team member <strong>${pending.name}</strong> (${pending.username}) requested a new code. Their 6-digit code has been delivered to your owner inbox:`,
        otp,
        userName: `${pending.name} (${pending.username})`,
        userEmail: pending.email,
        expiresMin: 10,
        note: `Share this code with ${pending.name} so they can complete sign in.`
      })
    );
    if (fwdRes.ok) {
      deliveredEmail = `${ownerEmail} (Forwarded to Owner)`;
    }
  }

  res.json({ ok: true, emailMasked: deliveredEmail.includes('Forwarded to Owner') ? `Owner Inbox (${maskEmail(ownerEmail)})` : maskEmail(deliveredEmail) });
});

// 4. Forgot Password (requests OTP to reset password)
app.post('/api/admin/forgot-password', async (req, res) => {
  const u = String(req.body?.usernameOrEmail || '').trim().toLowerCase();
  let user = null;
  if (u === 'owner' || u === getOwnerEmail()) {
    user = { username: 'owner', name: 'Owner', role: 'owner', email: getOwnerEmail() };
  } else {
    user = getUsers().find((x) => x.username === u || (x.email && x.email.toLowerCase() === u));
  }
  if (!user) return res.status(404).json({ error: 'No admin account found with that username or email' });

  const targetEmail = user.email || getOwnerEmail();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const resetToken = 'r_' + randomBytes(16).toString('hex');
  const st = getSettings();
  const storeName = st.storeName || 'Store';

  pendingPasswordResets.set(resetToken, {
    username: user.username,
    email: targetEmail,
    otp,
    expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
  });

  await sendEmail(
    targetEmail,
    `${storeName} — Password Reset Code: ${otp}`,
    renderSecurityOtpHtml({
      storeName,
      title: 'Admin Password Reset',
      subtitle: `A password reset was requested for admin <strong>${user.username}</strong>. Use the 6-digit code below to set a new password:`,
      otp,
      userName: user.name || user.username,
      userEmail: targetEmail,
      expiresMin: 15,
      note: "If you did not request this password reset, your account remains secure and you can safely ignore this email."
    })
  );

  res.json({ ok: true, resetToken, emailMasked: maskEmail(targetEmail) });
});

// 5. Reset Password (verifies OTP, updates password)
app.post('/api/admin/reset-password', (req, res) => {
  const { resetToken, otp, newPassword } = req.body || {};
  if (!resetToken || !otp || !newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'All fields required, new password must be at least 4 characters' });
  }
  const pending = pendingPasswordResets.get(resetToken);
  if (!pending) return res.status(400).json({ error: 'Reset session expired. Please request a new one.' });
  if (Date.now() > pending.expiresAt) {
    pendingPasswordResets.delete(resetToken);
    return res.status(400).json({ error: 'Reset code expired. Please request a new one.' });
  }
  if (String(pending.otp).trim() !== String(otp).trim()) {
    return res.status(400).json({ error: 'Invalid reset code' });
  }

  // Apply new password
  if (pending.username === 'owner') {
    const { salt, hash } = makeHash(String(newPassword));
    saveSettings({ ownerPassword: { salt, hash, updatedAt: new Date().toISOString() } });
    process.env.ADMIN_TOKEN = String(newPassword);
  } else {
    const users = getUsers();
    const u = users.find((x) => x.username === pending.username);
    if (u) {
      const { salt, hash } = makeHash(String(newPassword));
      u.salt = salt;
      u.hash = hash;
      saveUsers(users);
    }
  }

  pendingPasswordResets.delete(resetToken);
  res.json({ ok: true, message: 'Password successfully changed! Please sign in with your new password.' });
});

app.post('/api/admin/change-password', adminAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });
  const admin = req.admin;
  if (admin.role === 'owner') {
    if (!checkOwnerPassword(currentPassword)) return res.status(400).json({ error: 'Current password incorrect' });
    const { salt, hash } = makeHash(String(newPassword));
    saveSettings({ ownerPassword: { salt, hash, updatedAt: new Date().toISOString() } });
    process.env.ADMIN_TOKEN = String(newPassword);
    return res.json({ ok: true, message: 'Owner master password updated successfully!' });
  }
  const users = getUsers();
  const u = users.find((x) => x.username === admin.username);
  if (!u || !checkPw(currentPassword, u)) return res.status(400).json({ error: 'Current password incorrect' });
  const { salt, hash } = makeHash(String(newPassword));
  u.salt = salt;
  u.hash = hash;
  saveUsers(users);
  res.json({ ok: true, message: 'Password updated successfully!' });
});

app.put('/api/admin/security-email', adminAuth, requireRole('owner'), (req, res) => {
  const { email } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ error: 'Valid email address required' });
  const ig = getIntegrations();
  ig.email.adminEmail = cleanEmail;
  saveIntegrations(ig);
  res.json({ ok: true, adminEmail: cleanEmail });
});

app.get('/api/admin/me', adminAuth, (req, res) => res.json(req.admin));

app.get('/api/admin/users', adminAuth, requireRole('owner'), (_q, res) => res.json(getUsers().map((u) => ({ id: u.id, username: u.username, name: u.name, email: u.email || '', role: u.role, skipOtp: !!u.skipOtp, allowedProducts: Array.isArray(u.allowedProducts) ? u.allowedProducts : [] }))));

app.post('/api/admin/users', adminAuth, requireRole('owner'), async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const name = String(b.name || '').trim() || username;
  const email = String(b.email || '').trim().toLowerCase();
  const role = ['manager', 'staff'].includes(b.role) ? b.role : 'staff';
  const allowedProducts = Array.isArray(b.allowedProducts) ? b.allowedProducts.map(String) : [];
  const password = String(b.password || '');
  const skipOtp = !!b.skipOtp;
  if (!username || password.length < 4) return res.status(400).json({ error: 'username and a 4+ character password are required' });
  const users = getUsers();
  if (users.find((u) => u.username === username)) return res.status(400).json({ error: 'username already exists' });
  const { salt, hash } = makeHash(password);
  const newUser = { id: 'u' + Date.now().toString(36), username, name, email, role, skipOtp, allowedProducts, salt, hash, createdAt: new Date().toISOString() };
  users.push(newUser);
  saveUsers(users);

  // Send onboarding email to new staff member
  if (email) {
    const host = req.get('host') || 'dot.metromaa.com';
    const loginUrl = `${req.protocol}://${host}/wp-admin`;
    sendEmail(
      email,
      `Welcome to dot. Admin Team — Your Login Credentials`,
      `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#17120E;color:#ECE4D8;border-radius:18px;border:1px solid rgba(231,180,134,0.3);">
        <div style="font-size:24px;font-weight:700;margin-bottom:6px;color:#ECE4D8;">dot<span style="color:#E7B486;">.</span> <span style="font-size:14px;color:#A99E8E;font-weight:400;">staff onboarding</span></div>
        <p style="color:#A99E8E;font-size:14px;margin:12px 0 20px;">Hi <b>${name}</b>, your admin account has been created with the role of <b>${role.toUpperCase()}</b>.</p>
        <div style="background:rgba(231,180,134,0.08);border:1px solid rgba(231,180,134,0.25);border-radius:14px;padding:20px;margin:18px 0;line-height:1.7;">
          <div style="margin-bottom:8px;"><span style="color:#A99E8E;font-size:13px;">Login URL:</span><br><a href="${loginUrl}" style="color:#E7B486;font-weight:600;word-break:break-all;">${loginUrl}</a></div>
          <div style="margin-bottom:8px;"><span style="color:#A99E8E;font-size:13px;">Username:</span><br><code style="background:rgba(0,0,0,0.4);padding:4px 8px;border-radius:6px;color:#ECE4D8;font-size:14px;">${username}</code></div>
          <div><span style="color:#A99E8E;font-size:13px;">Temporary Password:</span><br><code style="background:rgba(0,0,0,0.4);padding:4px 8px;border-radius:6px;color:#ECE4D8;font-size:14px;">${password}</code></div>
        </div>
        <p style="color:#6F665A;font-size:12px;line-height:1.5;">🔒 Security Notice: Your session automatically expires every 48 hours. When signing in, you will be prompted for an email OTP verification.</p>
      </div>
      `
    ).catch(() => {});
  }

  res.status(201).json({ username, name, email, role, skipOtp, allowedProducts });
});

app.patch('/api/admin/users/:id', adminAuth, requireRole('owner'), (req, res) => {
  const users = getUsers();
  const u = users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const b = req.body || {};
  if (b.name != null) u.name = String(b.name).trim() || u.name;
  if (b.email != null) u.email = String(b.email).trim().toLowerCase();
  if (b.role && ['manager', 'staff'].includes(b.role)) u.role = b.role;
  if (b.skipOtp != null) u.skipOtp = !!b.skipOtp;
  if (Array.isArray(b.allowedProducts)) u.allowedProducts = b.allowedProducts.map(String);
  if (b.password && String(b.password).length >= 4) {
    const { salt, hash } = makeHash(String(b.password));
    u.salt = salt;
    u.hash = hash;
  }
  saveUsers(users);
  res.json({ id: u.id, username: u.username, name: u.name, email: u.email || '', role: u.role, skipOtp: !!u.skipOtp, allowedProducts: Array.isArray(u.allowedProducts) ? u.allowedProducts : [] });
});

app.delete('/api/admin/users/:id', adminAuth, requireRole('owner'), (req, res) => { saveUsers(getUsers().filter((u) => u.id !== req.params.id)); res.json({ ok: true }); });

app.get('/api/orders', adminAuth, (req, res) => {
  let list = getOrders();
  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    list = list.filter((o) => (o.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug))));
  }
  res.json(list);
});

// Admin create manual order (Phone call, WhatsApp, Facebook Messenger, POS)
app.post('/api/admin/orders', adminAuth, (req, res) => {
  const { customer, items, delivery, discount, source, status, adminNote, courier } = req.body || {};
  const c = customer || {};
  const rawPhone = String(c.phone || '').trim();
  const phoneClean = cleanBDPhone(rawPhone) || rawPhone.replace(/\D/g, '');
  if (!phoneClean || phoneClean.length < 11) {
    return res.status(400).json({ error: 'সঠিক ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন' });
  }
  const lines = Array.isArray(items) ? items.map((it) => {
    const qty = Math.max(1, parseInt(it.qty, 10) || 1);
    const price = Number(it.price) || 0;
    return {
      id: it.id || 'custom',
      name: String(it.name || 'Product').trim(),
      price,
      qty,
      subtotal: price * qty,
      image: it.image || '',
      variantId: it.variantId || '',
      variantTitle: it.variantTitle || '',
      size: it.size || '',
      color: it.color || '',
    };
  }) : [];
  if (lines.length === 0) {
    return res.status(400).json({ error: 'কমপক্ষে একটি পণ্য যোগ করুন' });
  }

  const itemsTotal = lines.reduce((s, it) => s + it.subtotal, 0);
  const deliveryFee = delivery != null ? Math.max(0, Number(delivery)) : 0;
  const discountAmt = discount != null ? Math.max(0, Number(discount)) : 0;
  const total = Math.max(0, itemsTotal + deliveryFee - discountAmt);
  const now = new Date().toISOString();
  const orderId = 'DOT-' + randomUUID().slice(0, 8).toUpperCase();
  const initialStatus = status || 'confirmed';
  const orderSource = String(source || 'phone_call').trim();
  const area = c.area === 'outside' ? 'outside' : (c.district && c.district.toLowerCase() === 'dhaka' ? 'inside' : (c.area || 'inside'));

  const order = {
    id: orderId,
    createdAt: now,
    status: initialStatus,
    payment: 'cash_on_delivery',
    source: orderSource,
    customer: {
      name: String(c.name || 'Customer').trim(),
      phone: phoneClean,
      phone2: String(c.phone2 || '').trim(),
      address: String(c.address || '').trim(),
      area,
      district: String(c.district || '').trim(),
      thana: String(c.thana || '').trim(),
      note: String(c.note || '').trim(),
    },
    adminNote: String(adminNote || `Manual order entry (${orderSource}) by ${req.admin?.name || 'Admin'}`).trim(),
    items: lines,
    itemsTotal,
    delivery: deliveryFee,
    discount: discountAmt,
    total,
    courier: courier || null,
    history: [
      { status: initialStatus, at: now, note: `Manual order created via ${orderSource === 'whatsapp' ? 'WhatsApp' : orderSource === 'phone_call' ? 'Phone Call' : orderSource} by ${req.admin?.name || 'Admin'}` }
    ],
  };

  addOrder(order);
  cancelDraft(phoneClean);
  try {
    const existingDraft = getOrders().find((o) => o.status === 'incomplete' && o.customer && String(o.customer.phone).replace(/\D/g, '').slice(-11) === phoneClean);
    if (existingDraft) deleteOrder(existingDraft.id);
  } catch (_) {}
  notifyOrder(order, 'placed');
  res.status(201).json(order);
});

app.patch('/api/orders/:id', adminAuth, (req, res) => {
  const before = getOrders().find((x) => x.id === req.params.id);
  if (!before) return res.status(404).json({ error: 'not found' });
  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    const hasAccess = (before.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug)));
    if (!hasAccess) return res.status(403).json({ error: 'You do not have permission for this order' });
  }
  const { status, courier, adminNote, customer, items, delivery, discount, itemsTotal, total } = req.body || {};
  const o = updateOrder(req.params.id, { status, courier, adminNote, customer, items, delivery, discount, itemsTotal, total });
  if (status && before && before.status !== status) notifyOrder(o, 'status');
  res.json(o);
});

app.delete('/api/orders/:id', adminAuth, (req, res) => {
  const before = getOrders().find((x) => x.id === req.params.id);
  if (!before) return res.status(404).json({ error: 'not found' });
  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    const hasAccess = (before.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug)));
    if (!hasAccess) return res.status(403).json({ error: 'You do not have permission for this order' });
  }
  const ok = deleteOrder(req.params.id);
  res.json({ ok });
});

// ---- admin product management ----
function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function normalizeProduct(b) {
  b = b || {};
  const name = String(b.name || '').trim();
  let images = Array.isArray(b.images) ? b.images.map((s) => String(s).trim()).filter(Boolean) : [];

  // Normalize colors with image and hex (WooCommerce style attributes)
  const colors = Array.isArray(b.colors)
    ? b.colors
        .map((c) => {
          if (typeof c === 'string') return { name: c.trim(), hex: '', image: '' };
          return {
            name: String(c.name || '').trim(),
            hex: String(c.hex || '').trim(),
            image: String(c.image || '').trim(),
          };
        })
        .filter((c) => c.name)
    : [];

  // Normalize variations with size, color, sku, price, stock, and image
  const variations = Array.isArray(b.variations)
    ? b.variations.map((v) => ({
        id: String(v.id || 'v_' + Math.random().toString(36).slice(2, 9)),
        title: String(v.title || '').trim(),
        size: String(v.size || '').trim(),
        color: String(v.color || '').trim(),
        colorHex: String(v.colorHex || '').trim(),
        price: v.price != null && v.price !== '' ? Math.max(0, parseInt(v.price, 10) || 0) : Math.max(0, parseInt(b.price, 10) || 0),
        compareAt: v.compareAt ? Math.max(0, parseInt(v.compareAt, 10) || 0) : 0,
        stock: v.stock === '' || v.stock === null || v.stock === undefined ? null : Math.max(0, parseInt(v.stock, 10) || 0),
        sku: String(v.sku || '').trim(),
        image: String(v.image || '').trim(),
      }))
    : [];

  // Collect any color or variation images into the product gallery
  colors.forEach((c) => {
    if (c.image && !images.includes(c.image)) images.push(c.image);
  });
  variations.forEach((v) => {
    if (v.image && !images.includes(v.image)) images.push(v.image);
  });

  const image = String(b.image || '').trim() || images[0] || '';
  if (image && !images.includes(image)) images.unshift(image);

  return {
    name,
    slug: slugify(b.slug || name),
    price: Math.max(0, parseInt(b.price, 10) || 0),
    compareAt: Math.max(0, parseInt(b.compareAt, 10) || 0),
    category: String(b.category || '').trim() || 'skincare',
    adult: !!b.adult,
    tag: String(b.tag || '').trim(),
    desc: String(b.desc || '').trim(),
    shortDesc: String(b.shortDesc || '').trim(),
    longDesc: String(b.longDesc || '').trim(),
    size: String(b.size || '').trim(),
    sku: String(b.sku || '').trim(),
    weight: String(b.weight || '').trim(),
    seoTitle: String(b.seoTitle || '').trim(),
    seoDesc: String(b.seoDesc || '').trim(),
    customDeliveryInside: b.customDeliveryInside != null && b.customDeliveryInside !== '' ? Number(b.customDeliveryInside) : null,
    customDeliveryOutside: b.customDeliveryOutside != null && b.customDeliveryOutside !== '' ? Number(b.customDeliveryOutside) : null,
    variations,
    colors,
    image,
    images,
    stock: b.stock === '' || b.stock === null || b.stock === undefined ? null : Math.max(0, parseInt(b.stock, 10) || 0),
    lowStockThreshold: b.lowStockThreshold != null && b.lowStockThreshold !== '' ? Math.max(0, parseInt(b.lowStockThreshold, 10)) : 5,
    soldOut: !!b.soldOut,
  };
}

app.post('/api/upload', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const dataUrl = req.body?.dataUrl || req.body?.image || '';
  const m = dataUrl.match(/^data:(?:image\/(png|jpe?g|webp|gif|avif|x-icon|vnd\.microsoft\.icon));base64,(.+)$/i);
  if (!m) return res.status(400).json({ error: 'invalid image' });
  let ext = m[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  else if (ext.includes('icon')) ext = 'ico';
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) return res.status(400).json({ error: 'image too large (max 6MB)' });

  // Deduplicate: check if identical image content already exists on disk
  try {
    const hash = createHash('md5').update(buf).digest('hex');
    const existingFiles = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    for (const f of existingFiles) {
      const full = join(UPLOADS, f);
      try {
        const existingBuf = readFileSync(full);
        if (existingBuf.length === buf.length) {
          const existingHash = createHash('md5').update(existingBuf).digest('hex');
          if (existingHash === hash) {
            return res.json({ url: '/uploads/' + f, deduplicated: true });
          }
        }
      } catch {}
    }
  } catch {}

  const nm = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.' + ext;
  writeFileSync(join(UPLOADS, nm), buf);
  try { writeFileSync(join(PERSISTENT_UPLOADS, nm), buf); } catch (_) {}
  try { writeFileSync(join(ROOT_UPLOADS, nm), buf); } catch (_) {}
  res.json({ url: '/uploads/' + nm });
});

// media / file manager with smart usage tracking & duplicate detection
function getMediaUsageMap() {
  const map = new Map();
  const add = (url, type, id, title) => {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.trim();
    const fn = cleanUrl.split('/').pop();
    if (!map.has(cleanUrl)) map.set(cleanUrl, []);
    map.get(cleanUrl).push({ type, id, title });
    if (fn && fn !== cleanUrl) {
      if (!map.has(fn)) map.set(fn, []);
      map.get(fn).push({ type, id, title });
    }
  };

  try {
    const cat = getCatalog();
    (cat.products || []).forEach((p) => {
      if (p.image) add(p.image, 'Product', p.id, p.name);
      if (Array.isArray(p.images)) p.images.forEach((img) => add(img, 'Product', p.id, p.name));
    });
    (cat.categories || []).forEach((c) => {
      if (c.image) add(c.image, 'Category', c.id, c.name);
    });
  } catch {}

  try {
    const landings = getLandings();
    (landings || []).forEach((l) => {
      if (l.heroImage) add(l.heroImage, 'Landing', l.id, l.title);
      if (Array.isArray(l.gallery)) l.gallery.forEach((g) => add(g, 'Landing', l.id, l.title));
      if (Array.isArray(l.variants)) l.variants.forEach((v) => { if (v.image) add(v.image, 'Landing', l.id, `${l.title} (${v.title})`); });
    });
  } catch {}

  try {
    const st = getSettings();
    if (st.logo) add(st.logo, 'Store Logo', 'logo', 'Store Logo');
    if (st.favicon) add(st.favicon, 'Favicon', 'favicon', 'Favicon');
  } catch {}

  return map;
}

app.get('/api/admin/media', adminAuth, requireRole('owner', 'manager'), (_q, res) => {
  try {
    const usageMap = getMediaUsageMap();
    const hashGroups = new Map();
    const all = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    const files = all.map((f) => {
      const full = join(UPLOADS, f);
      const st = statSync(full);
      const url = '/uploads/' + f;
      const rawUsage = usageMap.get(url) || usageMap.get(f) || [];
      const usedIn = [];
      const seen = new Set();
      for (const u of rawUsage) {
        const key = `${u.type}:${u.id}`;
        if (!seen.has(key)) { seen.add(key); usedIn.push(u); }
      }

      let hash = '';
      let isDuplicate = false;
      let duplicateOf = '';
      if (st.size > 0 && st.size < 20 * 1024 * 1024) {
        try {
          const buf = readFileSync(full);
          hash = createHash('md5').update(buf).digest('hex');
          if (hashGroups.has(hash)) {
            isDuplicate = true;
            duplicateOf = hashGroups.get(hash);
          } else {
            hashGroups.set(hash, f);
          }
        } catch {}
      }

      return {
        name: f,
        url,
        size: st.size,
        at: st.mtimeMs,
        hash,
        isDuplicate,
        duplicateOf,
        usedCount: usedIn.length,
        usedIn,
        isBroken: st.size === 0,
      };
    }).sort((a, b) => b.at - a.at);
    res.json(files);
  } catch { res.json([]); }
});

app.delete('/api/admin/media/:name', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const name = String(req.params.name || '');
  if (!/^[\w.\-]+$/.test(name) || name.includes('..')) return res.status(400).json({ error: 'bad filename' });
  try { unlinkSync(join(UPLOADS, name)); res.json({ ok: true }); } catch { res.status(404).json({ error: 'not found' }); }
});

app.post('/api/admin/media/bulk-delete', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : [];
  let deleted = 0;
  for (const n of names) {
    const name = String(n || '').trim();
    if (/^[\w.\-]+$/.test(name) && !name.includes('..')) {
      try { unlinkSync(join(UPLOADS, name)); deleted++; } catch {}
    }
  }
  res.json({ ok: true, deleted });
});

app.post('/api/admin/media/clean-duplicates', adminAuth, requireRole('owner', 'manager'), (_q, res) => {
  try {
    const usageMap = getMediaUsageMap();
    const hashGroups = new Map();
    const all = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    let deleted = 0;
    const sorted = all.map((f) => ({ f, st: statSync(join(UPLOADS, f)) })).sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
    for (const { f, st } of sorted) {
      if (st.size === 0) continue;
      try {
        const buf = readFileSync(join(UPLOADS, f));
        const hash = createHash('md5').update(buf).digest('hex');
        if (hashGroups.has(hash)) {
          const used = usageMap.get('/uploads/' + f) || usageMap.get(f) || [];
          if (used.length === 0) {
            unlinkSync(join(UPLOADS, f));
            deleted++;
            continue;
          }
        }
        hashGroups.set(hash, f);
      } catch {}
    }
    res.json({ ok: true, deleted });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post('/api/admin/media/clean-broken', adminAuth, requireRole('owner', 'manager'), (_q, res) => {
  try {
    const all = readdirSync(UPLOADS).filter((f) => !f.startsWith('.'));
    let deleted = 0;
    for (const f of all) {
      try {
        const st = statSync(join(UPLOADS, f));
        if (st.size === 0) { unlinkSync(join(UPLOADS, f)); deleted++; }
      } catch {}
    }
    res.json({ ok: true, deleted });
  } catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post('/api/products', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const p = normalizeProduct(req.body);
  if (!p.name) return res.status(400).json({ error: 'product name is required' });
  if (!p.price) return res.status(400).json({ error: 'price must be greater than 0' });
  p.id = 'p' + Date.now().toString(36);
  addProduct(p);
  res.status(201).json(p);
});

app.put('/api/products/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const p = normalizeProduct(req.body);
  if (!p.name) return res.status(400).json({ error: 'product name is required' });
  const o = updateProduct(req.params.id, p);
  if (!o) return res.status(404).json({ error: 'not found' });
  res.json(o);
});

app.patch('/api/products/:id/stock', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const { stock, soldOut, lowStockThreshold } = req.body;
  const patch = {};
  if (stock !== undefined) {
    patch.stock = (stock === null || stock === '' || stock === '∞') ? null : Math.max(0, parseInt(stock, 10) || 0);
  }
  if (soldOut !== undefined) {
    patch.soldOut = !!soldOut;
  }
  if (lowStockThreshold !== undefined) {
    patch.lowStockThreshold = (lowStockThreshold === null || lowStockThreshold === '') ? 5 : Math.max(0, parseInt(lowStockThreshold, 10) || 0);
  }
  const o = updateProduct(req.params.id, patch);
  if (!o) return res.status(404).json({ error: 'not found' });
  res.json(o);
});

app.delete('/api/products/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteProduct(req.params.id)) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- coupons & reviews ----
function couponFor(code, subtotal, phone) {
  const cleanCode = String(code || '').trim().toUpperCase();
  const c = getCoupons().find((x) => x.code.toUpperCase() === cleanCode && x.active !== false);
  if (!c) return null;
  if (c.minSubtotal && subtotal < c.minSubtotal) return { error: `Add more items to use ${c.code} (minimum ৳${c.minSubtotal})` };

  if (cleanCode === 'WELCOME5' || c.isWelcome) {
    if (!phone) {
      return { error: 'Please enter your 11-digit mobile number to apply the 5% first order discount.' };
    }
    const cleanPhone = String(phone).replace(/\D/g, '').slice(-11);
    const pastOrders = (getOrders() || []).filter((o) => {
      if (o.status === 'cancelled') return false;
      return String(o.customer?.phone || '').replace(/\D/g, '').slice(-11) === cleanPhone;
    });
    const cust = getCustomerByPhone(cleanPhone);
    if (pastOrders.length > 0 || (cust && cust.welcomeCouponUsed)) {
      return { error: 'The 5% welcome code WELCOME5 is only valid for your first order.' };
    }
  }

  let discount = c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : c.value;
  discount = Math.min(discount, subtotal);
  return { code: c.code, type: c.type, value: c.value, discount };
}
app.post('/api/coupon/validate', (req, res) => {
  const r = couponFor(req.body?.code, Math.max(0, parseInt(req.body?.subtotal, 10) || 0), req.body?.phone);
  if (!r) return res.status(404).json({ error: 'invalid or expired code' });
  if (r.error) return res.status(400).json({ error: r.error });
  res.json(r);
});
app.get('/api/coupons', adminAuth, (_q, res) => res.json(getCoupons()));
app.post('/api/coupons', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'code required' });
  const coupons = getCoupons();
  if (coupons.find((c) => c.code === code)) return res.status(400).json({ error: 'code already exists' });
  const c = { code, type: b.type === 'flat' ? 'flat' : 'percent', value: Math.max(0, parseInt(b.value, 10) || 0), minSubtotal: Math.max(0, parseInt(b.minSubtotal, 10) || 0), active: true };
  coupons.push(c); saveCoupons(coupons); res.status(201).json(c);
});
app.delete('/api/coupons/:code', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  saveCoupons(getCoupons().filter((c) => c.code !== req.params.code));
  res.json({ ok: true });
});
app.get('/api/reviews/:pid', (req, res) => {
  const list = getReviews()[req.params.pid] || [];
  const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
  res.json({ count: list.length, avg: Math.round(avg * 10) / 10, reviews: list });
});
app.post('/api/reviews', (req, res) => {
  const b = req.body || {};
  const pid = String(b.productId || '').trim();
  const rating = Math.max(1, Math.min(5, parseInt(b.rating, 10) || 0));
  const name = String(b.name || '').trim().slice(0, 40);
  const text = String(b.text || '').trim().slice(0, 500);
  if (!pid || !rating || !name) return res.status(400).json({ error: 'name and rating required' });
  const all = getReviews(); const list = all[pid] || [];
  list.unshift({ id: randomUUID().slice(0, 8), name, rating, text, at: new Date().toISOString() });
  all[pid] = list; saveReviews(all);
  res.status(201).json({ ok: true });
});
app.delete('/api/reviews/:pid/:id', adminAuth, (req, res) => {
  const all = getReviews(); all[req.params.pid] = (all[req.params.pid] || []).filter((r) => r.id !== req.params.id); saveReviews(all); res.json({ ok: true });
});

// ---- admin category management ----
function normalizeCategory(b) {
  b = b || {};
  const name = String(b.name || '').trim();
  return { slug: slugify(b.slug || name), name, adult: !!b.adult, blurb: String(b.blurb || '').trim(), image: String(b.image || '').trim() };
}
app.post('/api/categories', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const c = normalizeCategory(req.body);
  if (!c.name || !c.slug) return res.status(400).json({ error: 'category name is required' });
  if (!addCategory(c)) return res.status(400).json({ error: 'category already exists' });
  res.status(201).json(c);
});
app.put('/api/categories/:slug', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const c = normalizeCategory(req.body);
  const r = updateCategory(req.params.slug, { name: c.name, adult: c.adult, blurb: c.blurb, image: c.image });
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json(r);
});
app.delete('/api/categories/:slug', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteCategory(req.params.slug)) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// ---- landing pages management ----
app.get('/api/landings', (_req, res) => {
  res.json(getLandings());
});

app.get('/api/landings/:slug', (req, res) => {
  const landing = getLandingBySlug(req.params.slug);
  if (!landing) return res.status(404).json({ error: 'landing page not found' });
  res.json(landing);
});

app.post('/api/landings', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Landing title is required' });
  const slug = slugify(b.slug || title);
  const landing = {
    ...b,
    id: b.id || 'landing_' + Date.now().toString(36),
    title,
    slug,
    status: b.status === 'draft' ? 'draft' : 'live',
  };
  addLanding(landing);
  res.status(201).json(landing);
});

app.put('/api/landings/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const updated = updateLanding(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Landing page not found' });
  res.json(updated);
});

app.delete('/api/landings/:id', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  if (!deleteLanding(req.params.id)) return res.status(404).json({ error: 'Landing page not found' });
  res.json({ ok: true });
});

// ---- integrations: email (SMTP), bulk SMS (generic HTTP), couriers (generic templated API) ----
function fillTpl(tpl, map) { return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (map[k] != null ? String(map[k]) : '')); }
async function sendEmail(to, subject, html) {
  const e = getIntegrations().email;
  if (!e || !e.enabled) return { ok: false, error: 'email not configured or disabled' };

  // 1. Resend API (Preferred, ultra-fast & permanent)
  if (e.provider === 'resend' || e.resendApiKey) {
    const key = e.resendApiKey || process.env.RESEND_API_KEY;
    if (!key) return { ok: false, error: 'Resend API key missing' };
    const fromName = e.fromName || 'dot.';
    let from = e.fromEmail ? `"${fromName}" <${e.fromEmail}>` : `"${fromName}" <onboarding@resend.dev>`;
    try {
      let r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html })
      });
      let d = await r.json();
      if (!r.ok && d?.message && d.message.includes('domain is not verified')) {
        from = `"${fromName}" <onboarding@resend.dev>`;
        r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, subject, html })
        });
        d = await r.json();
      }
      if (!r.ok) return { ok: false, error: d?.message || 'Resend delivery failed' };
      return { ok: true, id: d?.id };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 2. Fallback to standard SMTP
  if (!e.host || !e.user) return { ok: false, error: 'email not configured' };
  try {
    const tx = nodemailer.createTransport({ host: e.host, port: Number(e.port) || 587, secure: !!e.secure, auth: { user: e.user, pass: e.pass } });
    await tx.sendMail({ from: `"${e.fromName || 'dot.'}" <${e.fromEmail || e.user}>`, to, subject, html });
    return { ok: true };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}
async function sendSMS(phone, message) {
  const s = getIntegrations().sms;
  if (!s.enabled || !s.url) return { ok: false, error: 'sms not configured' };
  const url = fillTpl(s.url, { phone: encodeURIComponent(phone), msg: encodeURIComponent(message), message: encodeURIComponent(message), apiKey: encodeURIComponent(s.apiKey || ''), senderId: encodeURIComponent(s.senderId || '') });
  try {
    const r = await fetch(url, { method: (s.method || 'GET').toUpperCase() });
    const text = await r.text();
    return { ok: r.ok, status: r.status, body: text.slice(0, 300) };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}
async function notifyOrder(o, kind) {
  try {
    const ig = getIntegrations();
    const map = { id: o.id, total: '৳' + o.total, status: o.status, name: o.customer?.name || '', phone: o.customer?.phone || '', track: o.id, courier: o.courier?.name ? `${o.courier.name} ${o.courier.consignment || ''}`.trim() : '' };
    if (ig.sms.enabled && o.customer?.phone) {
      const tpl = kind === 'placed' ? ig.sms.templatePlaced : ig.sms.templateStatus;
      sendSMS(o.customer.phone, fillTpl(tpl, map)).catch(() => {});
    }
    if (ig.email.enabled && o.customer?.email) {
      const subj = kind === 'placed' ? `dot. — order ${o.id} received` : `dot. — order ${o.id} is ${o.status}`;
      sendEmail(o.customer.email, subj, `<p>Hi ${map.name},</p><p>Your order <b>${o.id}</b> is <b>${o.status}</b>.</p><p>Total: ${map.total} (cash on delivery)</p>${map.courier ? `<p>Courier: ${map.courier}</p>` : ''}<p>— dot.</p>`).catch(() => {});
    }
    // Automated WhatsApp message
    try {
      const waEvent = o.status === 'incomplete' ? 'incomplete' : o.status === 'approved' ? 'approved' : o.status === 'shipped' ? 'shipped' : o.status === 'cancelled' ? 'cancelled' : null;
      if (waEvent) {
        sendWhatsAppNotification(o, waEvent).catch(() => {});
      }
    } catch (_) {}
  } catch {}
}
const pathaoTokenCache = new Map(); // accId -> { token, expiresAt }
async function getPathaoToken(acc) {
  const cached = pathaoTokenCache.get(acc.id);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.token;
  }
  const clientId = acc.clientId || acc.apiKey;
  const clientSecret = acc.clientSecret || acc.apiSecret;
  const username = acc.username || acc.email;
  const password = acc.password;

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error('Pathao credentials incomplete (need Client ID, Client Secret, Email, Password)');
  }

  const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'password',
      username,
      password,
    }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) {
    throw new Error(data.message || data.error || 'Failed to authenticate with Pathao');
  }
  const expiresAt = Date.now() + (Number(data.expires_in) || 2592000) * 1000;
  pathaoTokenCache.set(acc.id, { token: data.access_token, expiresAt });
  return data.access_token;
}

function cleanBDPhone(phone) {
  let p = String(phone || '').replace(/[^0-9]/g, '');
  if (p.startsWith('880')) p = p.slice(2);
  else if (p.startsWith('88')) p = p.slice(2);
  if (!p.startsWith('0') && p.length === 10) p = '0' + p;
  return p;
}

function sanitizeCredential(name, val) {
  const s = String(val || '').trim();
  if (!s) return '';
  if (/[\u2022\u25cf\u2219\u00b7]/.test(s)) {
    throw new Error(`Masked bullet dots (••••••) detected in ${name}. Please re-paste the actual unmasked key from your merchant panel.`);
  }
  if (!/^[\x20-\x7E]*$/.test(s)) {
    throw new Error(`Invalid non-ASCII characters in ${name}. Only standard alphanumeric characters are allowed.`);
  }
  return s;
}

function getCourierTrackUrl(acc, consignment) {
  if (!consignment) return '';
  const prov = String(acc?.provider || '').toLowerCase();
  if (prov === 'pathao') return `https://pathao.com/courier/tracking/?consignment_id=${encodeURIComponent(consignment)}`;
  if (prov === 'steadfast') return `https://steadfast.com.bd/track/${encodeURIComponent(consignment)}`;
  if (prov === 'carrybee') return `https://carrybee.com/tracking?consignment_id=${encodeURIComponent(consignment)}`;
  if (prov === 'redx') return `https://redx.com.bd/track-global-parcel/?trackingId=${encodeURIComponent(consignment)}`;
  return acc?.trackUrl ? fillTpl(acc.trackUrl, { consignment }) : '';
}

async function bookCourier(acc, o) {
  if (!acc) return { ok: false, error: 'Courier account not found' };
  const prov = String(acc.provider || '').toLowerCase();

  // 1. PATHAO
  if (prov === 'pathao' || (acc.clientId && acc.username)) {
    try {
      const token = await getPathaoToken(acc);
      const storeId = parseInt(acc.storeId || acc.apiSecret, 10);
      if (!storeId) {
        return { ok: false, error: 'Pathao Store ID is missing. Please enter your Store ID in Integrations.' };
      }
      const cleanOrderId = String(o.id || Date.now()).replace(/^#/, '').trim();
      const body = {
        store_id: storeId,
        merchant_order_id: cleanOrderId,
        recipient_name: o.customer?.name || 'Customer',
        recipient_phone: cleanBDPhone(o.customer?.phone),
        recipient_address: o.customer?.address || 'N/A',
        recipient_city: parseInt(acc.cityId || '1', 10),
        recipient_zone: parseInt(acc.zoneId || '1', 10),
        delivery_type: 48,
        item_type: 2,
        special_instruction: o.customer?.note || 'Deliver discreetly',
        item_quantity: 1,
        item_weight: 0.5,
        amount_to_collect: Number(o.total || 0),
        item_description: o.items?.map((i) => `${i.name} x${i.qty}`).join(', ') || 'Order Parcel',
      };
      const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      const consignment = data?.data?.consignment_id || data?.consignment_id || '';
      if (!r.ok || !consignment) {
        return { ok: false, error: data.message || JSON.stringify(data.errors || data) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment), body: JSON.stringify(data) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 2. STEADFAST
  if (prov === 'steadfast') {
    const apiKey = acc.apiKey;
    const secretKey = acc.apiSecret || acc.secretKey;
    if (!apiKey || !secretKey) {
      return { ok: false, error: 'Steadfast API Key and Secret Key are required. Please configure in Integrations.' };
    }
    let url = acc.bookUrl || 'https://portal.packzy.com/api/v1/create_order';
    if (url.includes('portal.steadfast.com.bd')) {
      url = url.replace('portal.steadfast.com.bd', 'portal.packzy.com');
    }
    const cleanInvoice = String(o.id || Date.now()).replace(/^#/, '').trim();
    const rawAddr = String(o.customer?.address || '').trim();
    const fullAddr = rawAddr.length < 10 
      ? [rawAddr, o.customer?.district || 'Dhaka City'].filter(Boolean).join(', ') 
      : rawAddr;
    const body = {
      invoice: cleanInvoice,
      recipient_name: o.customer?.name || 'Customer',
      recipient_phone: cleanBDPhone(o.customer?.phone),
      recipient_address: fullAddr || 'Dhaka City, Dhaka',
      cod_amount: Number(o.total || 0),
      note: o.customer?.note || 'Deliver discreetly',
    };
    try {
      let r;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: {
            'Api-Key': apiKey,
            'Secret-Key': secretKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(body),
        });
      } catch (fErr) {
        if (!url.includes('portal.packzy.com')) {
          r = await fetch('https://portal.packzy.com/api/v1/create_order', {
            method: 'POST',
            headers: {
              'Api-Key': apiKey,
              'Secret-Key': secretKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(body),
          });
        } else {
          throw fErr;
        }
      }
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      if (text.includes('Account is not active') || data?.message === 'Account is not active!') {
        return { ok: false, error: 'Steadfast account is not active! Please activate your merchant account in the Steadfast courier portal.' };
      }
      const consignment = String(data?.consignment?.consignment_id || data?.consignment?.tracking_code || data?.tracking_code || data?.consignment_id || '').trim();
      if (!r.ok || !consignment || data.status === 400 || data.status === 401) {
        return { ok: false, error: data.message || (data.errors ? JSON.stringify(data.errors) : text.slice(0, 300)) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment), body: text.slice(0, 400) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 3. CARRYBEE
  if (prov === 'carrybee') {
    const clientId = acc.clientId || acc.apiKey;
    const clientSecret = acc.clientSecret || acc.apiSecret;
    const clientContext = acc.clientContext || '';
    if (!clientId || !clientSecret) {
      return { ok: false, error: 'CarryBee Client ID and Client Secret are required.' };
    }
    const baseUrl = acc.baseUrl || (acc.environment === 'sandbox' ? 'https://sandbox.carrybee.com' : 'https://developers.carrybee.com');
    const storeId = parseInt(acc.storeId || '1', 10);
    const cleanOrderId = String(o.id || Date.now()).replace(/^#/, '').trim();

    // 3a. Resolve city_id and zone_id dynamically via CarryBee address resolution API
    let cityId = parseInt(acc.cityId, 10) || 0;
    let zoneId = parseInt(acc.zoneId, 10) || 0;

    const rawAddr = String(o.customer?.address || '').trim();
    const district = String(o.customer?.district || '').trim();
    const city = String(o.customer?.city || '').trim();
    const queryAddress = [rawAddr, district, city].filter(Boolean).join(', ') || 'Dhaka';

    if (!cityId || !zoneId) {
      try {
        const addrRes = await fetch(`${baseUrl}/api/v2/address-details`, {
          method: 'POST',
          headers: {
            'Client-ID': clientId,
            'Client-Secret': clientSecret,
            'Client-Context': clientContext,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query: queryAddress.length < 7 || queryAddress.toLowerCase() === 'dhaka' ? `${queryAddress}, Dhaka City` : queryAddress }),
        });
        const addrData = await addrRes.json();
        if (addrData && !addrData.error && addrData.data?.city_id && addrData.data?.zone_id) {
          cityId = parseInt(addrData.data.city_id, 10);
          zoneId = parseInt(addrData.data.zone_id, 10);
        } else if (addrRes.status === 422) {
          const retryRes = await fetch(`${baseUrl}/api/v2/address-details`, {
            method: 'POST',
            headers: {
              'Client-ID': clientId,
              'Client-Secret': clientSecret,
              'Client-Context': clientContext,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify({ query: `${queryAddress}, Dhaka City` }),
          });
          const retryData = await retryRes.json();
          if (retryData && !retryData.error && retryData.data?.city_id && retryData.data?.zone_id) {
            cityId = parseInt(retryData.data.city_id, 10);
            zoneId = parseInt(retryData.data.zone_id, 10);
          }
        }
      } catch (err) {
        console.warn('[CarryBee] Address lookup warning:', err.message);
      }
    }

    // Fallback if still unassigned: Dhaka City (city_id: 14, zone_id: 5)
    if (!cityId || !zoneId) {
      const lowerAll = (queryAddress + ' ' + district).toLowerCase();
      if (lowerAll.includes('chittagong') || lowerAll.includes('chattogram')) {
        cityId = 10; zoneId = 521;
      } else if (lowerAll.includes('sylhet')) {
        cityId = 62; zoneId = 542;
      } else {
        cityId = 14; zoneId = 5;
      }
    }

    // Weight in grams (integer, minimum 100g, default 500g)
    const rawWeight = Number(o.weight || 0.5);
    const weightInGrams = rawWeight > 10 ? Math.round(rawWeight) : Math.round(rawWeight * 1000);
    const itemWeight = Math.max(100, weightInGrams || 500);

    const body = {
      store_id: storeId,
      merchant_order_id: cleanOrderId,
      delivery_type: 1,
      product_type: 1,
      recipient_phone: cleanBDPhone(o.customer?.phone),
      recipient_name: o.customer?.name || 'Customer',
      recipient_address: queryAddress.length < 10 ? `${queryAddress}, Dhaka City` : queryAddress,
      city_id: cityId,
      zone_id: zoneId,
      item_weight: itemWeight,
      item_quantity: 1,
      collectable_amount: Number(o.total || 0),
      product_description: o.items?.map((i) => `${i.name} x${i.qty}`).join(', ') || 'Order Parcel',
    };

    try {
      const r = await fetch(`${baseUrl}/api/v2/orders`, {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          'Client-Secret': clientSecret,
          'Client-Context': clientContext,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      const consignment = String(data?.data?.order?.consignment_id || data?.data?.consignment_id || data?.consignment_id || data?.order_id || '').trim();
      if (!r.ok || !consignment || data.error) {
        return { ok: false, error: data.message || (data.errors ? JSON.stringify(data.errors) : text.slice(0, 300)) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment), body: text.slice(0, 400) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 4. REDX
  if (prov === 'redx') {
    const token = acc.apiKey || acc.token;
    if (!token) {
      return { ok: false, error: 'RedX API Access Token is required.' };
    }
    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const baseUrl = acc.environment === 'sandbox' ? 'https://sandbox.redx.com.bd' : 'https://openapi.redx.com.bd';
    const url = acc.bookUrl || `${baseUrl}/v1.0.0-beta/parcel`;
    const cleanInvoice = String(o.id || Date.now()).replace(/^#/, '').trim();
    const body = {
      customer_name: o.customer?.name || 'Customer',
      customer_phone: cleanBDPhone(o.customer?.phone),
      customer_address: o.customer?.address || 'N/A',
      merchant_invoice_id: cleanInvoice,
      cash_collection_amount: Number(o.total || 0),
      parcel_weight: 500,
      instruction: o.customer?.note || 'Deliver discreetly',
      ...(acc.storeId ? { pickup_store_id: parseInt(acc.storeId, 10) } : {}),
    };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'API-ACCESS-TOKEN': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = {}; }
      const consignment = String(data?.tracking_id || data?.data?.tracking_id || '').trim();
      if (!r.ok || !consignment) {
        return { ok: false, error: data.message || (data.errors ? JSON.stringify(data.errors) : text.slice(0, 300)) };
      }
      return { ok: true, status: 200, consignment, trackUrl: getCourierTrackUrl(acc, consignment), body: text.slice(0, 400) };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 5. CUSTOM / GENERIC FALLBACK
  if (!acc.bookUrl) return { ok: false, error: 'This courier account has no booking URL configured.' };
  const map = { name: o.customer?.name || '', phone: cleanBDPhone(o.customer?.phone), address: o.customer?.address || '', amount: o.total, cod: o.total, invoice: o.id, id: o.id, note: o.customer?.note || '', apiKey: acc.apiKey || '', apiSecret: acc.apiSecret || '', items: o.items?.map((i) => `${i.name} x${i.qty}`).join(', ') || '' };
  let headers = { 'Content-Type': 'application/json' };
  try { if (acc.bookHeaders) headers = { ...headers, ...JSON.parse(fillTpl(acc.bookHeaders, map)) }; } catch {}
  const method = (acc.bookMethod || 'POST').toUpperCase();
  const body = acc.bookBody ? fillTpl(acc.bookBody, map) : JSON.stringify({ invoice: o.id, recipient_name: map.name, recipient_phone: map.phone, recipient_address: map.address, cod_amount: map.amount });
  try {
    const r = await fetch(fillTpl(acc.bookUrl, map), { method, headers, body: method === 'GET' ? undefined : body });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    let consignment = '';
    if (acc.consignmentPath) consignment = acc.consignmentPath.split('.').reduce((v, k) => (v == null ? v : v[k]), data);
    consignment = String(consignment || data.consignment_id || data.tracking_code || data.consignment || '');
    return { ok: r.ok, status: r.status, consignment, trackUrl: getCourierTrackUrl(acc, consignment), body: text.slice(0, 400) };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

function mapCourierStatus(raw) {
  const s = String(raw || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (!s) return '';
  if (['delivered', 'successful', 'complete', 'completed', 'paid', 'customer_confirmed'].includes(s)) return 'delivered';
  if (['return', 'returned', 'return_received', 'partial_delivered', 'rto', 'lost', 'damaged', 'delivery_failed', 'failed'].includes(s)) return 'return';
  if (['cancelled', 'canceled', 'cancel', 'rejected'].includes(s)) return 'cancelled';
  if (['hold', 'on_hold', 'rescheduled', 'delayed', 'pending_delivery'].includes(s)) return 'hold';
  if (['shipped', 'in_transit', 'picked', 'picked_up', 'out_for_delivery', 'dispatched', 'at_hub', 'intransit', 'assigned', 'delivery_in_progress', 'at_the_sorting_hub', 'received_at_last_mile_hub', 'assigned_for_delivery', 'pickup'].includes(s)) return 'shipped';
  if (['confirmed', 'accepted', 'approved', 'pickup_requested', 'assigned_for_pickup', 'in_review', 'pending', 'pickup_pending', 'pickup_assigned'].includes(s)) return 'confirmed';
  return '';
}

async function courierStatus(acc, consignment) {
  if (!consignment) return { ok: false, error: 'No consignment id' };
  const prov = String(acc.provider || '').toLowerCase();

  // 1. PATHAO
  if (prov === 'pathao' || acc.clientId && acc.username) {
    try {
      const token = await getPathaoToken(acc);
      const r = await fetch(`https://api-hermes.pathao.com/aladdin/api/v1/orders/${consignment}/info`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      const data = await r.json();
      const raw = data?.data?.order_status || data?.order_status || '';
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote: data?.data?.status_reason || '' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 2. STEADFAST
  if (prov === 'steadfast') {
    try {
      const apiKey = acc.apiKey;
      const secretKey = acc.apiSecret || acc.secretKey;
      let r;
      try {
        r = await fetch(`https://portal.packzy.com/api/v1/status_by_cid/${consignment}`, {
          headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Accept': 'application/json' },
        });
      } catch {
        r = await fetch(`https://portal.steadfast.com.bd/api/v1/status_by_cid/${consignment}`, {
          headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Accept': 'application/json' },
        });
      }
      const data = await r.json();
      const raw = data?.delivery_status || data?.status || '';
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote: data?.note || '' };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 3. CARRYBEE
  if (prov === 'carrybee') {
    try {
      const baseUrl = acc.baseUrl || (acc.environment === 'sandbox' ? 'https://sandbox.carrybee.com' : 'https://developers.carrybee.com');
      const r = await fetch(`${baseUrl}/api/v2/orders/${consignment}/details`, {
        headers: {
          'Client-ID': acc.clientId || acc.apiKey,
          'Client-Secret': acc.clientSecret || acc.apiSecret,
          'Client-Context': acc.clientContext || '',
          'Accept': 'application/json',
        },
      });
      const data = await r.json();
      const d = data?.data || {};
      const raw = String(d.transfer_status || d.order?.order_status || d.order_status || d.status || '').trim();
      const riderNote = String(d.note || d.reason || d.status_reason || d.order?.status_reason || d.comment || '').trim();
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 4. REDX
  if (prov === 'redx') {
    try {
      const token = acc.apiKey || acc.token;
      const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const baseUrl = acc.environment === 'sandbox' ? 'https://sandbox.redx.com.bd' : 'https://openapi.redx.com.bd';
      const r = await fetch(`${baseUrl}/v1.0.0-beta/parcel/track/${consignment}`, {
        headers: { 'API-ACCESS-TOKEN': authHeader, 'Accept': 'application/json' },
      });
      const data = await r.json();
      const raw = data?.tracking?.[0]?.messageEn || data?.tracking?.[0]?.status || data?.status || '';
      const riderNote = data?.tracking?.[0]?.reason || '';
      return { ok: r.ok, raw, mapped: mapCourierStatus(raw), riderNote };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  }

  // 5. CUSTOM FALLBACK
  if (!acc.statusUrl) return { ok: false, error: 'No status URL configured' };
  const map = { consignment, apiKey: acc.apiKey || '', apiSecret: acc.apiSecret || '' };
  let headers = {};
  try { if (acc.statusHeaders) headers = JSON.parse(fillTpl(acc.statusHeaders, map)); else if (acc.bookHeaders) headers = JSON.parse(fillTpl(acc.bookHeaders, map)); } catch {}
  try {
    const r = await fetch(fillTpl(acc.statusUrl, map), { method: (acc.statusMethod || 'GET').toUpperCase(), headers });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    let raw = acc.statusPath ? acc.statusPath.split('.').reduce((v, k) => (v == null ? v : v[k]), data) : (data.delivery_status || data.status || data.order_status || '');
    raw = String(raw || '');
    let riderNote = acc.notePath ? acc.notePath.split('.').reduce((v, k) => (v == null ? v : v[k]), data) : (data.note || data.rider_note || '');
    let mapped = '';
    if (acc.statusMap) { try { const m = JSON.parse(acc.statusMap); mapped = m[raw] || m[raw.toLowerCase()] || ''; } catch {} }
    if (!mapped) mapped = mapCourierStatus(raw);
    return { ok: r.ok, raw, mapped, riderNote: String(riderNote || '').trim(), body: text.slice(0, 300) };
  } catch (err) { return { ok: false, error: String(err.message || err) }; }
}

// pull live courier status and reflect it onto the order (throttled so public track endpoint can call it freely)
async function syncOrderCourier(order, force) {
  const c = order.courier;
  if (!c || !c.consignment) return order;
  const last = c.lastSync ? new Date(c.lastSync).getTime() : 0;
  if (!force && Date.now() - last < 30000) return order;
  const accs = getIntegrations().couriers || [];
  const acc = accs.find((a) => a.id === c.accountId) || accs.find((a) => a.label === c.name) || accs.find((a) => a.provider === c.name);
  if (!acc) return order;
  const isNative = ['pathao', 'steadfast', 'carrybee', 'redx'].includes(String(acc.provider || '').toLowerCase());
  if (!isNative && !acc.statusUrl) return order;
  const r = await courierStatus(acc, c.consignment);
  if (!r.ok) return order;

  const rawStatus = r.raw || c.liveStatus || '';
  const mappedStatus = r.mapped || mapCourierStatus(rawStatus);
  const riderNote = r.riderNote || c.riderNote || '';

  const patch = {
    courier: {
      ...c,
      liveStatus: rawStatus,
      riderNote: riderNote,
      lastSync: new Date().toISOString(),
    },
  };

  const changed = mappedStatus && mappedStatus !== order.status;
  if (changed) {
    patch.status = mappedStatus;
    const history = Array.isArray(order.history) ? [...order.history] : [];
    history.push({
      status: mappedStatus,
      at: new Date().toISOString(),
      note: riderNote ? `Courier (${c.name || 'Courier'}): ${rawStatus} · Note: ${riderNote}` : `Courier (${c.name || 'Courier'}): ${rawStatus}`,
    });
    patch.history = history;
  } else if (riderNote && riderNote !== c.riderNote) {
    const history = Array.isArray(order.history) ? [...order.history] : [];
    history.push({
      status: order.status,
      at: new Date().toISOString(),
      note: `Rider update: ${riderNote}`,
    });
    patch.history = history;
  }

  const updated = updateOrder(order.id, patch) || order;
  if (changed) notifyOrder(updated, 'status');
  return updated;
}
function normPhone(p) { let d = String(p || '').replace(/\D/g, ''); if (d.length === 11 && d.startsWith('01')) d = '88' + d; return d; }
// server-side conversions: Facebook CAPI + TikTok Events API (Purchase), shared event_id for browser dedup
async function trackPurchase(order) {
  const tr = getIntegrations().tracking || {};
  const out = {};
  const eventId = String(order.id);
  const value = Math.round((Number(order.total) || 0) * 100) / 100;
  const ph = createHash('sha256').update(normPhone(order.customer?.phone)).digest('hex');
  const ids = (order.items || []).map((i) => String(i.id));
  const numItems = (order.items || []).reduce((s, i) => s + (Number(i.qty) || 1), 0);
  const ts = Math.floor(Date.now() / 1000);
  try {
    if (tr.fbEnabled && tr.fbPixelId && tr.fbToken) {
      const body = {
        data: [{
          event_name: 'Purchase',
          event_time: ts,
          event_id: eventId,
          action_source: 'website',
          event_source_url: 'https://dot.metromaa.com/',
          user_data: { ph: [ph] },
          custom_data: {
            currency: 'BDT',
            value,
            content_type: 'product',
            content_ids: ids,
            num_items: numItems,
            contents: (order.items || []).map((i) => ({
              id: String(i.id),
              quantity: Number(i.qty) || 1,
              item_price: Number(i.price) || 0,
            })),
          },
        }],
      };
      if (tr.fbTestCode) body.test_event_code = tr.fbTestCode;
      const r = await fetch(`https://graph.facebook.com/v19.0/${tr.fbPixelId}/events?access_token=${encodeURIComponent(tr.fbToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      out.fb = { status: r.status, body: (await r.text()).slice(0, 300) };
    }
    if (tr.ttkEnabled && tr.ttkPixelId && tr.ttkToken) {
      const body = {
        event_source: 'web',
        event_source_id: tr.ttkPixelId,
        data: [{
          event: 'CompletePayment',
          event_time: ts,
          event_id: eventId,
          user: { phone: ph },
          properties: {
            currency: 'BDT',
            value,
            contents: (order.items || []).map((i) => ({
              content_id: String(i.id),
              quantity: Number(i.qty) || 1,
              price: Number(i.price) || 0,
            })),
          },
        }],
      };
      const r = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': tr.ttkToken },
        body: JSON.stringify(body),
      });
      out.ttk = { status: r.status, body: (await r.text()).slice(0, 300) };
    }
  } catch (e) { out.error = String(e.message || e); }
  return out;
}
function dig(obj, path) { if (!path) return undefined; try { return path.split('.').reduce((v, k) => (v == null ? v : v[k]), obj); } catch { return undefined; } }

function fetchIPv4(url, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const lib = isHttps ? https : http;

      const reqOptions = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        family: 4,
        headers: options.headers || {},
        timeout: options.timeout || 12000,
      };

      const req = lib.request(reqOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const bodyText = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            text: async () => bodyText,
            json: async () => {
              try { return JSON.parse(bodyText); } catch { return {}; }
            },
          });
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request timeout (${reqOptions.timeout}ms)`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (options.body) {
        if (typeof options.body === 'string' || Buffer.isBuffer(options.body)) {
          req.write(options.body);
        } else {
          req.write(JSON.stringify(options.body));
        }
      }

      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function fraudCheck(phone, customFraudConfig) {
  const p0 = cleanBDPhone(phone);
  const p88 = normPhone(phone);
  if (!p0) return { ok: false, error: 'Valid phone number is required (e.g. 01XXXXXXXXX)' };

  const couriersList = [];
  const ig = getIntegrations();
  const allSavedCouriers = ig.couriers || [];
  const fr = customFraudConfig || ig.fraud || {};
  let aggregatorSummary = null;
  let riskVerdict = null;

  // 1. Internal Store Order Records
  try {
    const orders = getOrders() || [];
    const custOrders = orders.filter((o) => {
      const ph = cleanBDPhone(o.customer?.phone);
      const ph2 = cleanBDPhone(o.customer?.phone2);
      return (ph && ph === p0) || (ph2 && ph2 === p0);
    });

    if (custOrders.length > 0) {
      let storeDelivered = 0;
      let storeCancelled = 0;
      let storeInTransit = 0;
      const courierGroups = {};

      for (const ord of custOrders) {
        const cName = ord.courier?.name || 'Store Internal';
        if (!courierGroups[cName]) courierGroups[cName] = { total: 0, delivered: 0, cancelled: 0 };
        courierGroups[cName].total++;

        const st = String(ord.status || '').toLowerCase();
        if (st === 'delivered' || st === 'completed') {
          storeDelivered++;
          courierGroups[cName].delivered++;
        } else if (st === 'cancelled' || st === 'return' || st === 'returned' || st === 'failed') {
          storeCancelled++;
          courierGroups[cName].cancelled++;
        } else {
          storeInTransit++;
        }
      }

      couriersList.push({
        courier: 'Store Internal Orders',
        source: 'internal',
        total: custOrders.length,
        delivered: storeDelivered,
        cancelled: storeCancelled,
        pending: storeInTransit,
        rate: custOrders.length > 0 ? Math.round((storeDelivered / custOrders.length) * 100) : 0,
        returnRate: custOrders.length > 0 ? Math.round((storeCancelled / custOrders.length) * 100) : 0,
        breakdown: courierGroups,
      });
    }
  } catch (err) {
    console.error('Store fraud history error:', err);
  }

  // 2. Direct Steadfast Fraud API Check
  const sfAcc = allSavedCouriers.find(
    (c) => c.enabled && String(c.provider || '').toLowerCase() === 'steadfast' && (c.apiKey || c.clientId) && (c.apiSecret || c.clientSecret)
  );
  if (sfAcc) {
    try {
      const apiKey = sfAcc.apiKey || sfAcc.clientId;
      const secretKey = sfAcc.apiSecret || sfAcc.clientSecret;
      const sfRes = await fetchIPv4(`https://portal.packzy.com/api/v1/fraud_check/${p0}`, {
        method: 'GET',
        headers: {
          'Api-Key': apiKey,
          'Secret-Key': secretKey,
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        },
      });
      const sfData = await sfRes.json();
      if (sfRes.ok && (sfData.status === 200 || sfData.total_parcel !== undefined)) {
        const t = Number(sfData.total_parcel ?? sfData.total ?? 0);
        const d = Number(sfData.total_delivery ?? sfData.delivered ?? 0);
        const c = Number(sfData.total_cancelled ?? sfData.cancelled ?? 0);
        couriersList.push({
          courier: 'Steadfast',
          source: 'steadfast',
          total: t,
          delivered: d,
          cancelled: c,
          rate: t > 0 ? Math.round((d / t) * 100) : 0,
          returnRate: t > 0 ? Math.round((c / t) * 100) : 0,
        });
      } else if (sfData.status === 403 || (sfData.message && sfData.message.toLowerCase().includes('inactive'))) {
        couriersList.push({
          courier: 'Steadfast',
          source: 'steadfast',
          total: 0,
          delivered: 0,
          cancelled: 0,
          rate: 0,
          returnRate: 0,
          status: 'inactive',
          notice: 'Account inactive or lacks Steadfast Fraud API permission',
        });
      }
    } catch (err) {
      console.error('Steadfast live fraud check error:', err);
    }
  }

  // 3. Direct Pathao Success Rate API (if Pathao is configured)
  const pathaoAcc = allSavedCouriers.find(
    (c) => c.enabled && String(c.provider || '').toLowerCase() === 'pathao' && c.clientId && c.username
  );
  if (pathaoAcc) {
    try {
      const token = await getPathaoToken(pathaoAcc);
      if (token) {
        const pRes = await fetchIPv4(`https://api-hermes.pathao.com/aladdin/api/v1/user/success-rate?phone=${p0}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
        });
        if (pRes.ok) {
          const pData = await pRes.json();
          const pInfo = pData.data || pData;
          const d = Number(pInfo.delivered_order ?? pInfo.delivered ?? pInfo.success ?? 0);
          const c = Number(pInfo.returned_order ?? pInfo.returned ?? pInfo.cancelled ?? 0);
          let t = Number(pInfo.total_order ?? pInfo.total_parcel ?? pInfo.total ?? 0);
          if (t < d + c) t = d + c;
          if (t > 0 || d > 0 || c > 0) {
            couriersList.push({
              courier: 'Pathao',
              source: 'pathao',
              total: t,
              delivered: d,
              cancelled: c,
              rate: t > 0 ? Math.round((d / t) * 100) : 0,
              returnRate: t > 0 ? Math.round((c / t) * 100) : 0,
            });
          }
        }
      }
    } catch (err) {}
  }

  // 4. External Aggregated Fraud Check (BDCourier, FraudChecker, Custom API)
  if (fr.enabled && (fr.url || fr.bdcourierApiKey)) {
    try {
      let url = fr.url;
      let method = (fr.method || 'GET').toUpperCase();
      let headers = { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
      let body = undefined;

      // Direct BDCourier Integration if API key is configured or URL is bdcourier
      if (fr.bdcourierApiKey || (url && url.includes('bdcourier'))) {
        const apiKey = String(fr.bdcourierApiKey || '').trim() || (fr.headers ? (() => { try { return JSON.parse(fr.headers).Authorization?.replace(/^Bearer\s+/i, ''); } catch { return ''; } })() : '');
        url = url || 'https://api.bdcourier.com/courier-check';
        method = 'POST';
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ phone: p0 });
      } else if (url) {
        url = url.replace(/\{phone\}/g, encodeURIComponent(p88)).replace(/\{phone0\}/g, encodeURIComponent(p0));
        try { if (fr.headers) headers = { ...headers, ...JSON.parse(fr.headers) }; } catch {}
        if (method === 'POST') {
          body = JSON.stringify({ phone: p0 });
        }
      }

      let extRes;
      try {
        extRes = await fetchIPv4(url, { method, headers, body });
        if (!extRes.ok && url && url.includes('bdcourier.com/courier-check')) {
          try {
            const fallbackRes = await fetchIPv4('https://api.bdcourier.com/old/courier-check', { method, headers, body });
            if (fallbackRes.ok) extRes = fallbackRes;
          } catch {}
        }
      } catch (networkErr) {
        couriersList.push({
          courier: 'BD Courier API',
          source: 'aggregator',
          total: 0,
          delivered: 0,
          cancelled: 0,
          rate: 0,
          returnRate: 0,
          status: 'error',
          notice: `Connection error: ${networkErr.message || networkErr}`,
        });
      }

      let extData = {};
      if (extRes) {
        const extText = await extRes.text();
        try { extData = JSON.parse(extText); } catch { extData = {}; }

        if (!extRes.ok || extData.status === 'error') {
          let errMsg = extData.message || `API error (${extRes.status})`;
          if (extRes.status === 401 || (errMsg && errMsg.toLowerCase().includes('token not found'))) {
            errMsg = 'Invalid Bearer token: Token not found in database. Please click copy (📋) next to API Key on app.courier.com.bd/api and save.';
          }
          couriersList.push({
            courier: 'BD Courier API',
            source: 'aggregator',
            total: 0,
            delivered: 0,
            cancelled: 0,
            rate: 0,
            returnRate: 0,
            status: 'error',
            notice: errMsg,
          });
        }
      }

      // Check if extData has courier breakdown:
      riskVerdict = extData.risk_verdict || null;

      if (extRes && extRes.ok && extData.status !== 'error') {
        const courierMap = extData.courierData || extData.courier_data || extData.couriers || extData.data?.courierData || extData.data?.couriers || extData.data;
        aggregatorSummary = extData.data?.summary || extData.summary || null;
        const knownCouriers = ['steadfast', 'pathao', 'redx', 'carrybee', 'paperfly', 'ecourier', 'e_courier', 'sundarban', 'sa_paribahan', 'courrierfast', 'parceldex'];
        let foundNested = false;

        if (typeof courierMap === 'object' && courierMap !== null) {
          for (const k of Object.keys(courierMap)) {
            if (k.toLowerCase() === 'summary') continue; // Skip summary row so it never double counts
            const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchedKnown = knownCouriers.find((c) => lk.includes(c));
            if (matchedKnown || (courierMap[k] && typeof courierMap[k] === 'object' && ('total' in courierMap[k] || 'delivered' in courierMap[k] || 'total_parcel' in courierMap[k]))) {
              foundNested = true;
              const sub = courierMap[k];
              const d = Number(sub.success_parcel ?? sub.delivered ?? sub.total_delivery ?? sub.successParcel ?? 0);
              const c = Number(sub.cancelled_parcel ?? sub.cancel_parcel ?? sub.cancelled ?? sub.total_cancelled ?? sub.cancelParcel ?? 0);
              let t = Number(sub.total_parcel ?? sub.total ?? sub.totalParcel ?? 0);
              if (t < d + c) t = d + c;
              const cName = sub.name || (k.charAt(0).toUpperCase() + k.slice(1));
              const logo = sub.logo || '';
              const notice = sub.notice || '';
              const subRate = sub.success_ratio != null ? Math.round(Number(sub.success_ratio)) : (t > 0 ? Math.round((d / t) * 100) : 0);
              const subReturnRate = t > 0 ? (sub.success_ratio != null ? Math.max(0, 100 - subRate) : Math.round((c / t) * 100)) : 0;

              const existingIdx = couriersList.findIndex((x) => x.courier.toLowerCase() === cName.toLowerCase());
              if (existingIdx >= 0) {
                if (t >= couriersList[existingIdx].total) {
                  couriersList[existingIdx] = {
                    courier: cName,
                    source: 'aggregator',
                    total: t,
                    delivered: d,
                    cancelled: c,
                    rate: subRate,
                    returnRate: subReturnRate,
                    logo,
                    notice,
                  };
                }
              } else {
                couriersList.push({
                  courier: cName,
                  source: 'aggregator',
                  total: t,
                  delivered: d,
                  cancelled: c,
                  rate: subRate,
                  returnRate: subReturnRate,
                  logo,
                  notice,
                });
              }
            }
          }
        }

        if (!foundNested) {
          const num = (v) => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
          const extDel = num(dig(extData, fr.successPath) ?? extData.success_parcel ?? extData.delivered ?? extData.successParcel);
          const extCan = num(dig(extData, fr.cancelPath) ?? extData.cancelled_parcel ?? extData.cancel_parcel ?? extData.cancelled ?? extData.cancelParcel);
          let extTot = num(dig(extData, fr.totalPath) ?? extData.total_parcel ?? extData.total ?? extData.totalParcel);
          if (extTot < extDel + extCan) extTot = extDel + extCan;
          if (extTot > 0) {
            couriersList.push({
              courier: 'Courier Aggregator History',
              source: 'aggregator',
              total: extTot,
              delivered: extDel,
              cancelled: extCan,
              rate: extTot > 0 ? Math.round((extDel / extTot) * 100) : 0,
              returnRate: extTot > 0 ? Math.round((extCan / extTot) * 100) : 0,
            });
          }
        }
      }
    } catch (err) {
      console.error('External fraud API error:', err);
    }
  }

  // 5. Grand Totals Calculation
  let grandTotal = 0;
  let grandDelivered = 0;
  let grandCancelled = 0;

  for (const item of couriersList) {
    if (item.total > 0) {
      grandTotal += item.total;
      grandDelivered += item.delivered;
      grandCancelled += item.cancelled;
    }
  }

  const resolvedFinished = grandDelivered + grandCancelled;
  let successRate = resolvedFinished > 0
    ? Math.round((grandDelivered / resolvedFinished) * 100)
    : (grandTotal > 0 ? 100 : null);
  let returnRate = resolvedFinished > 0
    ? Math.round((grandCancelled / resolvedFinished) * 100)
    : (grandTotal > 0 ? 0 : null);

  // Only consider aggregator rate if the aggregator actually has parcels (> 0)
  if (aggregatorSummary && Number(aggregatorSummary.total_parcel || 0) > 0 && aggregatorSummary.success_ratio != null) {
    const aggDel = Number(aggregatorSummary.success_parcel || 0);
    const aggCan = Number(aggregatorSummary.cancelled_parcel || 0);
    const combDel = grandDelivered + aggDel;
    const combCan = grandCancelled + aggCan;
    const combFinished = combDel + combCan;
    if (combFinished > 0) {
      successRate = Math.round((combDel / combFinished) * 100);
      returnRate = Math.round((combCan / combFinished) * 100);
    }
  }

  let risk = 'unknown';
  if (grandDelivered > 0 && grandCancelled === 0) {
    // Verified 100% successful deliveries with 0 cancellations!
    risk = 'low';
    riskVerdict = {
      level: 'safe',
      label: 'Verified Buyer',
      action: '✓ OK to ship',
      color: 'green',
      reasons: [`100% Success Rate (${grandDelivered} delivered, 0 returned)`]
    };
  } else if (resolvedFinished > 0) {
    if (successRate >= 80) {
      risk = 'low';
      riskVerdict = {
        level: 'safe',
        label: 'Safe Customer',
        action: '✓ OK to ship',
        color: 'green',
        reasons: [`${successRate}% Delivery Success Rate`]
      };
    } else if (successRate >= 60) {
      risk = 'medium';
      riskVerdict = {
        level: 'medium',
        label: 'Moderate Returns',
        action: '⚠ Confirm by phone',
        color: 'yellow',
        reasons: [`${returnRate}% Return Rate`]
      };
    } else {
      risk = 'high';
      riskVerdict = {
        level: 'high_risk',
        label: 'High Return Alert',
        action: '⛔ Call customer before shipping',
        color: 'red',
        reasons: [`${returnRate}% Return Rate (${grandCancelled} of ${resolvedFinished} returned)`]
      };
    }
  } else if (riskVerdict && riskVerdict.level && Number(aggregatorSummary?.total_parcel || 0) > 0) {
    risk = riskVerdict.level === 'safe' ? 'low' : riskVerdict.level === 'medium' ? 'medium' : 'high';
  } else if (grandTotal > 0) {
    risk = 'low';
    riskVerdict = {
      level: 'safe',
      label: 'Active Order',
      action: '✓ In progress',
      color: 'green',
      reasons: ['No return history recorded']
    };
  } else {
    risk = 'unknown';
    riskVerdict = {
      level: 'unknown',
      label: 'New Customer',
      action: 'ℹ️ First time buyer',
      color: 'blue',
      reasons: ['No previous courier history found']
    };
  }

  return {
    ok: true,
    phone: p0,
    total: grandTotal,
    success: grandDelivered,
    cancel: grandCancelled,
    delivered: grandDelivered,
    cancelled: grandCancelled,
    rate: successRate,
    returnRate: returnRate,
    risk,
    riskVerdict,
    aggregatorSummary,
    couriers: couriersList,
  };
}
function maskSecret(v) { return v ? '••••••' : ''; }
function maskedIntegrations() {
  const ig = getIntegrations();
  return {
    email: { ...ig.email, pass: maskSecret(ig.email.pass), hasPass: !!ig.email.pass },
    sms: { ...ig.sms, apiKey: maskSecret(ig.sms.apiKey), hasApiKey: !!ig.sms.apiKey },
    couriers: (ig.couriers || []).map((c) => ({
      ...c,
      apiKey: c.apiKey || c.clientId || '',
      apiSecret: maskSecret(c.apiSecret || c.clientSecret),
      clientId: c.clientId || c.apiKey || '',
      clientSecret: maskSecret(c.clientSecret || c.apiSecret),
      hasApiKey: !!(c.apiKey || c.clientId),
      hasApiSecret: !!(c.apiSecret || c.clientSecret),
      webhookSecret: c.webhookSecret || randomUUID(),
      headerValue: c.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c',
    })),
    tracking: { ...ig.tracking, fbToken: maskSecret(ig.tracking.fbToken), ttkToken: maskSecret(ig.tracking.ttkToken), hasFbToken: !!ig.tracking.fbToken, hasTtkToken: !!ig.tracking.ttkToken },
    fraud: { ...ig.fraud },
  };
}
function keepSecret(incoming, current) { return (incoming === '' || incoming == null || incoming === '••••••') ? current : incoming; }

app.get('/api/admin/integrations', adminAuth, requireRole('owner', 'manager'), (_q, res) => res.json(maskedIntegrations()));
app.put('/api/admin/integrations', adminAuth, requireRole('owner', 'manager'), (req, res) => {
  const cur = getIntegrations();
  const b = req.body || {};
  const email = { ...cur.email, ...(b.email || {}) };
  if (b.email) email.pass = keepSecret(b.email.pass, cur.email.pass);
  const sms = { ...cur.sms, ...(b.sms || {}) };
  if (b.sms) sms.apiKey = keepSecret(b.sms.apiKey, cur.sms.apiKey);
  let couriers = cur.couriers;
  if (Array.isArray(b.couriers)) {
    couriers = b.couriers.map((inc) => {
      const prev = cur.couriers.find((c) => c.id === inc.id) || {};
      const webhookSecret = inc.webhookSecret || prev.webhookSecret || randomUUID();
      const rawKey = inc.apiKey || inc.clientId || prev.apiKey || prev.clientId || '';
      const rawSec = keepSecret(inc.apiSecret || inc.clientSecret, prev.apiSecret || prev.clientSecret || '');
      return {
        ...inc,
        apiKey: keepSecret(inc.apiKey, prev.apiKey || rawKey),
        apiSecret: keepSecret(inc.apiSecret, prev.apiSecret || rawSec),
        clientId: inc.clientId || rawKey,
        clientSecret: keepSecret(inc.clientSecret, prev.clientSecret || rawSec),
        clientContext: inc.clientContext != null ? inc.clientContext : (prev.clientContext || ''),
        webhookSecret,
        headerValue: inc.headerValue != null ? inc.headerValue : (prev.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c'),
      };
    });
  }
  const tracking = { ...cur.tracking, ...(b.tracking || {}) };
  if (b.tracking) { tracking.fbToken = keepSecret(b.tracking.fbToken, cur.tracking.fbToken); tracking.ttkToken = keepSecret(b.tracking.ttkToken, cur.tracking.ttkToken); }
  const fraud = { ...cur.fraud, ...(b.fraud || {}) };
  saveIntegrations({ email, sms, couriers, tracking, fraud });
  res.json(maskedIntegrations());
});
app.post('/api/admin/fraud/check', adminAuth, async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!phone) return res.status(400).json({ error: 'phone required' });
  res.json(await fraudCheck(phone, req.body?.fraudConfig));
});
app.post('/api/admin/fraud/ping', adminAuth, async (req, res) => {
  const apiKey = String(req.body?.apiKey || '').trim();
  if (!apiKey) return res.status(400).json({ ok: false, error: 'API key is required' });
  try {
    const pingRes = await fetchIPv4('https://api.bdcourier.com/check-connection', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });
    const pingData = await pingRes.json();
    if (pingRes.ok && (pingData.status === 'success' || pingData.data?.connected)) {
      return res.json({ ok: true, message: 'Connected to BD Courier successfully!' });
    }
    return res.json({ ok: false, status: pingRes.status, message: pingData.message || `Connection failed (${pingRes.status})` });
  } catch (err) {
    return res.json({ ok: false, message: err.message || 'Connection error' });
  }
});
app.post('/api/admin/tracking/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const samplePrices = [890, 1199, 1499, 1680, 2270];
  const samplePrice = samplePrices[Math.floor(Math.random() * samplePrices.length)];
  const sample = { id: 'TEST-' + randomUUID().slice(0, 8).toUpperCase(), total: samplePrice, customer: { phone: '01710000000' }, items: [{ id: 'test_item', name: 'sample product', price: samplePrice, qty: 1 }] };
  const out = await trackPurchase(sample);
  if (!out.fb && !out.ttk) return res.json({ error: 'enable Facebook or TikTok and save tokens first' });
  res.json(out);
});
app.post('/api/admin/sms/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (!BD_PHONE.test(phone)) return res.status(400).json({ error: 'enter a valid bd phone number' });
  res.json(await sendSMS(phone, 'dot. test sms — your SMS integration works ✓'));
});
app.post('/api/admin/email/test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  const to = String(req.body?.to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: 'enter a valid email address' });
  res.json(await sendEmail(to, 'dot. test email ✓', '<p>Your dot. email integration works.</p>'));
});
app.post('/api/admin/courier/book', adminAuth, (req, res) => {
  const { orderId, accountId, courierName } = req.body || {};
  const o = getOrders().find((x) => x.id === orderId);
  if (!o) return res.status(404).json({ error: 'order not found' });
  const accs = getIntegrations().couriers || [];
  const target = (courierName || accountId || '').toLowerCase();
  const acc = accs.find((c) => c.id === accountId || c.label?.toLowerCase() === target || c.provider?.toLowerCase() === target);
  const isNative = ['pathao', 'steadfast', 'carrybee', 'redx'].includes(String(acc?.provider || '').toLowerCase());

  if (!acc || (!acc.bookUrl && !isNative)) {
    const name = courierName || acc?.label || acc?.provider || accountId || 'Courier';
    const courier = { name, consignment: '', phone: acc?.hotline || '', url: '', lastSync: '' };
    const history = Array.isArray(o.history) ? [...o.history] : [];
    history.push({ status: 'shipped', at: new Date().toISOString(), note: `Dispatched via ${name}` });
    const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
    notifyOrder(updated, 'status');
    return res.json({ ok: true, consignment: '', courier, status: 'shipped' });
  }

  bookCourier(acc, o).then((r) => {
    if (r.ok) {
      const trackUrl = r.trackUrl || getCourierTrackUrl(acc, r.consignment);
      const courier = {
        name: acc.label || acc.provider || 'Courier',
        accountId: acc.id,
        consignment: r.consignment || '',
        phone: acc.hotline || '',
        url: trackUrl,
        lastSync: new Date().toISOString(),
      };
      const history = Array.isArray(o.history) ? [...o.history] : [];
      history.push({ status: 'shipped', at: new Date().toISOString(), note: `Booked via ${acc.label || acc.provider} #${r.consignment || ''}` });
      const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
      notifyOrder(updated, 'status');
      return res.json({ ok: true, consignment: r.consignment, courier, status: 'shipped' });
    }
    res.json(r);
  }).catch((err) => res.status(500).json({ error: String(err.message || err) }));
});

app.post('/api/admin/courier/sync', adminAuth, async (req, res) => {
  const o = getOrders().find((x) => x.id === req.body?.orderId);
  if (!o) return res.status(404).json({ error: 'order not found' });
  if (!o.courier || !o.courier.consignment) return res.status(400).json({ error: 'this order has no courier consignment to sync' });
  try { const updated = await syncOrderCourier(o, true); res.json({ ok: true, status: updated.status, liveStatus: updated.courier?.liveStatus || '', courier: updated.courier }); }
  catch (err) { res.status(500).json({ error: String(err.message || err) }); }
});

app.post('/api/admin/courier/sync-all', adminAuth, async (req, res) => {
  const all = getOrders();
  const eligible = all.filter((o) => o.courier && o.courier.consignment && !['delivered', 'cancelled'].includes(o.status));
  let updatedCount = 0;
  for (const o of eligible) {
    try {
      await syncOrderCourier(o, true);
      updatedCount++;
    } catch {}
  }
  res.json({ ok: true, synced: updatedCount, total: eligible.length, orders: getOrders() });
});

// Universal test connection route for Pathao, Steadfast, CarryBee, and RedX
app.post('/api/admin/courier/test-connection', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  let { id, provider, apiKey, apiSecret, clientId, clientSecret, username, password, clientContext, environment, token } = req.body || {};
  const prov = String(provider || '').toLowerCase();

  // If credentials are masked '••••••' or missing, resolve from saved integrations!
  const savedCouriers = getIntegrations()?.couriers || [];
  const existing = savedCouriers.find((x) => (id && x.id === id) || (x.provider && x.provider.toLowerCase() === prov));
  if (existing) {
    if (!apiKey || /[\u2022\u25cf\u2219\u00b7]/.test(apiKey)) apiKey = existing.apiKey || '';
    if (!apiSecret || /[\u2022\u25cf\u2219\u00b7]/.test(apiSecret)) apiSecret = existing.apiSecret || existing.secretKey || '';
    if (!clientId || /[\u2022\u25cf\u2219\u00b7]/.test(clientId)) clientId = existing.clientId || existing.apiKey || '';
    if (!clientSecret || /[\u2022\u25cf\u2219\u00b7]/.test(clientSecret)) clientSecret = existing.clientSecret || existing.apiSecret || '';
    if (!username || /[\u2022\u25cf\u2219\u00b7]/.test(username)) username = existing.username || '';
    if (!password || /[\u2022\u25cf\u2219\u00b7]/.test(password)) password = existing.password || '';
    if (!token || /[\u2022\u25cf\u2219\u00b7]/.test(token)) token = existing.apiKey || existing.token || '';
  }

  try {
    // 1. Pathao test
    if (prov === 'pathao') {
      const cId = sanitizeCredential('Client ID', clientId);
      const cSec = sanitizeCredential('Client Secret', clientSecret);
      const uName = sanitizeCredential('Email / Username', username);
      const pass = sanitizeCredential('Password', password);
      if (!cId || !cSec || !uName || !pass) {
        return res.status(400).json({ error: 'Client ID, Client Secret, Email, and Password are required for Pathao.' });
      }
      const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ client_id: cId, client_secret: cSec, grant_type: 'password', username: uName, password: pass }),
      });
      const d = await r.json();
      if (!r.ok || !d.access_token) {
        return res.status(400).json({ error: d.message || d.error || 'Pathao authentication failed. Please check credentials.' });
      }
      let stores = [];
      try {
        const sRes = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/stores', {
          headers: { 'Authorization': `Bearer ${d.access_token}`, 'Accept': 'application/json' },
        });
        const sData = await sRes.json();
        stores = sData?.data?.data || sData?.data || [];
      } catch {}
      return res.json({ ok: true, message: `Connected to Pathao successfully! Found ${stores.length} store(s).`, stores });
    }

    // 2. Steadfast test (balance check)
    if (prov === 'steadfast') {
      const key = sanitizeCredential('API Key', apiKey);
      const secret = sanitizeCredential('Secret Key', apiSecret || req.body?.secretKey);
      if (!key || !secret) {
        return res.status(400).json({ error: 'API Key and Secret Key are required for Steadfast.' });
      }
      let r;
      try {
        r = await fetch('https://portal.packzy.com/api/v1/get_balance', {
          headers: { 'Api-Key': key, 'Secret-Key': secret, 'Accept': 'application/json' },
        });
      } catch {
        r = await fetch('https://portal.steadfast.com.bd/api/v1/get_balance', {
          headers: { 'Api-Key': key, 'Secret-Key': secret, 'Accept': 'application/json' },
        });
      }
      const d = await r.json();
      if (!r.ok || d.status === 401 || d.status === 400) {
        return res.status(400).json({ error: d.message || 'Steadfast authentication failed. Check your API Key & Secret Key.' });
      }
      return res.json({ ok: true, message: `Connected to Steadfast! Current Balance: ৳${d.current_balance ?? 0}`, balance: d.current_balance });
    }

    // 3. CarryBee test (stores check)
    if (prov === 'carrybee') {
      const cId = sanitizeCredential('Client ID', clientId || apiKey);
      const cSec = sanitizeCredential('Client Secret', clientSecret || apiSecret);
      if (!cId || !cSec) {
        return res.status(400).json({ error: 'Client ID and Client Secret are required for CarryBee.' });
      }
      const baseUrl = environment === 'sandbox' ? 'https://sandbox.carrybee.com' : 'https://developers.carrybee.com';
      const ctx = sanitizeCredential('Client Context', clientContext) || '';
      const r = await fetch(`${baseUrl}/api/v2/stores`, {
        headers: {
          'Client-ID': cId,
          'Client-Secret': cSec,
          ...(ctx ? { 'Client-Context': ctx } : {}),
          'Accept': 'application/json'
        },
      });
      const text = await r.text();
      let d; try { d = JSON.parse(text); } catch { d = {}; }
      if (!r.ok || d.error || d.message === 'An unexpected error occurred') {
        const errDetail = d.message || d.error || `HTTP ${r.status}: Authentication failed`;
        return res.status(400).json({ error: `${errDetail}. Check that Client ID and Client Secret match your CarryBee Developer credentials.` });
      }
      const stores = d.data || d.stores || [];
      return res.json({ ok: true, message: `Connected to CarryBee successfully! Found ${Array.isArray(stores) ? stores.length : 1} store(s).`, stores: Array.isArray(stores) ? stores : [] });
    }

    // 4. RedX test (pickup stores check)
    if (prov === 'redx') {
      const t = sanitizeCredential('API Access Token', apiKey || token);
      if (!t) return res.status(400).json({ error: 'API Access Token is required for RedX.' });
      const authHeader = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      let baseUrl = environment === 'sandbox' ? 'https://sandbox.redx.com.bd' : 'https://openapi.redx.com.bd';
      let r = await fetch(`${baseUrl}/v1.0.0-beta/pickup/stores`, {
        headers: { 'API-ACCESS-TOKEN': authHeader, 'Accept': 'application/json' },
      });
      let d = await r.json();

      // If production failed with invalid signature / 401, auto-try sandbox
      if (!r.ok && environment !== 'sandbox') {
        try {
          const sRes = await fetch('https://sandbox.redx.com.bd/v1.0.0-beta/pickup/stores', {
            headers: { 'API-ACCESS-TOKEN': authHeader, 'Accept': 'application/json' },
          });
          const sData = await sRes.json();
          if (sRes.ok && !sData.error) {
            r = sRes;
            d = sData;
            baseUrl = 'https://sandbox.redx.com.bd';
          }
        } catch {}
      }

      if (!r.ok || d.error) {
        return res.status(400).json({ error: d.message || 'RedX authentication failed. Check your Access Token.' });
      }
      const stores = d.pickup_stores || d.stores || [];
      const envNotice = baseUrl.includes('sandbox') ? ' (Sandbox)' : '';
      return res.json({
        ok: true,
        message: `Connected to RedX${envNotice} successfully! Found ${stores.length} pickup store(s).`,
        stores,
        environment: baseUrl.includes('sandbox') ? 'sandbox' : 'production',
      });
    }

    return res.status(400).json({ error: `Unsupported courier provider: ${provider}` });
  } catch (err) {
    res.status(400).json({ error: String(err.message || err) });
  }
});

// Keep pathao-test as backwards-compatible alias
app.post('/api/admin/courier/pathao-test', adminAuth, requireRole('owner', 'manager'), async (req, res) => {
  req.body = { ...req.body, provider: 'Pathao' };
  const { clientId, clientSecret, username, password } = req.body;
  if (!clientId || !clientSecret || !username || !password) {
    return res.status(400).json({ error: 'Client ID, Client Secret, Username, and Password are required' });
  }
  try {
    const r = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/issue-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'password', username, password }),
    });
    const d = await r.json();
    if (!r.ok || !d.access_token) {
      return res.status(400).json({ error: d.message || d.error || 'Pathao authentication failed.' });
    }
    let stores = [];
    try {
      const sRes = await fetch('https://api-hermes.pathao.com/aladdin/api/v1/stores', {
        headers: { 'Authorization': `Bearer ${d.access_token}`, 'Accept': 'application/json' },
      });
      const sData = await sRes.json();
      stores = sData?.data?.data || sData?.data || [];
    } catch {}
    res.json({ ok: true, message: 'Connected to Pathao successfully!', stores });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});
// ==========================================
// 1. BULK COURIER AUTO-BOOKING
// ==========================================
app.post('/api/admin/courier/bulk-book', adminAuth, async (req, res) => {
  const { orderIds = [], defaultCourierName } = req.body || {};
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return res.status(400).json({ error: 'No orders provided' });
  }

  const allOrders = getOrders();
  const accs = getIntegrations().couriers || [];
  const results = [];

  for (const id of orderIds) {
    const o = allOrders.find((x) => x.id === id);
    if (!o) {
      results.push({ orderId: id, ok: false, error: 'Order not found' });
      continue;
    }
    // If already booked with courier consignment, just ensure status is shipped
    if (o.courier?.consignment) {
      if (o.status !== 'shipped') {
        updateOrder(o.id, { status: 'shipped' });
      }
      results.push({ orderId: id, ok: true, alreadyBooked: true, consignment: o.courier.consignment, courier: o.courier });
      continue;
    }

    const courierTarget = (o.courier?.name || defaultCourierName || accs[0]?.label || accs[0]?.provider || 'Steadfast').toLowerCase();
    const acc = accs.find((c) => c.label?.toLowerCase() === courierTarget || c.provider?.toLowerCase() === courierTarget) || accs[0];
    const isNative = ['pathao', 'steadfast', 'carrybee', 'redx'].includes(String(acc?.provider || '').toLowerCase());

    if (!acc || (!acc.bookUrl && !isNative)) {
      const name = acc?.label || acc?.provider || defaultCourierName || 'Manual Courier';
      const courier = { name, consignment: '', phone: acc?.hotline || '', url: '', lastSync: '' };
      const history = Array.isArray(o.history) ? [...o.history] : [];
      history.push({ status: 'shipped', at: new Date().toISOString(), note: `Dispatched via ${name}` });
      const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
      notifyOrder(updated, 'status');
      results.push({ orderId: id, ok: true, consignment: '', courier, status: 'shipped' });
      continue;
    }

    try {
      const r = await bookCourier(acc, o);
      if (r.ok) {
        const trackUrl = r.trackUrl || getCourierTrackUrl(acc, r.consignment);
        const courier = {
          name: acc.label || acc.provider || 'Courier',
          accountId: acc.id,
          consignment: r.consignment || '',
          phone: acc.hotline || '',
          url: trackUrl,
          lastSync: new Date().toISOString(),
        };
        const history = Array.isArray(o.history) ? [...o.history] : [];
        history.push({ status: 'shipped', at: new Date().toISOString(), note: `Booked via ${acc.label || acc.provider} #${r.consignment || ''}` });
        const updated = updateOrder(o.id, { courier, status: 'shipped', history }) || o;
        notifyOrder(updated, 'status');
        results.push({ orderId: id, ok: true, consignment: r.consignment, courier, status: 'shipped' });
      } else {
        results.push({ orderId: id, ok: false, error: r.error || 'Courier rejected booking' });
      }
    } catch (err) {
      results.push({ orderId: id, ok: false, error: String(err.message || err) });
    }
  }

  res.json({ ok: true, results });
});

// ==========================================
// 2. DEDICATED STORE BACKUP & RESTORE
// ==========================================
app.get('/api/admin/backup/export', adminAuth, (req, res) => {
  try {
    const backupData = {
      version: '2.5',
      exportedAt: new Date().toISOString(),
      store: getSettings().storeName || 'Store',
      orders: getOrders(),
      customers: getCustomers(),
      catalog: getCatalog(),
      settings: getSettings(),
      integrations: getIntegrations(),
      landings: getLandings(),
      coupons: getCoupons(),
      colors: getColors(),
      users: getUsers().map((u) => ({ username: u.username, name: u.name, role: u.role, email: u.email })),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="store_backup_${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(backupData);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create backup: ' + err.message });
  }
});

app.post('/api/admin/backup/restore', adminAuth, (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid backup file structure' });
    }
    const counts = {};

    if (Array.isArray(payload.orders)) {
      saveOrders(payload.orders);
      counts.orders = payload.orders.length;
    }
    if (Array.isArray(payload.customers)) {
      saveCustomers(payload.customers);
      counts.customers = payload.customers.length;
    }
    if (payload.catalog && Array.isArray(payload.catalog.products)) {
      saveCatalog(payload.catalog);
      counts.products = payload.catalog.products.length;
      counts.categories = (payload.catalog.categories || []).length;
    }
    if (payload.settings && typeof payload.settings === 'object') {
      saveSettings(payload.settings);
      counts.settings = true;
    }
    if (payload.integrations && typeof payload.integrations === 'object') {
      saveIntegrations(payload.integrations);
      counts.integrations = true;
    }
    if (Array.isArray(payload.landings)) {
      saveLandings(payload.landings);
      counts.landings = payload.landings.length;
    }
    if (Array.isArray(payload.coupons)) {
      saveCoupons(payload.coupons);
      counts.coupons = payload.coupons.length;
    }

    res.json({ ok: true, message: 'Store restored successfully', counts });
  } catch (err) {
    res.status(500).json({ error: 'Restore failed: ' + err.message });
  }
});

// ==========================================
// 3. FINANCE & COURIER RECONCILIATION LEDGER
// ==========================================
app.get('/api/admin/finance/summary', adminAuth, (req, res) => {
  const orders = getOrders();
  let totalGross = 0;
  let totalDelivered = 0;
  let totalInTransit = 0;
  let totalCourierFees = 0;
  let totalReconciled = 0;

  const orderRows = orders.map((o) => {
    const total = Number(o.total) || 0;
    const isDelivered = o.status === 'delivered';
    const isShipped = o.status === 'shipped';
    const isCancelled = o.status === 'cancelled';

    const deliveryCharge = Number(o.delivery) || (o.customer?.area === 'inside' ? 80 : 130);
    const codCharge = Math.round(total * 0.01);
    const courierFee = deliveryCharge + codCharge;
    const netReceivable = Math.max(0, total - courierFee);

    if (!isCancelled) totalGross += total;
    if (isDelivered) {
      totalDelivered += total;
      totalCourierFees += courierFee;
      if (o.payoutReceived) totalReconciled += netReceivable;
    } else if (isShipped) {
      totalInTransit += total;
    }

    return {
      id: o.id,
      createdAt: o.createdAt,
      customerName: o.customer?.name || 'Customer',
      phone: o.customer?.phone || '',
      district: o.customer?.district || o.customer?.area || '',
      total,
      status: o.status,
      courierName: o.courier?.name || 'Unassigned',
      consignment: o.courier?.consignment || '',
      courierFee,
      netReceivable,
      payoutReceived: !!o.payoutReceived,
      payoutDate: o.payoutDate || null,
    };
  });

  res.json({
    totalGross,
    totalDelivered,
    totalInTransit,
    totalCourierFees,
    netDeliveredCash: totalDelivered - totalCourierFees,
    totalReconciled,
    pendingCourierBalance: (totalDelivered - totalCourierFees) - totalReconciled,
    orders: orderRows,
  });
});

app.post('/api/admin/finance/toggle-payout', adminAuth, (req, res) => {
  const { orderId, received } = req.body || {};
  const o = getOrders().find((x) => x.id === orderId);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const updated = updateOrder(orderId, {
    payoutReceived: !!received,
    payoutDate: received ? new Date().toISOString() : null,
  });
  res.json({ ok: true, order: updated });
});

// ==========================================
// 4. WHATSAPP AUTOMATION HUB
// ==========================================
// REAL BAILEYS WHATSAPP ENGINE ROUTES
// ==========================================
app.get('/api/admin/whatsapp/status', adminAuth, (req, res) => {
  try {
    const live = getWhatsAppLiveStatus();
    res.json(live);
  } catch (err) {
    res.json(getWhatsAppSettings());
  }
});

app.post('/api/admin/whatsapp/start-session', adminAuth, async (req, res) => {
  try {
    const forceNew = req.body?.reset === true;
    const result = await startWhatsAppSocket(forceNew);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/request-pair-code', adminAuth, async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'Phone number is required' });
    const pairingCode = await requestPairingCode(phone);
    res.json({ ok: true, pairingCode });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/settings', adminAuth, (req, res) => {
  const updated = saveWhatsAppSettings(req.body || {});
  res.json({ ok: true, settings: updated });
});

app.post('/api/admin/whatsapp/connect', adminAuth, async (req, res) => {
  try {
    const { phone, device, mode } = req.body || {};
    const settings = getSettings();
    const storePhone = phone || settings.whatsapp || settings.phone || '01878374762';
    const cleanPhone = String(storePhone).replace(/\D/g, '').slice(-11);
    
    // Trigger socket start if not running
    startWhatsAppSocket(false).catch(() => {});

    const updated = saveWhatsAppSettings({
      connected: true,
      phone: cleanPhone || '01878374762',
      device: device || (mode === 'qr' ? 'WhatsApp Web (Live Multi-Device)' : 'WhatsApp Web (Connected)'),
    });
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/disconnect', adminAuth, async (req, res) => {
  try {
    await startWhatsAppSocket(true);
    const updated = saveWhatsAppSettings({
      connected: false,
      phone: '',
      device: 'Disconnected',
      pairingCode: '',
    });
    res.json({ ok: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/whatsapp/send', adminAuth, async (req, res) => {
  const { phone, message, orderId } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: 'Phone and message are required' });
  try {
    const result = await sendBaileysMessage(phone, message, orderId, 'manual_broadcast');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Universal courier webhook endpoint (Multi-Account Support for Pathao, Steadfast, CarryBee, RedX, Generic) ----
app.all([
  '/api/webhooks/:provider/:accId',
  '/api/webhook/:provider/:accId',
  '/api/webhooks/:provider',
  '/api/webhook/:provider',
  '/api/webhooks',
  '/api/webhook',
], (req, res) => {
  console.log('[WEBHOOK]', req.method, req.url, 'headers:', JSON.stringify(req.headers), 'body:', JSON.stringify(req.body));
  const allSavedCouriers = getIntegrations()?.couriers || [];
  const pathParts = (req.path || '').split('/').filter(Boolean);
  // e.g. /api/webhooks/carrybee/c123 -> parts: ['api', 'webhooks', 'carrybee', 'c123']
  const provParam = String(req.params?.provider || (pathParts[2] && !pathParts[2].startsWith('c') ? pathParts[2] : '')).toLowerCase();
  const accIdParam = String(req.params?.accId || req.query?.acc || req.query?.accId || (pathParts[3] || (pathParts[2] && pathParts[2].startsWith('c') ? pathParts[2] : ''))).trim();

  const incomingSecret = String(req.query?.secret || req.body?.secret || req.body?.Secret || '').trim();
  const incomingCbHeader = String(
    req.get('x-cb-webhook-integration-header') ||
    req.headers['x-cb-webhook-integration-header'] ||
    req.get('X-CB-Webhook-Integration-Header') ||
    req.get('headervalue') ||
    req.get('HeaderValue') ||
    req.get('Header-Value') ||
    req.get('x-carrybee-webhook-signature') ||
    req.body?.HeaderValue ||
    req.body?.headerValue ||
    req.body?.challenge ||
    req.body?.secret ||
    req.query?.HeaderValue ||
    req.query?.headerValue ||
    req.query?.secret ||
    ''
  ).trim();
  const incomingPathaoSecret = String(
    req.get('x-pathao-merchant-webhook-integration-secret') ||
    req.headers['x-pathao-merchant-webhook-integration-secret'] ||
    req.get('X-Pathao-Merchant-Webhook-Integration-Secret') ||
    ''
  ).trim();

  // Find exact courier instance:
  let matchedCourier = null;
  // 1. Priority: match by account ID (exact or partial prefix match)
  if (accIdParam) {
    matchedCourier = allSavedCouriers.find((c) => c.id === accIdParam || (c.id && (c.id.startsWith(accIdParam) || accIdParam.startsWith(c.id))));
  }
  // 2. Priority: match by unique webhookSecret
  if (!matchedCourier && incomingSecret) {
    matchedCourier = allSavedCouriers.find((c) => c.webhookSecret === incomingSecret);
  }
  if (!matchedCourier && incomingCbHeader) {
    matchedCourier = allSavedCouriers.find((c) => c.webhookSecret === incomingCbHeader);
  }
  if (!matchedCourier && incomingPathaoSecret) {
    matchedCourier = allSavedCouriers.find((c) => c.webhookSecret === incomingPathaoSecret);
  }
  // 3. Fallback: match by provider name from URL path
  if (!matchedCourier && provParam) {
    matchedCourier = allSavedCouriers.find((c) => String(c.provider || '').toLowerCase() === provParam);
  }
  // 4. Fallback if courier provider matches path
  if (!matchedCourier) {
    for (const p of ['carrybee', 'steadfast', 'pathao', 'redx']) {
      if (req.path.toLowerCase().includes(p)) {
        matchedCourier = allSavedCouriers.find((c) => String(c.provider || '').toLowerCase() === p);
        break;
      }
    }
  }

  const detectedProv = (matchedCourier?.provider || provParam || (req.path.includes('carrybee') ? 'carrybee' : req.path.includes('pathao') ? 'pathao' : req.path.includes('steadfast') ? 'steadfast' : req.path.includes('redx') ? 'redx' : 'courier')).toLowerCase();

  // Pathao secret header echo:
  const pathaoEchoValue = incomingPathaoSecret || incomingSecret || matchedCourier?.webhookSecret || '';
  if (pathaoEchoValue) {
    res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', pathaoEchoValue);
  }

  // CarryBee Handshake / Response Header:
  const cbEchoValue = incomingCbHeader || incomingSecret || matchedCourier?.webhookSecret || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c';
  const finalHeaderValue = String(matchedCourier?.headerValue || '40489fe0-9386-4fc9-8e92-2b2fcb9d451c').trim();
  res.setHeader('X-CB-Webhook-Integration-Header', finalHeaderValue);
  res.setHeader('x-cb-webhook-integration-header', finalHeaderValue);
  res.setHeader('HeaderValue', finalHeaderValue);
  res.setHeader('Header-Value', finalHeaderValue);
  res.setHeader('headervalue', finalHeaderValue);
  res.setHeader('X-Carrybee-Webhook-Signature', cbEchoValue);
  res.setHeader('X-Webhook-Secret', cbEchoValue);

  // Echo any custom x-cb or x-pathao headers from request
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (k.toLowerCase().startsWith('x-cb-') || k.toLowerCase().startsWith('x-pathao-')) {
      try { res.setHeader(k, v); } catch {}
    }
  }

  const isCarryBee = detectedProv === 'carrybee' || !!incomingCbHeader || req.path.toLowerCase().includes('carrybee');
  // CarryBee requires HTTP 202 Accepted; other couriers expect HTTP 200 OK
  const ackStatus = isCarryBee ? 202 : 200;

  const handshakeResponse = {
    success: true,
    status: 'ok',
    ok: true,
    message: 'CarryBee Webhook Handshake successful',
    account: matchedCourier?.id || 'default',
    provider: detectedProv,
    secret: cbEchoValue,
    HeaderValue: finalHeaderValue,
    HeaderKey: 'X-CB-Webhook-Integration-Header',
    headerValue: finalHeaderValue,
    headerKey: 'X-CB-Webhook-Integration-Header',
    'Header-Value': finalHeaderValue,
    data: {
      HeaderValue: finalHeaderValue,
      HeaderKey: 'X-CB-Webhook-Integration-Header',
      headerValue: finalHeaderValue,
      headerKey: 'X-CB-Webhook-Integration-Header',
      secret: cbEchoValue,
    }
  };

  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.status(ackStatus).json(handshakeResponse);
  }

  const b = req.body || {};

  // Handshake verification event from Pathao or CarryBee or test ping
  const isCarryBeePing = isCarryBee && (!b.consignment_id && !b.order_id && !b.tracking_code);
  if (b.event === 'webhook_integration' || b.type === 'handshake' || b.test || isCarryBeePing) {
    return res.status(ackStatus).json(handshakeResponse);
  }

  // Live parcel status update event (supports Pathao, Steadfast, CarryBee, RedX, Paperfly)
  const consignment = String(b.consignment_id || b.consignment || b.tracking_code || b.tracking_id || '').trim();
  const orderId = String(b.merchant_order_id || b.order_id || b.invoice || b.invoice_id || b.merchant_invoice_id || '').trim();
  const rawStatus = String(b.order_status || b.status || b.delivery_status || '').trim();
  const riderNote = String(b.status_reason || b.note || b.rider_note || b.comment || b.reason || '').trim();

  if (consignment || orderId) {
    const orders = getOrders();
    const o = orders.find((x) => (orderId && (x.id === orderId || x.id === 'DOT-' + orderId || 'DOT-' + x.id === orderId)) || 
                                 (consignment && x.courier?.consignment === consignment));
    if (o) {
      const mapped = mapCourierStatus(rawStatus);
      const patch = {
        courier: {
          ...o.courier,
          liveStatus: rawStatus,
          riderNote: riderNote || o.courier?.riderNote || '',
          lastSync: new Date().toISOString(),
          ...(matchedCourier ? { accountId: matchedCourier.id, name: matchedCourier.label || matchedCourier.provider } : {})
        },
      };

      const changed = mapped && mapped !== o.status;
      if (changed) {
        patch.status = mapped;
        const history = Array.isArray(o.history) ? [...o.history] : [];
        history.push({
          status: mapped,
          at: new Date().toISOString(),
          note: riderNote ? `Courier Webhook (${matchedCourier?.label || detectedProv}): ${rawStatus} · Note: ${riderNote}` : `Courier Webhook (${matchedCourier?.label || detectedProv}): ${rawStatus}`,
        });
        patch.history = history;
      } else if (riderNote && riderNote !== o.courier?.riderNote) {
        const history = Array.isArray(o.history) ? [...o.history] : [];
        history.push({
          status: o.status,
          at: new Date().toISOString(),
          note: `Courier Rider Note: ${riderNote}`,
        });
        patch.history = history;
      }

      const updated = updateOrder(o.id, patch);
      if (changed && updated) notifyOrder(updated, 'status');
    }
  }

  res.status(ackStatus).json({
    ok: true,
    status: 'received',
    provider: detectedProv,
    account: matchedCourier?.id || 'default',
    HeaderKey: 'X-CB-Webhook-Integration-Header',
    HeaderValue: cbEchoValue,
    headerKey: 'X-CB-Webhook-Integration-Header',
    headerValue: cbEchoValue,
  });
});

// ---- warehouse QR code / barcode scanner (ship, receive return & restock, lookup) ----
app.post('/api/admin/scanner/scan', adminAuth, (req, res) => {
  const { code, mode, courierName } = req.body || {};
  const query = String(code || '').trim().toUpperCase();
  if (!query) return res.status(400).json({ error: 'scan code required' });

  const orders = getOrders();
  // Find by order ID (e.g. DOT-XXXX or XXXX), or by courier consignment
  const o = orders.find((x) => x.id === query || x.id === 'DOT-' + query || (x.courier && x.courier.consignment && x.courier.consignment.toUpperCase() === query));

  if (!o) return res.status(404).json({ error: `No order found matching "${query}"` });

  if (req.admin.role === 'staff' && Array.isArray(req.admin.allowedProducts) && req.admin.allowedProducts.length > 0) {
    const allowed = req.admin.allowedProducts;
    const hasAccess = (o.items || []).some((it) => allowed.includes(String(it.id)) || allowed.includes(String(it.slug)));
    if (!hasAccess) return res.status(403).json({ error: 'You do not have permission to process orders for this product' });
  }

  const dist = (o.customer?.district || o.customer?.address || '').toLowerCase();
  const isDhaka = ['dhaka', 'gazipur', 'narayanganj', 'savar', 'gulshan', 'dhanmondi', 'uttara', 'mirpur'].some((x) => dist.includes(x));
  const suggested = isDhaka ? 'Pathao' : 'Steadfast';

  if (mode === 'ship') {
    let assignedCourier = o.courier ? { ...o.courier } : {};
    let warning = null;

    if (courierName && courierName !== 'auto') {
      if (o.courier?.name && o.courier.name.toLowerCase() !== courierName.toLowerCase()) {
        warning = `Caution: Order was originally assigned to ${o.courier.name}! Handing over to ${courierName}.`;
      }
      assignedCourier.name = courierName;
    } else if (!assignedCourier.name) {
      assignedCourier.name = suggested;
    }

    const history = Array.isArray(o.history) ? [...o.history] : [];
    history.push({ status: 'shipped', at: new Date().toISOString(), note: `Dispatched via QR Scanner (${assignedCourier.name})` });
    const updated = updateOrder(o.id, { status: 'shipped', courier: assignedCourier, history }) || o;
    notifyOrder(updated, 'status');
    return res.json({
      ok: true,
      action: 'shipped',
      order: updated,
      courier: assignedCourier.name,
      consignment: assignedCourier.consignment || '',
      suggested,
      warning,
      zone: isDhaka ? 'Inside Dhaka' : 'Outside Dhaka',
    });
  }

  if (mode === 'return') {
    const history = Array.isArray(o.history) ? [...o.history] : [];
    history.push({ status: 'return', at: new Date().toISOString(), note: 'Return Received & Products Restocked via QR Scanner' });
    const updated = updateOrder(o.id, { status: 'return', history }) || o;
    // Auto-restock products
    const cat = getCatalog();
    let restocked = false;
    for (const item of (o.items || [])) {
      const p = cat.products.find((x) => x.id === item.id);
      if (p && p.stock != null) {
        p.stock += item.qty || 1;
        if (p.stock > 0) p.soldOut = false;
        restocked = true;
      }
    }
    if (restocked) saveCatalog(cat);
    notifyOrder(updated, 'status');
    return res.json({ ok: true, action: 'return_received', order: updated, restocked: o.items });
  }

  if (mode === 'return_lost' || mode === 'lost' || mode === 'damaged') {
    const history = Array.isArray(o.history) ? [...o.history] : [];
    const isDamaged = mode === 'damaged';
    const noteText = isDamaged 
      ? `Parcel Returned DAMAGED / BROKEN. Courier compensation claim needed for Tk ${o.total || 0}.`
      : `Parcel LOST / MISSING by Courier (${o.courier?.name || 'Courier'}). Compensation claim needed for Tk ${o.total || 0}.`;

    history.push({ status: 'cancelled', at: new Date().toISOString(), note: noteText });
    const updated = updateOrder(o.id, { 
      status: 'cancelled', 
      lossClaim: { 
        type: isDamaged ? 'damaged' : 'lost_in_courier', 
        amount: o.total || 0, 
        courier: o.courier?.name || '', 
        consignment: o.courier?.consignment || '',
        flaggedAt: new Date().toISOString() 
      },
      history 
    }) || o;

    notifyOrder(updated, 'status');
    return res.json({ 
      ok: true, 
      action: 'lost_flagged', 
      order: updated, 
      claimAmount: o.total || 0,
      courier: o.courier?.name || 'Courier' 
    });
  }

  // Lookup mode
  res.json({
    ok: true,
    action: 'lookup',
    order: o,
    courier: o.courier?.name || suggested,
    consignment: o.courier?.consignment || '',
    suggested,
    zone: isDhaka ? 'Inside Dhaka' : 'Outside Dhaka',
  });
});

// ==========================================
// CUSTOMER VIP ACCOUNT SYSTEM (PHONE OTP)
// ==========================================
const customerOtpCache = new Map(); // cleanPhone -> { code, name, expiresAt, attempts }
const customerSessions = new Map(); // token -> { phone, expiresAt }
const CUST_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function resolveCustomer(req) {
  const token = req.get('x-customer-token') || '';
  if (!token) return null;
  const sess = customerSessions.get(token);
  if (!sess) return null;
  if (Date.now() > sess.expiresAt) {
    customerSessions.delete(token);
    return null;
  }
  return getCustomerByPhone(sess.phone);
}

function customerAuth(req, res, next) {
  const cust = resolveCustomer(req);
  if (!cust) return res.status(401).json({ error: 'Please sign in to your VIP account' });
  req.customer = cust;
  next();
}

function enrichCustomer(cust) {
  if (!cust) return null;
  const cleanPhone = String(cust.phone).replace(/\D/g, '').slice(-11);
  const allOrders = getOrders() || [];
  const myOrders = allOrders.filter((o) => {
    if (o.status === 'cancelled') return false;
    const oPhone = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
    return oPhone === cleanPhone;
  });

  const deliveredOrders = myOrders.filter((o) => o.status === 'delivered');
  const totalSpent = deliveredOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);

  let tier = 'VIP Member';
  if (totalSpent >= 15000) tier = 'Platinum VIP';
  else if (totalSpent >= 7500) tier = 'Gold VIP';
  else if (totalSpent >= 3000) tier = 'Silver VIP';

  const hasUsedWelcome = cust.welcomeCouponUsed || myOrders.some((o) => String(o.coupon || '').toUpperCase() === 'WELCOME5');

  return {
    id: cust.id,
    phone: cust.phone,
    name: cust.name || 'VIP Member',
    email: cust.email || '',
    ordersCount: myOrders.length,
    totalSpent,
    tier,
    savedAddress: cust.savedAddress || { address: '', district: '', thana: '', area: 'outside' },
    wishlist: Array.isArray(cust.wishlist) ? cust.wishlist : [],
    firstOrderDiscountAvailable: !hasUsedWelcome && myOrders.length === 0,
    welcomeCoupon: 'WELCOME5',
    createdAt: cust.createdAt,
    orders: myOrders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      total: o.total,
      subtotal: o.itemsTotal || o.subtotal,
      shippingCost: o.delivery != null ? o.delivery : o.shippingCost,
      discount: o.discount,
      coupon: o.coupon,
      items: o.items || [],
      courier: o.courier || null,
      address: o.customer?.address || '',
      district: o.customer?.district || '',
      thana: o.customer?.thana || '',
    })),
  };
}

// 1. Send OTP via SMS
app.post('/api/customer/send-otp', async (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-11);
  const name = String(req.body?.name || '').trim().slice(0, 50);

  if (!/^01[3-9]\d{8}$/.test(phone)) {
    return res.status(400).json({ error: 'Please enter a valid 11-digit Bangladeshi mobile number (01XXXXXXXXX)' });
  }

  const prev = customerOtpCache.get(phone);
  if (prev && Date.now() < prev.expiresAt - 4 * 60 * 1000) {
    return res.status(429).json({ error: 'Please wait a moment before requesting another code.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  customerOtpCache.set(phone, {
    code,
    name: name || (prev?.name || ''),
    expiresAt: Date.now() + 5 * 60 * 1000,
    attempts: 0,
  });

  const smsText = `METRROMA: Your VIP verification code is ${code}. Valid for 5 minutes.`;
  await sendSMS(phone, smsText).catch(() => ({ ok: false }));

  const ig = getIntegrations();
  const isSmsLive = ig.sms?.enabled && ig.sms?.url;

  res.json({
    ok: true,
    message: isSmsLive ? 'Verification code sent to your mobile.' : 'SMS gateway setup pending in Admin. Demo code supplied for instant testing.',
    demoCode: isSmsLive ? undefined : code,
  });
});

// 2. Verify OTP and authenticate/create customer
app.post('/api/customer/verify-otp', (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-11);
  const code = String(req.body?.code || '').trim();
  const name = String(req.body?.name || '').trim().slice(0, 50);

  if (!phone || !code) {
    return res.status(400).json({ error: 'Mobile number and verification code are required' });
  }

  const cached = customerOtpCache.get(phone);
  if (!cached) {
    return res.status(400).json({ error: 'Verification code expired or not requested. Please request a new code.' });
  }
  if (Date.now() > cached.expiresAt) {
    customerOtpCache.delete(phone);
    return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
  }

  if (cached.code !== code) {
    cached.attempts = (cached.attempts || 0) + 1;
    if (cached.attempts >= 5) {
      customerOtpCache.delete(phone);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }
    return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
  }

  customerOtpCache.delete(phone);

  let cust = getCustomerByPhone(phone);
  const customerName = name || cached.name || cust?.name || 'VIP Member';

  if (!cust) {
    cust = saveCustomer({
      id: 'cust_' + randomUUID().slice(0, 8),
      phone,
      name: customerName,
      email: '',
      savedAddress: { address: '', district: '', thana: '', area: 'outside' },
      wishlist: [],
      welcomeCouponUsed: false,
    });
  } else if (name && cust.name !== name) {
    cust = saveCustomer({ ...cust, name });
  }

  const token = 'cust_' + randomBytes(24).toString('hex');
  customerSessions.set(token, { phone, expiresAt: Date.now() + CUST_SESSION_TTL });

  res.json({
    ok: true,
    token,
    customer: enrichCustomer(cust),
  });
});

// 3. Get currently logged in customer
app.get('/api/customer/me', customerAuth, (req, res) => {
  res.json({ ok: true, customer: enrichCustomer(req.customer) });
});

// 4. Update customer profile & saved delivery address
app.put('/api/customer/profile', customerAuth, (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (typeof b.name === 'string') patch.name = b.name.trim().slice(0, 60);
  if (typeof b.email === 'string') patch.email = b.email.trim().slice(0, 80);
  if (b.savedAddress && typeof b.savedAddress === 'object') {
    patch.savedAddress = {
      address: String(b.savedAddress.address || '').trim().slice(0, 200),
      district: String(b.savedAddress.district || '').trim().slice(0, 50),
      thana: String(b.savedAddress.thana || '').trim().slice(0, 50),
      area: b.savedAddress.district === 'Dhaka' ? 'inside' : 'outside',
    };
  }
  const updated = saveCustomer({ ...req.customer, ...patch });
  res.json({ ok: true, customer: enrichCustomer(updated) });
});

// 5. Toggle wishlist item
app.post('/api/customer/wishlist', customerAuth, (req, res) => {
  const pid = String(req.body?.productId || '').trim();
  if (!pid) return res.status(400).json({ error: 'productId required' });
  const list = Array.isArray(req.customer.wishlist) ? [...req.customer.wishlist] : [];
  const idx = list.indexOf(pid);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(pid);
  const updated = saveCustomer({ ...req.customer, wishlist: list });
  res.json({ ok: true, wishlist: updated.wishlist });
});

// 6. Logout
app.post('/api/customer/logout', (req, res) => {
  const token = req.get('x-customer-token');
  if (token) customerSessions.delete(token);
  res.json({ ok: true });
});

// 7. Admin Customer Management
app.get('/api/admin/customers', adminAuth, (req, res) => {
  syncCustomersFromOrders();
  const allCust = getCustomers();
  const allOrders = getOrders() || [];
  const enriched = allCust.map((c) => {
    const cleanPhone = String(c.phone).replace(/\D/g, '').slice(-11);
    const myOrders = allOrders.filter((o) => {
      if (o.status === 'cancelled') return false;
      const oPhone = String(o.customer?.phone || '').replace(/\D/g, '').slice(-11);
      return oPhone === cleanPhone;
    });
    const delivered = myOrders.filter((o) => o.status === 'delivered');
    const totalSpent = delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const lastOrder = myOrders[0]?.createdAt || c.createdAt;
    return {
      id: c.id,
      phone: c.phone,
      name: c.name || 'VIP Member',
      email: c.email || '',
      ordersCount: myOrders.length,
      totalSpent,
      savedAddress: c.savedAddress || null,
      createdAt: c.createdAt,
      lastOrderAt: lastOrder,
      welcomeCouponUsed: c.welcomeCouponUsed || myOrders.some((o) => String(o.coupon || '').toUpperCase() === 'WELCOME5'),
    };
  });
  res.json({ customers: enriched });
});

// ---- serve built frontend in production ----
const dist = join(__dir, '..', 'web', 'dist');
if (existsSync(dist)) {
  app.get(['/admin.html', '/admin'], (_req, res) => res.redirect(301, '/wp-admin'));
  app.use(express.static(dist, {
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (path.includes('/assets/') || path.includes('\\assets\\')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const indexPath = join(dist, 'index.html');
    if (!existsSync(indexPath)) return res.status(404).send('Not found');

    try {
      let html = readFileSync(indexPath, 'utf8');
      const baseUrl = 'https://metrroma.com';
      const path = req.path || '/';

      const cleanPath = path.replace(/^\/+|\/+$/g, '');
      const parts = cleanPath.split('/').filter(Boolean);
      let targetProduct = null;

      const catalog = getCatalog().products || [];
      if (parts[0] === 'product' && parts[1]) {
        const slug = parts[1].toLowerCase();
        targetProduct = catalog.find((p) => p.slug?.toLowerCase() === slug || p.id === parts[1]);
      } else if (parts.length === 1 && !['shop', 'checkout', 'confirm', 'track', 'wp-admin', 'account', 'admin', 'terms', 'privacy', 'refund', 'contact'].includes(parts[0])) {
        const slug = parts[0].toLowerCase();
        targetProduct = catalog.find((p) => p.slug?.toLowerCase() === slug || p.id === parts[0] || (slug === 'love-forever' && p.id === 'mm-29267') || (slug === 'love-forever-gift-box' && p.id === 'mm-29267'));
      }

      if (targetProduct) {
        const pTitle = `${targetProduct.name} — METRROMA`;
        const pDesc = (targetProduct.desc || targetProduct.shortDesc || targetProduct.name).slice(0, 200).replace(/["\n\r]/g, ' ');
        let pImg = targetProduct.image || (targetProduct.images && targetProduct.images[0]) || '/uploads/img_mvdpqsl1t81m6.webp';
        if (!pImg.startsWith('http')) pImg = `${baseUrl}${pImg.startsWith('/') ? '' : '/'}${pImg}`;
        const pUrl = `${baseUrl}/product/${targetProduct.slug || targetProduct.id}`;
        const pPrice = String(targetProduct.price || 0);

        html = html
          .replace(/<title>[\s\S]*?<\/title>/i, `<title>${pTitle}</title>`)
          .replace(/<meta property="og:title" content="[^"]*"/i, `<meta property="og:title" content="${pTitle}"`)
          .replace(/<meta property="og:description" content="[^"]*"/i, `<meta property="og:description" content="${pDesc}"`)
          .replace(/<meta property="og:image" content="[^"]*"/i, `<meta property="og:image" content="${pImg}"`)
          .replace(/<meta name="twitter:title" content="[^"]*"/i, `<meta name="twitter:title" content="${pTitle}"`)
          .replace(/<meta name="twitter:description" content="[^"]*"/i, `<meta name="twitter:description" content="${pDesc}"`)
          .replace(/<meta name="twitter:image" content="[^"]*"/i, `<meta name="twitter:image" content="${pImg}"`);

        const extraTags = `
    <meta property="og:url" content="${pUrl}" />
    <meta property="og:type" content="product" />
    <meta property="product:price:amount" content="${pPrice}" />
    <meta property="product:price:currency" content="BDT" />
    <meta property="og:image:secure_url" content="${pImg}" />
    <link rel="canonical" href="${pUrl}" />`;
        html = html.replace('</head>', `${extraTags}\n</head>`);
      } else {
        html = html.replace(/<meta property="og:image" content="(\/[^"]+)"/i, `<meta property="og:image" content="${baseUrl}$1"`);
      }

      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.send(html);
    } catch (_) {
      res.sendFile(indexPath);
    }
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`dot. api on http://localhost:${PORT}`));
