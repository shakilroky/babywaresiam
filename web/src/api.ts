export type Category = { slug: string; name: string; adult: boolean; blurb: string; image: string };

export type ProductColor = {
  name: string;
  hex?: string;
  image?: string;
};

export type ProductVariation = {
  id: string;
  title: string;
  size?: string;
  color?: string;
  colorHex?: string;
  price: number;
  compareAt?: number;
  stock?: number | null;
  sku?: string;
  image?: string;
};

export type Product = {
  id: string; slug: string; name: string; price: number; category: string;
  adult: boolean; tag: string; desc: string; size: string; image: string;
  images?: string[]; stock?: number | null; compareAt?: number; soldOut?: boolean;
  sku?: string; shortDesc?: string; longDesc?: string; weight?: string;
  customDeliveryInside?: number | null; customDeliveryOutside?: number | null;
  seoTitle?: string; seoDesc?: string;
  colors?: (string | ProductColor)[];
  sizes?: string[];
  variations?: ProductVariation[];
  isDigital?: boolean;
  digitalFileUrl?: string;
  digitalInstructions?: string;
};

export type FraudDetectorSettings = {
  enabled: boolean;
  cooldownHours: number;
  maxOrdersPerDay: number;
  minSecondsBetweenOrders: number;
  blockByPhone: boolean;
  sameProductNotice: string;
  maxOrdersNotice: string;
  rapidOrderNotice: string;
};

export type SliderItem = {
  id: string;
  image: string;
  mobileImage?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  buttonLink?: string;
  badge?: string;
  active?: boolean;
};

export type Settings = {
  storeName?: string;
  logo?: string;
  favicon?: string;
  sliders?: SliderItem[];
  announce: string;
  deliveryInside: number;
  deliveryOutside: number;
  freeShipThreshold: number;
  whatsapp: string;
  phone: string;
  gtmId?: string;
  fbPixelId?: string;
  fraudDetector?: FraudDetectorSettings;
};
export const getSettings = (): Promise<Settings> => fetch('/api/settings').then(j);

const j = (r: Response) => {
  if (!r.ok) throw new Error('request failed');
  return r.json();
};

export const getCategories = (): Promise<Category[]> => fetch('/api/categories').then(j);
export const getProducts = (category?: string): Promise<Product[]> =>
  fetch('/api/products' + (category ? `?category=${encodeURIComponent(category)}` : '')).then(j);
export const getProduct = (slug: string): Promise<Product> => fetch('/api/products/' + slug).then(j);

export type OrderPayload = {
  items: {
    id: string;
    qty: number;
    name?: string;
    price?: number;
    image?: string;
    variantId?: string;
    variantTitle?: string;
    size?: string;
    color?: string;
  }[];
  customer: { name: string; phone: string; address: string; area?: string; note?: string; coupon?: string; source?: string; landing?: string; district?: string; thana?: string; freeDelivery?: boolean; shippingCost?: number };
  shipping?: { cost: number; method: string };
};


export function getSource(): string {
  try {
    const saved = localStorage.getItem('dot_src');
    if (saved) return saved;
    const p = new URLSearchParams(location.search);
    let src = p.get('utm_source') || p.get('ref') || p.get('source') || '';
    if (!src && p.get('fbclid')) src = 'facebook';
    if (!src && p.get('ttclid')) src = 'tiktok';
    if (!src && p.get('gclid')) src = 'google';
    if (!src && document.referrer) {
      try {
        const h = new URL(document.referrer).hostname.replace(/^www\./, '');
        if (h && !location.hostname.includes(h)) {
          if (h.includes('facebook') || h.includes('fb.me') || h.includes('instagram')) src = 'facebook';
          else if (h.includes('tiktok')) src = 'tiktok';
          else src = h;
        }
      } catch {}
    }
    src = (src || 'direct').toLowerCase().slice(0, 60);
    localStorage.setItem('dot_src', src);
    return src;
  } catch { return 'direct'; }
}

export type OrderAttribution = { channel: string; source: string; medium: string; campaign: string; referrer: string };
export function getOrderAttribution(): OrderAttribution {
  const key = 'dot_order_attribution_v1';
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved) as OrderAttribution;
    const params = new URLSearchParams(location.search);
    let referrer = '';
    try { referrer = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch {}
    const source = (params.get('utm_source') || params.get('ref') || params.get('source') || (params.get('fbclid') ? 'facebook' : '') || (params.get('ttclid') ? 'tiktok' : '') || (params.get('gclid') ? 'google' : '') || referrer).trim().toLowerCase().slice(0, 100);
    const medium = (params.get('utm_medium') || '').trim().toLowerCase().slice(0, 100);
    const campaign = (params.get('utm_campaign') || '').trim().slice(0, 120);
    let channel = 'Direct';
    if (/facebook|fb\.com|fb\.me/.test(source)) channel = 'Facebook';
    else if (/instagram/.test(source)) channel = 'Instagram';
    else if (/tiktok/.test(source)) channel = 'TikTok';
    else if (/youtube/.test(source)) channel = 'YouTube';
    else if (/google/.test(source)) channel = 'Google';
    else if (/whatsapp/.test(source)) channel = 'WhatsApp';
    else if (source) channel = source;
    if (medium && /paid|cpc|ppc|ads|paid_social/.test(medium)) channel += ' Ads';
    const result = { channel: channel.slice(0, 100), source, medium, campaign, referrer: referrer.slice(0, 100) };
    localStorage.setItem(key, JSON.stringify(result));
    return result;
  } catch { return { channel: 'Direct', source: '', medium: '', campaign: '', referrer: '' }; }
}
getOrderAttribution();

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('dot_did');
    if (!id) {
      const match = document.cookie.match(/(?:^|; )dot_did=([^;]*)/);
      if (match && match[1]) id = decodeURIComponent(match[1]);
    }
    if (!id || id.length < 8) {
      id = 'did_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    }
    localStorage.setItem('dot_did', id);
    document.cookie = `dot_did=${encodeURIComponent(id)};path=/;max-age=31536000;SameSite=Lax`;
    return id;
  } catch {
    return 'unknown_device';
  }
}

export async function placeOrder(p: OrderPayload) {
  const did = getDeviceId();
  const r = await fetch('/api/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': did,
    },
    body: JSON.stringify({ ...p, deviceId: did, attribution: getOrderAttribution() }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'could not place order');
  return data as { id: string; total: number; status: string };
}

export const taka = (n: number) => 'Tk ' + (Number(n) || 0).toLocaleString('en-US');

export async function validateCoupon(code: string, subtotal: number, phone?: string) {
  const r = await fetch('/api/coupon/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, subtotal, phone })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'invalid code');
  return d as { code: string; discount: number };
}

export type Review = { id: string; name: string; rating: number; text: string; at: string };
export const fetchReviews = (pid: string): Promise<{ count: number; avg: number; reviews: Review[] }> => fetch('/api/reviews/' + pid).then(j);
export async function postReview(b: { productId: string; name: string; rating: number; text: string }) {
  const r = await fetch('/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'could not submit');
  return d;
}

export function isSkincareSite(): boolean {
  if (typeof window === 'undefined') return true;
  const h = (window.location.hostname || '').toLowerCase();
  if (h.includes('metrroma') || h.includes('metromaa')) return false;
  return true;
}

export type MasterColor = {
  id: string;
  name: string;
  hex: string;
};

export async function fetchMasterColors(): Promise<MasterColor[]> {
  try {
    const res = await fetch('/api/colors');
    const data = await res.json();
    return data.colors || [];
  } catch {
    return [];
  }
}

export async function createMasterColor(name: string, hex: string): Promise<{ success: boolean; color?: MasterColor; colors: MasterColor[] }> {
  try {
    const res = await fetch('/api/colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, hex }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, colors: [] };
  }
}

export async function deleteMasterColor(id: string): Promise<{ success: boolean; colors: MasterColor[] }> {
  try {
    const res = await fetch('/api/colors/' + encodeURIComponent(id), { method: 'DELETE' });
    return await res.json();
  } catch {
    return { success: false, colors: [] };
  }
}

// ---- CUSTOMER VIP ACCOUNT SYSTEM ----
export type CustomerOrder = {
  id: string;
  createdAt: string;
  status: string;
  total: number;
  subtotal: number;
  shippingCost: number;
  discount: number;
  coupon?: string;
  items: any[];
  courier?: any;
  address?: string;
  district?: string;
  thana?: string;
};

export type Customer = {
  id: string;
  phone: string;
  name: string;
  email?: string;
  ordersCount: number;
  totalSpent: number;
  tier: string;
  savedAddress?: {
    address: string;
    district: string;
    thana: string;
    area: 'inside' | 'outside';
  };
  wishlist: string[];
  firstOrderDiscountAvailable: boolean;
  welcomeCoupon: string;
  createdAt: string;
  orders?: CustomerOrder[];
};

export function getCustomerToken(): string {
  try { return localStorage.getItem('metrroma_customer_token') || ''; }
  catch { return ''; }
}

export function setCustomerToken(token: string) {
  try { localStorage.setItem('metrroma_customer_token', token); }
  catch {}
}

export function clearCustomerToken() {
  try { localStorage.removeItem('metrroma_customer_token'); }
  catch {}
}

export async function sendCustomerOtp(phone: string, name?: string): Promise<{ ok: boolean; message: string; demoCode?: string }> {
  const r = await fetch('/api/customer/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, name })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not send verification code');
  return d;
}

export async function verifyCustomerOtp(phone: string, code: string, name?: string): Promise<{ ok: boolean; token: string; customer: Customer }> {
  const r = await fetch('/api/customer/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code, name })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Invalid verification code');
  if (d.token) setCustomerToken(d.token);
  return d;
}

export async function getCustomerMe(): Promise<Customer | null> {
  const token = getCustomerToken();
  if (!token) return null;
  const r = await fetch('/api/customer/me', {
    headers: { 'x-customer-token': token }
  });
  if (!r.ok) {
    if (r.status === 401) clearCustomerToken();
    return null;
  }
  const d = await r.json();
  return d.customer;
}

export async function updateCustomerProfile(data: { name?: string; email?: string; savedAddress?: any }): Promise<Customer> {
  const token = getCustomerToken();
  const r = await fetch('/api/customer/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-token': token
    },
    body: JSON.stringify(data)
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not update profile');
  return d.customer;
}

export async function toggleCustomerWishlist(productId: string): Promise<string[]> {
  const token = getCustomerToken();
  if (!token) throw new Error('Sign in required');
  const r = await fetch('/api/customer/wishlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-customer-token': token
    },
    body: JSON.stringify({ productId })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Could not update wishlist');
  return d.wishlist;
}

export async function logoutCustomer(): Promise<void> {
  const token = getCustomerToken();
  clearCustomerToken();
  if (token) {
    fetch('/api/customer/logout', {
      method: 'POST',
      headers: { 'x-customer-token': token }
    }).catch(() => {});
  }
}

export async function getAdminCustomers(): Promise<any[]> {
  const token = localStorage.getItem('dot_admin') || '';
  if (!token) throw new Error('Admin sign-in is required');
  const r = await fetch('/api/admin/customers', {
    headers: { 'x-admin-token': token }
  });
  if (!r.ok) throw new Error('Could not load admin customers');
  const d = await r.json();
  return d.customers || [];
}



