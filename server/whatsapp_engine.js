import { getIntegrations, saveIntegrations, getSettings } from './store.js';

// Default templates for Bangladeshi e-commerce
export const DEFAULT_WA_SETTINGS = {
  enabled: true,
  connected: false,
  phone: '',
  device: 'WhatsApp Web',
  pairingCode: '',
  triggers: {
    incomplete: {
      enabled: true,
      delayMinutes: 2,
      template: 'আসসালামু আলাইকুম {name}! {store} থেকে লক্ষ্য করলাম আপনি {items} অর্ডার করার সময় চেকআউট সম্পন্ন করেননি। আপনি কি ক্যাশ অন ডেলিভারিতে অর্ডারটি কনফার্ম করতে চান? মোট মূল্য: ৳{total}।',
    },
    approved: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{order_id} সফলভাবে কনফার্ম করা হয়েছে। আমরা দ্রুত পার্সেলটি প্রস্তুত করছি। মোট বিল: ৳{total}। ধন্যবাদ, {store}!',
    },
    shipped: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{order_id} কুরিয়ারে ({courier}) বুকিং হয়েছে। ট্র্যাকিং কোড: {consignment}। লাইভ ট্র্যাকিং: {tracking_url}',
    },
    cancelled: {
      enabled: true,
      template: 'প্রিয় {name}, আপনার অর্ডার #{order_id} বাতিল করা হয়েছে। প্রয়োজনে আমাদের সাথে যোগাযোগ করুন। ধন্যবাদ, {store}!',
    },
  },
  logs: [],
};

export function getWhatsAppSettings() {
  const ig = getIntegrations();
  if (!ig.whatsapp) {
    ig.whatsapp = { ...DEFAULT_WA_SETTINGS };
    try { saveIntegrations(ig); } catch (_) {}
  }
  return {
    ...DEFAULT_WA_SETTINGS,
    ...ig.whatsapp,
    triggers: {
      ...DEFAULT_WA_SETTINGS.triggers,
      ...(ig.whatsapp.triggers || {}),
    },
  };
}

export function saveWhatsAppSettings(patch) {
  const ig = getIntegrations();
  const current = getWhatsAppSettings();
  const next = {
    ...current,
    ...patch,
    triggers: {
      ...current.triggers,
      ...(patch.triggers || {}),
    },
  };
  ig.whatsapp = next;
  saveIntegrations(ig);
  return next;
}

export function formatWhatsAppMessage(template, order) {
  const st = getSettings();
  const store = st.storeName || 'Store';
  const name = order?.customer?.name || 'গ্রাহক';
  const orderId = order?.id || '';
  const total = order?.total || 0;
  const courier = order?.courier?.name || 'Courier';
  const consignment = order?.courier?.consignment || '';
  const trackingUrl = order?.courier?.url || `https://secrate.shop/track?id=${orderId}`;
  const address = order?.customer?.address || '';
  const items = (order?.items || []).map((i) => i.name || i.title || 'পণ্য').join(', ') || 'পণ্য';

  return String(template || '')
    .replace(/{name}/g, name)
    .replace(/{store}/g, store)
    .replace(/{order_id}/g, orderId)
    .replace(/{total}/g, String(total))
    .replace(/{courier}/g, courier)
    .replace(/{consignment}/g, consignment)
    .replace(/{tracking_url}/g, trackingUrl)
    .replace(/{address}/g, address)
    .replace(/{items}/g, items);
}

let baileysSender = null;
export function registerBaileysSender(fn) {
  baileysSender = fn;
}

export async function sendWhatsAppNotification(order, eventType) {
  const wa = getWhatsAppSettings();
  if (!wa.enabled) return { sent: false, reason: 'WhatsApp automation disabled' };

  const trigger = wa.triggers?.[eventType];
  if (!trigger || !trigger.enabled) {
    return { sent: false, reason: `Trigger ${eventType} is disabled` };
  }

  const phone = String(order?.customer?.phone || '').replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return { sent: false, reason: 'Invalid phone number' };
  }

  const formattedMsg = formatWhatsAppMessage(trigger.template, order);
  let dispatchResult = { sent: true };

  if (baileysSender) {
    try {
      dispatchResult = await baileysSender(phone, formattedMsg, order?.id, eventType);
    } catch (e) {
      console.warn('[WhatsApp Auto-Send Error]:', e?.message || e);
      dispatchResult = { sent: false, error: e?.message };
    }
  }

  const logEntry = {
    id: 'wa_' + Date.now().toString(36),
    at: new Date().toISOString(),
    phone,
    orderId: order?.id,
    eventType,
    message: formattedMsg,
    status: dispatchResult?.sent ? 'delivered' : 'queued',
    details: dispatchResult?.reason || dispatchResult?.error || null,
  };

  // Keep last 100 logs
  const logs = [logEntry, ...(wa.logs || [])].slice(0, 100);
  saveWhatsAppSettings({ logs });

  console.log(`[WhatsApp Auto-Send] (${eventType}) -> ${phone} [${logEntry.status}]: ${formattedMsg.slice(0, 80)}...`);
  return { sent: dispatchResult?.sent !== false, log: logEntry };
}

