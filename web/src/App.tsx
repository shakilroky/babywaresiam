import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getOrderAttribution } from './api';
import { BD_GEO, BD_DISTRICTS_BN } from './bd-geo';
import { SearchableSelect } from './SearchableSelect';
import {
  WhatsAppIcon,
  TruckIcon,
  LeafIcon,
  ShieldCheckIcon,
  ExchangeIcon,
  CartIcon,
  PhoneIcon,
  SearchIcon,
  StarIcon,
  ChevronDownIcon,
  CheckCircleIcon,
  RulerIcon,
  CloseIcon,
  TrashIcon,
} from './icons';

// Product Interface
interface Product {
  id: string;
  slug: string;
  name: string;
  title?: string;
  subtitle?: string;
  category: string;
  price: number;
  originalPrice: number;
  compareAt?: number;
  stock: number;
  featured?: boolean;
  badge?: string;
  tag?: string;
  fabric?: string;
  care?: string;
  rating?: number;
  ratingCount?: number;
  image?: string;
  images: string[];
  sizes?: string[];
  variations?: any[];
  colors?: { name: string; hex: string }[];
  desc?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  blurb?: string;
  image?: string;
}

interface Review {
  id: string;
  name: string;
  location?: string;
  rating: number;
  text: string;
  productId?: string;
  productName?: string;
  image?: string;
  verified?: boolean;
  at?: string;
}

interface CartItem {
  product: Product;
  size: string;
  color: string;
  qty: number;
}

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsAvg, setReviewsAvg] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Store Settings
  const [storeSettings, setStoreSettings] = useState<any>({
    storeName: 'Baby Wear',
    hotline: '',
    whatsapp: '',
    announce: '👶 নরম সুতি পোশাক · সারাদেশে ক্যাশ অন ডেলিভারি',
    logo: '/uploads/baby-wear-logo.png',
    sliders: [],
    freeShipThreshold: 2000,
    deliveryInside: 70,
    deliveryOutside: 130,
    homepageSections: [],
    homeContent: {},
    siteContent: { sections: {} },
    appearance: { accent: '#ec4899', desktopColumns: 4, mobileColumns: 2, imageFit: 'cover' },
  });
  const showSection = (key: string) => storeSettings.siteContent?.sections?.[key] !== false;
  const homeCopy = (key: string, fallback: string) => storeSettings.homeContent?.[key] || fallback;
  const configuredHomeSections = useMemo(() => Array.isArray(storeSettings.homepageSections) && storeSettings.homepageSections.length
    ? storeSettings.homepageSections.filter((section: any) => section.active !== false)
    : categories.map((category) => ({ id: category.id, category: category.id, title: category.name, count: 40, active: true })), [storeSettings.homepageSections, categories]);
  const heroSlides = useMemo(
    () => (Array.isArray(storeSettings.sliders) ? storeSettings.sliders : []).filter((slide: any) => slide?.active !== false && (slide?.image || slide?.mobileImage)),
    [storeSettings.sliders],
  );
  useEffect(() => {
    if (heroSlides.length < 2) return;
    const timer = window.setInterval(() => setActiveHeroSlide((index) => (index + 1) % heroSlides.length), 7000);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);
  const announcementText = String(storeSettings.announce || '').replace(/\s*[·•]\s*(?:হটলাইন|Hotline)\s*:.*/i, '').trim();
  const announcementIncludesHotline = /হটলাইন|hotline/i.test(String(storeSettings.announce || ''));

  // Modals & Drawers
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [viewingProductImg, setViewingProductImg] = useState<string>('');
  const [viewingProductTab, setViewingProductTab] = useState<'desc' | 'specs' | 'size' | 'care' | 'delivery'>('desc');

  const openProductDetail = (p: Product) => {
    setViewingProduct(p);
    setViewingProductImg((p.images && p.images[0]) || p.image || '/uploads/baby-wear-logo.png');
    setViewingProductTab('desc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [quickViewActiveImg, setQuickViewActiveImg] = useState<string>('');
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Review Form
  const [revName, setRevName] = useState('');
  const [revLocation, setRevLocation] = useState('');
  const [revRating, setRevRating] = useState(5);
  const [revProductId, setRevProductId] = useState('');
  const [revText, setRevText] = useState('');
  const [revImage, setRevImage] = useState<string>('');
  const [revSubmitting, setRevSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cart & Checkout State
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('bw_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [directCheckoutItem, setDirectCheckoutItem] = useState<CartItem | null>(null);

  // Form Fields with District & Thana Dropdowns
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custDistrict, setCustDistrict] = useState('Dhaka');
  const [custThana, setCustThana] = useState('Dhanmondi');
  const [custStreet, setCustStreet] = useState('');
  const [deliveryArea, setDeliveryArea] = useState<'inside' | 'outside'>('inside');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponErr, setCouponErr] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any | null>(null);

  // Tracking
  const [trackQuery, setTrackQuery] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackResult, setTrackResult] = useState<any | null>(null);

  // Toast
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // Sync Cart to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem('bw_cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Load Catalog, Settings, & Reviews
  const loadReviews = async () => {
    try {
      const res = await fetch('/api/reviews').then((r) => r.json());
      if (res && res.reviews) {
        setReviews(res.reviews);
        if (res.avg) setReviewsAvg(res.avg);
      }
    } catch (e) {
      console.warn('Failed to load reviews', e);
    }
  };

  useEffect(() => {
    const fetchStore = async () => {
      try {
        const readJson = (path: string, fallback: any) => fetch(path)
          .then((r) => { if (!r.ok) throw new Error(`Request failed: ${path}`); return r.json(); })
          .catch(() => fallback);
        const [catList, prodList, setRes] = await Promise.all([
          readJson('/api/categories', []),
          readJson('/api/products', []),
          readJson('/api/settings', {}),
        ]);

        if (Array.isArray(catList) && catList.length > 0) {
          setCategories(catList);
        }
        if (Array.isArray(prodList) && prodList.length > 0) {
          setProducts(prodList);

          // Initialize default sizes
          const initSizes: Record<string, string> = {};
          prodList.forEach((p: Product) => {
            const szs = getProductSizes(p);
            if (szs.length > 0) {
              initSizes[p.id] = szs[0];
            }
          });
          setSelectedSizes(initSizes);
        }

        if (setRes && typeof setRes === 'object' && !Array.isArray(setRes)) {
          setStoreSettings({
            ...setRes,
            storeName: setRes.storeName || 'Baby Wear',
            hotline: setRes.phone ?? '',
            whatsapp: setRes.whatsapp ?? '',
            announce: setRes.announce || '👶 নরম সুতি পোশাক · সারাদেশে ক্যাশ অন ডেলিভারি',
            logo: setRes.logo || '/uploads/baby-wear-logo.png',
            sliders: Array.isArray(setRes.sliders) ? setRes.sliders : [],
            homepageSections: Array.isArray(setRes.homepageSections) ? setRes.homepageSections : [],
            homeContent: setRes.homeContent || {},
            siteContent: setRes.siteContent || { sections: {} },
            appearance: setRes.appearance || { accent: '#ec4899', desktopColumns: 4, mobileColumns: 2, imageFit: 'cover' },
            freeShipThreshold: setRes.freeShipThreshold ?? 2000,
            deliveryInside: setRes.deliveryInside ?? 70,
            deliveryOutside: setRes.deliveryOutside ?? 130,
          });
        }
      } catch (e) {
        console.error('Failed to load store data', e);
      } finally {
        setLoading(false);
      }
    };

    fetchStore();
    loadReviews();
  }, []);

  // Helper to extract sizes from product or its variants
  const getProductSizes = (p: Product): string[] => {
    if (Array.isArray(p.sizes) && p.sizes.length > 0) return p.sizes;
    if (Array.isArray(p.variations) && p.variations.length > 0) {
      const fromVars = p.variations.map((v: any) => v.size).filter(Boolean);
      if (fromVars.length > 0) return Array.from(new Set(fromVars));
    }
    return ['0-3M', '3-6M', '6-12M'];
  };

  // Helper to match product to category
  const isProductInCategory = (p: Product, cat: Category): boolean => {
    if (!p || !cat) return false;
    const pCat = String(p.category || '').toLowerCase().trim();
    const cId = String(cat.id || '').toLowerCase().trim();
    const cSlug = String(cat.slug || '').toLowerCase().trim();
    return pCat === cId || pCat === cSlug || pCat.includes(cSlug) || cSlug.includes(pCat);
  };

  // Filtered Products for Search
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    return products.filter((p) => {
      const matchQuery =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.subtitle && p.subtitle.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (p.sizes && p.sizes.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchQuery;
    });
  }, [products, searchQuery]);

  // Icon Map for Categories
  const getCatIcon = (slugOrId: string) => {
    const lower = slugOrId.toLowerCase();
    if (lower.includes('newborn')) return '🍼';
    if (lower.includes('romper')) return '🧸';
    if (lower.includes('dress') || lower.includes('party')) return '👑';
    if (lower.includes('boy')) return '👦';
    if (lower.includes('girl')) return '👧';
    if (lower.includes('access') || lower.includes('shoe')) return '👟';
    return '👶';
  };

  // Cart Utilities
  const addToCart = (product: Product, customSize?: string, customColor?: string) => {
    const szs = getProductSizes(product);
    const sizeToUse = customSize || selectedSizes[product.id] || szs[0] || 'Standard';
    const colorToUse = customColor || (product.colors && product.colors[0]?.name) || 'Standard';

    setCart((prev) => {
      const idx = prev.findIndex(
        (i) => i.product.id === product.id && i.size === sizeToUse && i.color === colorToUse
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx].qty += 1;
        return next;
      }
      return [...prev, { product, size: sizeToUse, color: colorToUse, qty: 1 }];
    });
    showToast(`🛍️ "${product.name}" কার্টে যোগ করা হয়েছে!`);
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      next[idx].qty += delta;
      if (next[idx].qty <= 0) {
        next.splice(idx, 1);
      }
      return next;
    });
  };

  const cartTotalQty = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);
  const cartSubtotal = useMemo(() => cart.reduce((sum, i) => sum + i.product.price * i.qty, 0), [cart]);

  // 1-Click Direct Buy
  const openDirectBuy = (product: Product, customSize?: string, customColor?: string) => {
    const szs = getProductSizes(product);
    const sizeToUse = customSize || selectedSizes[product.id] || szs[0] || 'Standard';
    const colorToUse = customColor || (product.colors && product.colors[0]?.name) || 'Standard';

    const item: CartItem = {
      product,
      size: sizeToUse,
      color: colorToUse,
      qty: 1,
    };
    setDirectCheckoutItem(item);
    setIsCheckoutOpen(true);
  };

  // Checkout Calculations
  const checkoutItems = directCheckoutItem ? [directCheckoutItem] : cart;
  const checkoutItemsTotal = directCheckoutItem
    ? directCheckoutItem.product.price * directCheckoutItem.qty
    : cartSubtotal;

  const isFreeDelivery = checkoutItemsTotal >= (storeSettings.freeShipThreshold ?? 2000);
  const deliveryFee = isFreeDelivery
    ? 0
    : deliveryArea === 'inside'
    ? storeSettings.deliveryInside ?? 70
    : storeSettings.deliveryOutside ?? 130;

  const discountAmount = appliedCoupon ? appliedCoupon.discount : 0;
  const grandTotal = Math.max(0, checkoutItemsTotal + deliveryFee - discountAmount);

  // Apply Coupon
  const handleApplyCoupon = () => {
    setCouponErr('');
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    if (code === 'BABYFIRST') {
      const disc = Math.round(checkoutItemsTotal * 0.1);
      setAppliedCoupon({ code, discount: disc });
      showToast('🎉 BABYFIRST কুপন কার্যকর হয়েছে! ১০% ছাড় পেয়েছেন।');
    } else if (code === 'CUTE100') {
      if (checkoutItemsTotal < 1000) {
        setCouponErr('এই কুপনটির জন্য সর্বনিম্ন ১,০০০ টাকার অর্ডার প্রয়োজন');
        return;
      }
      setAppliedCoupon({ code, discount: 100 });
      showToast('🎉 CUTE100 কুপন কার্যকর হয়েছে! ১০০ টাকা ছাড় পেয়েছেন।');
    } else {
      setCouponErr('অবৈধ কুপন কোড! অনুগ্রহ করে সঠিক কোড দিন');
    }
  };

  // Submit Order
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      alert('অনুগ্রহ করে আপনার নাম লিখুন');
      return;
    }
    const cleanPh = custPhone.replace(/\D/g, '');
    if (cleanPh.length < 11) {
      alert('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নাম্বার দিন (যেমন: 017XXXXXXXX)');
      return;
    }
    if (!custStreet.trim()) {
      alert('অনুগ্রহ করে বাসা নং, রোড নং ও বিস্তারিত ঠিকানা লিখুন');
      return;
    }

    setSubmittingOrder(true);
    const fullAddress = `${custStreet.trim()}, ${custThana}, ${custDistrict}`;
    const orderPayload = {
      customer: {
        name: custName.trim(),
        phone: cleanPh,
        address: fullAddress,
        district: custDistrict,
        thana: custThana,
        area: deliveryArea,
      },
      items: checkoutItems.map((i) => ({
        id: i.product.id,
        name: i.product.name,
        price: i.product.price,
        qty: i.qty,
        size: i.size,
        color: i.color,
        subtotal: i.product.price * i.qty,
        image: (i.product.images && i.product.images[0]) || i.product.image || '/uploads/baby-wear-logo.png',
      })),
      itemsTotal: checkoutItemsTotal,
      delivery: deliveryFee,
      discount: discountAmount,
      coupon: appliedCoupon?.code || '',
      total: grandTotal,
      payment: 'cash_on_delivery',
      source: 'web_storefront',
      attribution: getOrderAttribution(),
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      }).then((r) => r.json());

      if (res.ok || res.id || res.order?.id) {
        const created = res.order || res;
        setOrderSuccess(created);
        if (!directCheckoutItem) setCart([]);
      } else {
        alert('অর্ডার সাবমিট করতে সমস্যা হয়েছে: ' + (res.error || 'Please try again'));
      }
    } catch (err: any) {
      alert('নেটওয়ার্ক সমস্যা: ' + (err.message || 'Error'));
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Track Order
  const handleTrackOrder = async () => {
    if (!trackQuery.trim()) return;
    setTrackLoading(true);
    setTrackResult(null);
    try {
      const query = trackQuery.trim();
      const isPhone = /^[+\d\s()-]{8,}$/.test(query);
      const res = await fetch(`/api/track?${isPhone ? 'phone' : 'id'}=${encodeURIComponent(query)}`).then((r) => r.json());
      if (res && res.id) {
        setTrackResult(res);
      } else if (res && Array.isArray(res) && res.length) {
        setTrackResult(res[0]);
      } else {
        setTrackResult({ notFound: true });
      }
    } catch {
      setTrackResult({ notFound: true });
    } finally {
      setTrackLoading(false);
    }
  };

  // Handle Photo Select for Review
  const handleReviewPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('ছবির সাইজ সর্বোচ্চ ৫ মেগাবাইট হতে পারবে।');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRevImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit Real Review
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revName.trim() || !revText.trim()) {
      alert('অনুগ্রহ করে আপনার নাম এবং রিভিউ বিবরণ লিখুন।');
      return;
    }

    setRevSubmitting(true);
    try {
      const matchedProd = products.find((p) => p.id === revProductId);
      const payload = {
        name: revName.trim(),
        location: revLocation.trim() || 'ঢাকা',
        rating: revRating,
        productId: revProductId || 'general',
        productName: matchedProd ? matchedProd.name : 'Baby Wear Collection',
        text: revText.trim(),
        image: revImage,
      };

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (res.ok || res.review) {
        showToast('🎉 ধন্যবাদ! আপনার রিভিউ জমা হয়েছে। অ্যাডমিন পর্যালোচনার পর তা ওয়েবসাইটে প্রকাশিত হবে।');
        setIsReviewModalOpen(false);
        setRevName('');
        setRevLocation('');
        setRevText('');
        setRevImage('');
        setRevRating(5);
        loadReviews();
      } else {
        alert('রিভিউ যুক্ত করতে সমস্যা হয়েছে: ' + (res.error || 'Please try again'));
      }
    } catch (err: any) {
      alert('ত্রুটি: ' + err.message);
    } finally {
      setRevSubmitting(false);
    }
  };

  const hotline = String(storeSettings.hotline || '').trim();
  const whatsappNumber = String(storeSettings.whatsapp || '').replace(/\D/g, '');
  const whatsappLink = whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    'আসসালামু আলাইকুম, Baby Wear থেকে কিছু পোশাক সম্পর্কে জানতে চাচ্ছি।'
  )}` : '';

  // Dedicated Single Product Page View
  const renderSingleProductView = () => {
    if (!viewingProduct) return null;
    const p = viewingProduct;
    const szs = getProductSizes(p);
    const curSize = selectedSizes[p.id] || szs[0] || 'Standard';
    const original = p.originalPrice || p.compareAt || p.price;
    const discountPct = original > p.price ? Math.round(((original - p.price) / original) * 100) : 0;
    const savings = original > p.price ? original - p.price : 0;
    const mainImg = viewingProductImg || (p.images && p.images[0]) || p.image || '/uploads/baby-wear-logo.png';
    const catObj = categories.find((c) => isProductInCategory(p, c));
    const prodReviews = reviews.filter((r) => r.productId === p.id);

    return (
      <main className="bw-product-page">
        {/* Breadcrumb Navigation */}
        <div className="bw-breadcrumb-wrap">
          <div className="bw-breadcrumb">
            <button className="bw-back-btn" onClick={() => setViewingProduct(null)}>
              ← সব পোশাকে ফিরে যান
            </button>
            <span className="bw-crumb-sep">/</span>
            <span
              onClick={() => {
                setViewingProduct(null);
                setActiveCategory('all');
              }}
              style={{ cursor: 'pointer' }}
            >
              হোম
            </span>
            <span className="bw-crumb-sep">/</span>
            <span
              onClick={() => {
                setViewingProduct(null);
                if (catObj) setActiveCategory(catObj.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              {catObj?.name || p.category}
            </span>
            <span className="bw-crumb-sep">/</span>
            <span className="bw-crumb-active">{p.name}</span>
          </div>
        </div>

        {/* Product Details Hero */}
        <div className="bw-product-detail-container">
          {/* Gallery */}
          <div className="bw-product-gallery">
            <div className="bw-main-image-wrap">
              <img src={mainImg} alt={p.name} className="bw-main-image" />
              {(p.badge || p.tag) && <span className="bw-p-badge">{p.badge || p.tag}</span>}
              {discountPct > 0 && <span className="bw-p-discount">-{discountPct}% OFF</span>}
            </div>

            {p.images && p.images.length > 1 && (
              <div className="bw-thumbnail-row">
                {p.images.map((img, i) => (
                  <div
                    key={i}
                    className={`bw-thumbnail-card ${mainImg === img ? 'is-active' : ''}`}
                    onClick={() => setViewingProductImg(img)}
                  >
                    <img src={img} alt={`thumb-${i}`} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Information */}
          <div className="bw-product-info">
            {p.fabric && (
              <div className="bw-p-fabric-pill">
                <LeafIcon size={16} color="#059669" />
                <span>{p.fabric}</span>
              </div>
            )}

            <h1 className="bw-p-title">{p.name}</h1>
            {p.subtitle && <p className="bw-p-subtitle">{p.subtitle}</p>}

            {/* Rating Bar */}
            <div className="bw-p-meta-bar">
              <div className="bw-p-stars">
                <StarIcon size={18} color="#F59E0B" />
                <span>{p.rating ?? '—'}</span>
                <span className="bw-p-rev-count">{p.ratingCount ? `(${p.ratingCount}টি প্যারেন্ট রিভিউ)` : '(এখনো রিভিউ নেই)'}</span>
              </div>
              <div className="bw-stock-chip">
                <span className="bw-stock-dot"></span>
                <span>স্টকে আছে (ইন-স্টক)</span>
              </div>
            </div>

            {/* Price Box */}
            <div className="bw-p-price-card">
              <div className="bw-p-price-row">
                <span className="bw-p-curr-price">৳{p.price}</span>
                {original > p.price && <span className="bw-p-orig-price">৳{original}</span>}
                {savings > 0 && <span className="bw-p-savings-badge">আপনার সাশ্রয় ৳{savings}</span>}
              </div>
              <p className="bw-p-cod-note">
                <ShieldCheckIcon size={16} color="#0284C7" />
                <span>ক্যাশ অন ডেলিভারি: পণ্য দেখে নিশ্চিত হয়ে মূল্য পরিশোধের সুযোগ</span>
              </p>
            </div>

            {/* Sizes */}
            {szs.length > 0 && (
              <div className="bw-p-option-group">
                <div className="bw-p-option-head">
                  <span className="bw-p-option-label">সাইজ নির্বাচন করুন:</span>
                  <button
                    type="button"
                    className="bw-size-guide-trigger"
                    onClick={() => setIsSizeGuideOpen(true)}
                  >
                    <RulerIcon size={15} color="#0284C7" />
                    <span>সাইজ গাইড</span>
                  </button>
                </div>
                <div className="bw-p-size-chips">
                  {szs.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className={`bw-p-size-btn ${curSize === s ? 'is-selected' : ''}`}
                      onClick={() => setSelectedSizes((prev) => ({ ...prev, [p.id]: s }))}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CTA Buttons */}
            <div className="bw-p-cta-group">
              <button
                type="button"
                className="bw-btn-buy-now"
                onClick={() => openDirectBuy(p, curSize)}
              >
                ⚡ এখনই ক্যাশ অন ডেলিভারিতে অর্ডার করুন
              </button>

              <button
                type="button"
                className="bw-btn-add-cart"
                onClick={() => addToCart(p, curSize)}
              >
                <CartIcon size={18} color="#0284C7" />
                <span>কার্টে যোগ করুন</span>
              </button>

              {whatsappLink && <a
                href={`https://wa.me/${storeSettings.whatsapp}?text=${encodeURIComponent(
                  `আসসালামু আলাইকুম, আমি Baby Wear এর "${p.name}" সম্পর্কে জানতে চাচ্ছি।`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="bw-btn-whatsapp-inquiry"
              >
                <WhatsAppIcon size={20} variant="official" />
                <span>হোয়াটসঅ্যাপে সরাসরি প্রশ্ন করুন বা অর্ডার দিন</span>
              </a>}
            </div>

            {/* Trust Badges */}
            <div className="bw-trust-grid">
              <div className="bw-trust-item">
                <TruckIcon size={20} color="#0284C7" />
                <div>
                  <div className="bw-t-title">ক্যাশ অন ডেলিভারি</div>
                  <div className="bw-t-desc">পণ্য হাতে পেয়ে চেক করে পেমেন্ট</div>
                </div>
              </div>
              <div className="bw-trust-item">
                <LeafIcon size={20} color="#059669" />
                <div>
                  <div className="bw-t-title">১০০% পিওর সুতি</div>
                  <div className="bw-t-desc">শিশুর সংবেদনশীল ত্বকে আরামদায়ক</div>
                </div>
              </div>
              <div className="bw-trust-item">
                <ExchangeIcon size={20} color="#D97706" />
                <div>
                  <div className="bw-t-title">সহজ এক্সচেঞ্জ সুবিধা</div>
                  <div className="bw-t-desc">সাইজ না মিললে ৭ দিনে পরিবর্তন</div>
                </div>
              </div>
              <div className="bw-trust-item">
                <ShieldCheckIcon size={20} color="#8B5CF6" />
                <div>
                  <div className="bw-t-title">নিরাপদ ও নিকেল-মুক্ত</div>
                  <div className="bw-t-desc">চিকিৎসক অনুমোদিত নিরাপদ ম্যাটেরিয়াল</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full Specifications & Tabs */}
        <div className="bw-p-tabs-section">
          <div className="bw-p-tabs-header">
            <button
              className={`bw-p-tab-btn ${viewingProductTab === 'desc' ? 'is-active' : ''}`}
              onClick={() => setViewingProductTab('desc')}
            >
              📋 বিস্তারিত বিবরণ
            </button>
            <button
              className={`bw-p-tab-btn ${viewingProductTab === 'specs' ? 'is-active' : ''}`}
              onClick={() => setViewingProductTab('specs')}
            >
              🧵 ফেব্রিক ও মেটেরিয়াল
            </button>
            <button
              className={`bw-p-tab-btn ${viewingProductTab === 'size' ? 'is-active' : ''}`}
              onClick={() => setViewingProductTab('size')}
            >
              📏 সাইজ চার্ট ও মাপ
            </button>
            <button
              className={`bw-p-tab-btn ${viewingProductTab === 'care' ? 'is-active' : ''}`}
              onClick={() => setViewingProductTab('care')}
            >
              🧺 ওয়াশ ও যত্ন
            </button>
            <button
              className={`bw-p-tab-btn ${viewingProductTab === 'delivery' ? 'is-active' : ''}`}
              onClick={() => setViewingProductTab('delivery')}
            >
              🚚 ডেলিভারি পলিসি
            </button>
          </div>

          <div className="bw-p-tab-content">
            {viewingProductTab === 'desc' && (
              <div className="bw-tab-pane">
                <h3>পণ্য সম্পর্কিত সম্পূর্ণ তথ্য</h3>
                <p>
                  {p.desc ||
                    'বাচ্চার জন্য অত্যন্ত নরম ও আরামদায়ক ১০০% পিওর সুতি পোশাক। উন্নত মানের সুতা দ্বারা বোনা এবং সম্পূর্ণভাবে নিকেল-মুক্ত প্রেস বাটন যুক্ত।'}
                </p>
                <ul className="bw-bullet-list">
                  <li>অতিরিক্ত নরম ও ব্রিদেবল ১০০% কম্বড কটন ফেব্রিক</li>
                  <li>ডায়াপার পরিবর্তনের সুবিধার জন্য নিচে মসৃণ স্ন্যাপ বাটন</li>
                  <li>শিশুর সংবেদনশীল ত্বকে ঘর্ষণ বা ফুসকুড়ি প্রতিরোধক ফ্ল্যাট সিমস</li>
                  <li>বারবার ধোয়ার পরেও রঙের উজ্জ্বলতা ও মোলায়েম ভাব বজায় থাকে</li>
                </ul>
              </div>
            )}

            {viewingProductTab === 'specs' && (
              <div className="bw-tab-pane">
                <h3>ফেব্রিক ও কোয়ালিটি স্পেসিফিকেশন</h3>
                <table className="bw-specs-table">
                  <tbody>
                    <tr>
                      <td style={{ width: '35%' }}>ফেব্রিক উপাদান:</td>
                      <td><b>{p.fabric || '১০০% কম্বড অর্গানিক কটন (220 GSM Interlock)'}</b></td>
                    </tr>
                    <tr>
                      <td>নিরাপত্তা মানদণ্ড:</td>
                      <td>নিকেল-মুক্ত স্ন্যাপ বাটন, লেড-মুক্ত নন-টক্সিক ডাইং</td>
                    </tr>
                    <tr>
                      <td>উপযোগী ঋতু:</td>
                      <td>অল-সিজন (গ্রীষ্ম, বর্ষা ও শীতের সময় আরামদায়ক)</td>
                    </tr>
                    <tr>
                      <td>সিলাই ও ফিনিশিং:</td>
                      <td>ডাবল স্টিচ ফ্ল্যাট-লক সিমস (বাচ্চার কোমল গায়ে দাগ বা চুলকানি হবে না)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {viewingProductTab === 'size' && (
              <div className="bw-tab-pane">
                <h3>শিশুর বয়স ও পরিমাপ নির্দেশিকা</h3>
                <p style={{ color: '#64748B', marginBottom: 12 }}>
                  আপনার বাবুর সঠিক মাপ জানতে নিচের পরিমাপ চার্টটি অনুসরণ করুন:
                </p>
                <table className="bw-specs-table">
                  <thead>
                    <tr>
                      <th>সাইজ</th>
                      <th>বয়স</th>
                      <th>শিশুর উচ্চতা</th>
                      <th>শিশুর ওজন</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>0-3M</td><td>০ - ৩ মাস</td><td>৫০ - ৬০ সেমি</td><td>৩ - ৫ কেজি</td></tr>
                    <tr><td>3-6M</td><td>৩ - ৬ মাস</td><td>৬০ - ৬৮ সেমি</td><td>৫ - ৭.৫ কেজি</td></tr>
                    <tr><td>6-12M</td><td>৬ - ১২ মাস</td><td>৬৮ - ৭৬ সেমি</td><td>৭.৫ - ১০ কেজি</td></tr>
                    <tr><td>12-18M</td><td>১২ - ১৮ মাস</td><td>৭৬ - ৮৪ সেমি</td><td>১০ - ১২ কেজি</td></tr>
                    <tr><td>18-24M</td><td>১৮ - ২৪ মাস</td><td>৮৪ - ৯০ সেমি</td><td>১২ - ১৪ কেজি</td></tr>
                  </tbody>
                </table>
              </div>
            )}

            {viewingProductTab === 'care' && (
              <div className="bw-tab-pane">
                <h3>ওয়াশ ও যত্ন নির্দেশিকা (Care Guide)</h3>
                <ul className="bw-bullet-list">
                  <li>প্রথমবার পরানোর পূর্বে হালকা কুসুম গরম পানিতে একবার ধুয়ে নেওয়া ভালো।</li>
                  <li>মেশিন ওয়াশের ক্ষেত্রে মৃদু ডিটারজেন্ট দিয়ে ৩০°C তাপমাত্রায় ওয়াশ করুন।</li>
                  <li>কখনোই কোনো ব্লিচ বা কড়া কেমিক্যাল ব্যবহার করবেন না।</li>
                  <li>ছায়াযুক্ত স্থানে শুকাতে দিন এবং প্রয়োজনে মাঝারি তাপে আয়রন করুন।</li>
                </ul>
              </div>
            )}

            {viewingProductTab === 'delivery' && (
              <div className="bw-tab-pane">
                <h3>ডেলিভারি ও এক্সচেঞ্জ নিশ্চয়তা</h3>
                <ul className="bw-bullet-list">
                  <li><b>ঢাকার ভেতরে:</b> ডেলিভারি চার্জ ৳{storeSettings.deliveryInside}। ২৪ থেকে ৪৮ ঘণ্টার মধ্যে ডেলিভারি।</li>
                  <li><b>ঢাকার বাইরে:</b> ডেলিভারি চার্জ ৳{storeSettings.deliveryOutside}। ২ থেকে ৩ কার্যদিবসের মধ্যে কুরিয়ারের মাধ্যমে হোম ডেলিভারি।</li>
                  <li><b>ক্যাশ অন ডেলিভারি:</b> পার্সেল খুলে পোশাকের মান যাচাই করে মূল্য পরিশোধ করার সুবিধা।</li>
                  <li><b>সহজ সাইজ এক্সচেঞ্জ:</b> সাইজ না মিললে বা কোনো অসঙ্গতি থাকলে ৭ দিনের মধ্যে আমাদের হটলাইনে কল করে সহজেই এক্সচেঞ্জ করা যাবে।</li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Product Reviews */}
        <div className="bw-p-reviews-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: 0 }}>
                কাস্টমারদের বাস্তব মতামত ও অভিজ্ঞতা
              </h3>
              <p style={{ color: '#64748B', fontSize: 13, margin: '4px 0 0' }}>
                এই পোশাকটি ব্যবহারকারী অভিভাবকদের অনুমোদিত রিভিউ
              </p>
            </div>
            <button
              className="bw-btn bw-btn-pink"
              onClick={() => {
                setRevProductId(p.id);
                setIsReviewModalOpen(true);
              }}
            >
              ✍️ আপনার রিভিউ লিখুন
            </button>
          </div>

          {prodReviews.length === 0 ? (
            <div className="bw-empty-reviews">
              এই পোশাকটিতে এখনো কোনো অনুমোদিত রিভিউ নেই। আপনিও অর্ডার শেষে আপনার বাবু কেমন আরাম পাচ্ছে তা শেয়ার করতে পারেন!
            </div>
          ) : (
            <div className="bw-reviews-grid">
              {prodReviews.map((r) => (
                <div key={r.id} className="bw-review-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>📍 {r.location || 'বাংলাদেশ'}</div>
                    </div>
                    <div style={{ color: '#F59E0B' }}>{'★'.repeat(r.rating || 5)}</div>
                  </div>
                  <p style={{ color: '#334155', fontSize: 13, lineHeight: 1.6 }}>"{r.text}"</p>
                  {r.image && (
                    <img
                      src={r.image}
                      alt="Customer baby photo"
                      style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 10, marginTop: 10, border: '1px solid #E2E8F0' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Related Products */}
        <div className="bw-related-section">
          <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginBottom: 18 }}>
            একই ক্যাটাগরির আরও আকর্ষণীয় কালেকশন
          </h3>
          <div className="bw-product-grid">
            {products
              .filter((item) => item.id !== p.id && catObj && isProductInCategory(item, catObj))
              .slice(0, 4)
              .map(renderProductCard)}
          </div>
        </div>
      </main>
    );
  };

  // Product Card Renderer Component
  const renderProductCard = (p: Product) => {
    const szs = getProductSizes(p);
    const curSize = selectedSizes[p.id] || szs[0] || 'Standard';
    const original = p.originalPrice || p.compareAt || p.price;
    const discountPct = original > p.price ? Math.round(((original - p.price) / original) * 100) : 0;
    const savings = original > p.price ? original - p.price : 0;
    const cardImg = (p.images && p.images[0]) || p.image || '/uploads/baby-wear-logo.png';

    return (
      <div key={p.id} className="bw-card">
        {/* Media */}
        <div
          className="bw-card-media"
          onClick={() => openProductDetail(p)}
        >
          {(p.badge || p.tag) && <span className="bw-card-badge">{p.badge || p.tag}</span>}
          {discountPct > 0 && <span className="bw-card-discount">-{discountPct}% OFF</span>}

          <img
            src={cardImg}
            alt={p.name}
            className="bw-card-img"
            loading="lazy"
          />
        </div>

        {/* Body */}
        <div className="bw-card-body">
          {p.fabric && <span className="bw-card-fabric-tag">🌿 {p.fabric.split('(')[0]}</span>}

          <h3
            className="bw-card-title"
            title={p.name}
            onClick={() => openProductDetail(p)}
          >
            {p.name}
          </h3>

          {/* Rating */}
          <div className="bw-card-meta-row">
            <span className="bw-card-stars">{p.rating != null ? `⭐ ${p.rating}` : '⭐ নতুন'}</span>
            <span>{p.ratingCount ? `(${p.ratingCount}+ রিভিউ)` : '(রিভিউ আসছে)'}</span>
          </div>

          {/* Size Selector */}
          {szs.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B' }}>সাইজ:</span>
                <span
                  style={{ fontSize: 11, color: '#0284C7', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setIsSizeGuideOpen(true)}
                >
                  📏 সাইজ চার্ট
                </span>
              </div>
              <div className="bw-card-sizes">
                {szs.map((s) => (
                  <span
                    key={s}
                    className={`bw-size-chip ${curSize === s ? 'selected' : ''}`}
                    onClick={() => setSelectedSizes((prev) => ({ ...prev, [p.id]: s }))}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Price */}
          <div className="bw-price-row">
            <span className="bw-price-now">৳{p.price}</span>
            {original > p.price && (
              <span className="bw-price-old">৳{original}</span>
            )}
            {savings > 0 && (
              <span className="bw-price-save">বাঁচবে ৳{savings}</span>
            )}
          </div>

          {/* Actions */}
          <div className="bw-card-actions">
            <button
              className="bw-btn-order-now"
              onClick={() => openDirectBuy(p, curSize)}
            >
              ⚡ সরাসরি অর্ডার
            </button>

            <button
              className="bw-btn-add-cart"
              onClick={() => addToCart(p, curSize)}
            >
              🛒 কার্ট
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', ['--bw-accent' as any]: storeSettings.appearance?.accent || '#ec4899', ['--bw-cols-desktop' as any]: storeSettings.appearance?.desktopColumns || 4, ['--bw-cols-mobile' as any]: storeSettings.appearance?.mobileColumns || 2, ['--bw-image-fit' as any]: storeSettings.appearance?.imageFit || 'cover' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 95,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#FFFFFF',
            padding: '12px 26px',
            borderRadius: 9999,
            fontSize: 14,
            fontWeight: 700,
            boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {toast}
        </div>
      )}

      {/* Top Announcement Bar */}
      <div className="bw-topbar">
        <div className="bw-topbar-item">
          {announcementText}
        </div>
        {!announcementIncludesHotline && hotline && <a href={`tel:${hotline}`} className="bw-topbar-hotline">
          📞 হটলাইন: {hotline}
        </a>}
      </div>

      {/* Main Header */}
      <header className="bw-header">
        <div className="bw-header-inner">
          {/* Mobile Hamburger Button */}
          <button
            className="bw-hamburger"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          {/* Logo & Brand */}
          <a
            href="/"
            className="bw-logo-container"
            onClick={(e) => {
              e.preventDefault();
              setActiveCategory('all');
              setSearchQuery('');
            }}
          >
            <div className="bw-logo-badge">
              <img src={storeSettings.logo} alt={`${storeSettings.storeName} Logo`} />
            </div>
            <div className="bw-brand-text">
              <div className="bw-brand-title">
                <span className="bw-brand-baby">Baby</span>
                <span className="bw-brand-wear">Wear</span>
              </div>
              <span className="bw-brand-tagline">PREMIUM BABY BOUTIQUE</span>
            </div>
          </a>

          {/* Search Bar */}
          <div className="bw-search-wrapper">
            <span className="bw-search-icon">🔍</span>
            <input
              type="text"
              className="bw-search-input"
              placeholder="বেবি রম্পার, ফ্রক, স্যুট বা সাইজ খুঁজুন (e.g. 0-3M)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="bw-search-clear" onClick={() => setSearchQuery('')}>
                ✕
              </button>
            )}
          </div>

          {/* Action Pills */}
          <div className="bw-actions">
            {hotline && <a href={`tel:${hotline}`} className="bw-action-pill">
              📞 {hotline}
            </a>}

            {whatsappLink && <a href={whatsappLink} target="_blank" rel="noreferrer" className="bw-action-pill bw-action-wa">
              <WhatsAppIcon size={16} variant="official" />
              <span>WhatsApp</span>
            </a>}

            <button
              className="bw-action-pill"
              onClick={() => {
                setShowTrackModal(true);
                setTrackResult(null);
              }}
            >
              📦 অর্ডার ট্র্যাক
            </button>

            <button className="bw-cart-btn" onClick={() => setIsCartOpen(true)}>
              🛒 কার্ট
              {cartTotalQty > 0 && <span className="bw-cart-badge">{cartTotalQty}</span>}
            </button>
          </div>
        </div>

        {/* Secondary Multi-Page Nav Bar (Desktop & Tablet) */}
        <nav className="bw-nav-bar">
          <div className="bw-nav-inner">
            <span
              className={`bw-nav-link ${activeCategory === 'all' && !searchQuery ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory('all');
                setSearchQuery('');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              🏠 হোম
            </span>

            <span
              className={`bw-nav-link ${activeCategory === 'all' && !searchQuery ? '' : ''}`}
              onClick={() => {
                setActiveCategory('all');
                setSearchQuery('');
                document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              🛍️ সকল পণ্য ({products.length})
            </span>

            {categories.map((c) => (
              <span
                key={c.id}
                className={`bw-nav-link ${activeCategory === c.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(c.id);
                  setSearchQuery('');
                  const el = document.getElementById(`cat-${c.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                {getCatIcon(c.slug || c.id)} {c.name.split('(')[0].trim()}
              </span>
            ))}

            <span className="bw-nav-link" onClick={() => setIsSizeGuideOpen(true)}>
              📏 সাইজ চার্ট
            </span>

            <span
              className="bw-nav-link"
              onClick={() => {
                document.getElementById('reviews-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              💬 কাস্টমার রিভিউ
            </span>

            <span
              className="bw-nav-link"
              onClick={() => {
                setShowTrackModal(true);
                setTrackResult(null);
              }}
            >
              📦 অর্ডার ট্র্যাকিং
            </span>
          </div>
        </nav>
      </header>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="bw-drawer-backdrop" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="bw-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src="/uploads/baby-wear-logo.png" alt="Baby Wear" style={{ width: 38, height: 38, borderRadius: '50%' }} />
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#0F3A66' }}>Baby Wear</b>
              </div>
              <button
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748B' }}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F1F5F9' }}>
              <input
                type="text"
                className="bw-input"
                style={{ marginBottom: 0, padding: '10px 14px', fontSize: 13 }}
                placeholder="পোশাক বা সাইজ খুঁজুন..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ padding: '10px 14px', overflowY: 'auto', flex: 1 }}>
              <div
                style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: activeCategory === 'all' ? '#0284C7' : '#1E293B', cursor: 'pointer', borderRadius: 8, background: activeCategory === 'all' ? '#F0F9FF' : 'transparent' }}
                onClick={() => {
                  setActiveCategory('all');
                  setIsMobileMenuOpen(false);
                }}
              >
                🏠 হোম ও সকল পণ্য
              </div>

              <div style={{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, padding: '12px 14px 6px' }}>
                ক্যাটাগরি সমূহ
              </div>

              {categories.map((c) => (
                <div
                  key={c.id}
                  style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 600, color: activeCategory === c.id ? '#EC4899' : '#334155', cursor: 'pointer', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, background: activeCategory === c.id ? '#FDF2F8' : 'transparent' }}
                  onClick={() => {
                    setActiveCategory(c.id);
                    setIsMobileMenuOpen(false);
                    const el = document.getElementById(`cat-${c.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <span>{getCatIcon(c.slug || c.id)}</span>
                  <span>{c.name}</span>
                </div>
              ))}

              <div style={{ borderTop: '1px solid #F1F5F9', marginTop: 14, paddingTop: 10 }}>
                <div
                  style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 600, color: '#0284C7', cursor: 'pointer' }}
                  onClick={() => {
                    setIsSizeGuideOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  📏 সাইজ গাইড চার্ট
                </div>
                <div
                  style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 600, color: '#0284C7', cursor: 'pointer' }}
                  onClick={() => {
                    setShowTrackModal(true);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  📦 অর্ডার ট্র্যাক করুন
                </div>
                <div
                  style={{ padding: '11px 14px', fontSize: 13.5, fontWeight: 600, color: '#EC4899', cursor: 'pointer' }}
                  onClick={() => {
                    setIsReviewModalOpen(true);
                    setIsMobileMenuOpen(false);
                  }}
                >
                  ✍️ কাস্টমার রিভিউ দিন
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC' }}>
              {hotline && <a
                href={`tel:${hotline}`}
                className="bw-btn bw-btn-blue"
                style={{ width: '100%', padding: '10px', fontSize: 13, marginBottom: 8 }}
              >
                📞 কল দিন: {hotline}
              </a>}
              {whatsappLink && <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="bw-btn"
                style={{ width: '100%', padding: '10px', fontSize: 13, background: '#25D366', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <WhatsAppIcon size={18} variant="white" />
                <span>WhatsApp চ্যাট</span>
              </a>}
            </div>
          </div>
        </div>
      )}

      {viewingProduct ? (
        renderSingleProductView()
      ) : (
        <>
          {/* Hero Showcase Section */}
      {(() => {
        const heroSlide = heroSlides.length ? heroSlides[activeHeroSlide % heroSlides.length] : null;
        return showSection('hero') && <section className="bw-hero">
        <div className="bw-hero-card">
          <div>
            <div className="bw-hero-pill">
              {heroSlide?.badge || '🧸 আপনার সোনামণির কোমল ত্বকের জন্য সেরা পছন্দ'}
            </div>
            <h1 className="bw-hero-title">
              {heroSlide?.title || homeCopy('heroTitle', 'সবচেয়ে নরম ও আরামদায়ক বেবি পোশাকের রাজকীয় কালেকশন')}
            </h1>
            <p className="bw-hero-desc">
              {heroSlide?.subtitle || homeCopy('heroDescription', 'নরম ও শ্বাস-প্রশ্বাস চলাচল করে এমন সুতি কাপড়ে তৈরি পোশাক—আপনার সোনামণির প্রতিদিনের আরামের জন্য।')}
            </p>

            <div className="bw-hero-cta-group">
              <a
                href="#catalog"
                className="bw-btn bw-btn-pink"
                onClick={(e) => {
                  e.preventDefault();
                  const target = String(heroSlide?.btnLink || 'shop').replace(/^#/, '');
                  const categoryKey = target.startsWith('category:') ? target.slice('category:'.length) : target;
                  const category = categories.find((c) => c.id === categoryKey || c.slug === categoryKey);
                  if (category) {
                    setActiveCategory(category.id);
                    document.getElementById(`cat-${category.id}`)?.scrollIntoView({ behavior: 'smooth' });
                  } else {
                    setActiveCategory('all');
                    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                {heroSlide?.btnText || '👶 সম্পূর্ণ কালেকশন দেখুন'}
              </a>

              <button
                className="bw-btn bw-btn-blue"
                onClick={() => {
                  setActiveCategory('cat_newborn');
                  document.getElementById('cat-cat_newborn')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                🎁 নিউবর্ন গিফট সেট
              </button>

              <button
                className="bw-btn bw-btn-outline"
                style={{ fontSize: 13, padding: '10px 18px' }}
                onClick={() => setIsSizeGuideOpen(true)}
              >
                📏 সাইজ গাইড চার্ট
              </button>
            </div>
          </div>

          <div className="bw-hero-image-box">
            <picture>
              {heroSlide?.mobileImage && <source media="(max-width: 640px)" srcSet={heroSlide.mobileImage} />}
              <img src={heroSlide?.image || '/uploads/baby-wear-logo.png'} alt={heroSlide?.title || 'Baby Wear Collection'} className="bw-hero-img" />
            </picture>
            <div className="bw-hero-floating-badge">
              <span style={{ fontSize: 24 }}>{reviews.length ? '⭐' : '🧸'}</span>
              <div>
                <b style={{ fontSize: 13.5, color: '#0F172A', display: 'block', lineHeight: 1.3 }}>{reviews.length ? `${reviewsAvg.toFixed(1)}/৫ অভিভাবক রেটিং` : 'নরম আরাম, প্রতিদিন'}</b>
                <span style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.4 }}>{reviews.length ? `${reviews.length}টি যাচাইকৃত মতামত` : 'ছোট্ট সোনামণির জন্য যত্নে বাছাই'}</span>
              </div>
            </div>
            {heroSlides.length > 1 && (
              <div className="bw-hero-slide-dots" aria-label="প্রচার স্লাইড নির্বাচন">
                {heroSlides.map((slide: any, index: number) => (
                  <button key={slide.id || index} type="button" aria-label={`${index + 1} নম্বর স্লাইড`} aria-current={index === activeHeroSlide ? 'true' : undefined} onClick={() => setActiveHeroSlide(index)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      })()}

          {/* Trust & Features Bar */}
          {showSection('benefits') && <section className="bw-features-bar">
            <div className="bw-feature-item">
              <div className="bw-feature-icon">
                <LeafIcon size={24} color="#059669" />
              </div>
              <div className="bw-feature-content">
                <div className="bw-feature-title">১০০% অর্গানিক কম্বড সুতি</div>
                <div className="bw-feature-desc">নিকেল-ফ্রি স্ন্যাপ বাটন, ত্বক থাকবে র‍্যাশমুক্ত</div>
              </div>
            </div>

            <div className="bw-feature-item bw-feature-pink">
              <div className="bw-feature-icon">
                <TruckIcon size={24} color="#0284C7" />
              </div>
              <div className="bw-feature-content">
                <div className="bw-feature-title">ক্যাশ অন ডেলিভারি</div>
                <div className="bw-feature-desc">পণ্য হাতে পেয়ে চেক করে মূল্য পরিশোধের সুবিধা</div>
              </div>
            </div>

            <div className="bw-feature-item">
              <div className="bw-feature-icon">
                <ExchangeIcon size={24} color="#D97706" />
              </div>
              <div className="bw-feature-content">
                <div className="bw-feature-title">৭ দিনে সহজ সাইজ এক্সচেঞ্জ</div>
                <div className="bw-feature-desc">সাইজ ছোট বা বড় হলে দ্রুত পরিবর্তন গ্যারান্টি</div>
              </div>
            </div>

            <div className="bw-feature-item bw-feature-pink">
              <div className="bw-feature-icon">
                <WhatsAppIcon size={24} variant="official" />
              </div>
              <div className="bw-feature-content">
                <div className="bw-feature-title">প্যারেন্টস হেল্পলাইন</div>
                <div className="bw-feature-desc">হোয়াটসঅ্যাপ বা কলে তাৎক্ষণিক পরামর্শ সেবা</div>
              </div>
            </div>
          </section>}

          {/* Category Showcase Section with 1080x1080 Square Images */}
          {showSection('categories') && <section className="bw-category-grid-section">
            <div className="bw-cat-grid-header">
              <h2 className="bw-section-title">
                <span>{homeCopy('categoriesTitle', 'পছন্দের বেবি কালেকশন')}</span>
              </h2>
              <p className="bw-section-subtitle">
                ১০৮০×১০৮০ স্কয়ার প্রিমিয়াম লুক সহ আপনার বাবুর বয়সের সাথে মানানসই ক্যাটাগরি বেছে নিন
              </p>
            </div>
            <div className="bw-categories-showcase-grid">
              {categories.map((c) => {
                const pCount = products.filter((p) => isProductInCategory(p, c)).length;
                return (
                  <div
                    key={c.id}
                    className="bw-cat-square-card"
                    onClick={() => {
                      setActiveCategory(c.id);
                      const el = document.getElementById(`cat-${c.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    <div className="bw-cat-img-wrapper">
                      <img
                        src={c.image || '/uploads/baby-wear-logo.png'}
                        alt={c.name}
                        className="bw-cat-square-img"
                        loading="lazy"
                      />
                      <span className="bw-cat-count-pill">{pCount}টি আইটেম</span>
                    </div>
                    <div className="bw-cat-info">
                      <h4 className="bw-cat-name">{c.name}</h4>
                      {c.blurb && <p className="bw-cat-blurb">{c.blurb}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>}

      {/* Catalog Title */}
      {showSection('catalog') && <section id="catalog" className="bw-cat-section">
        <div className="bw-section-header">
          <h2 className="bw-section-title">
            <span style={{ color: 'var(--bw-accent)' }}>{homeCopy('catalogTitle', 'আমাদের স্পেশাল বেবি ওয়্যার কালেকশন')}</span>
          </h2>
          <p className="bw-section-subtitle">
            {homeCopy('catalogDescription', 'বয়স, সাইজ ও ফেব্রিক অনুযায়ী সাজানো আমাদের প্রতিটি ক্যাটাগরি এক্সপ্লোর করুন')}
          </p>
        </div>
      </section>}

      {/* HOMEPAGE ORGANIZED CATEGORY-BY-CATEGORY */}
      {showSection('catalog') && (loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', fontSize: 18, color: '#64748B' }}>
          👶 লোড হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন
        </div>
      ) : searchQuery.trim() ? (
        /* If Searching, show unified search results */
        <section className="bw-product-grid">
          {filteredProducts.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', fontSize: 16, color: '#64748B' }}>
              "{searchQuery}" এর জন্য কোনো পণ্য পাওয়া যায়নি।
            </div>
          ) : (
            filteredProducts.map(renderProductCard)
          )}
        </section>
      ) : activeCategory !== 'all' ? (
        /* If Single Category selected */
        <section className="bw-cat-block">
          {(() => {
            const catObj = categories.find((c) => c.id === activeCategory || c.slug === activeCategory);
            const catProds = products.filter((p) => catObj && isProductInCategory(p, catObj));
            const catIcon = getCatIcon(catObj?.slug || activeCategory);

            return (
              <div>
                <div className="bw-cat-block-header">
                  <div className="bw-cat-block-title-box">
                    <div className="bw-cat-block-icon">{catIcon}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <h3 className="bw-cat-block-title">{catObj?.name || 'কালেকশন'}</h3>
                        <span className="bw-cat-block-badge">{catProds.length} টি পণ্য</span>
                      </div>
                      <p className="bw-cat-block-subtitle">১০০% প্রিমিয়াম সুতি কাপড়ে তৈরি আরামদায়ক পোশাক</p>
                    </div>
                  </div>
                  <button className="bw-cat-block-viewall" onClick={() => setActiveCategory('all')}>
                    ← সব ক্যাটাগরি দেখুন
                  </button>
                </div>

                <div className="bw-product-grid" style={{ padding: 0 }}>
                  {catProds.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                      এই ক্যাটাগরিতে পণ্য যুক্ত করা হচ্ছে।
                    </div>
                  ) : (
                    catProds.map(renderProductCard)
                  )}
                </div>
              </div>
            );
          })()}
        </section>
      ) : products.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '52px 18px', color: '#64748B' }}>
          <h3 style={{ margin: '0 0 8px', color: '#0F172A' }}>পণ্য শিগগির যোগ করা হবে</h3>
          <p style={{ margin: 0 }}>নতুন পণ্য যুক্ত হলে এখানে দেখা যাবে।</p>
        </div>
      ) : (
        /* Default: Categorized Homepage Shelf Display */
        <div>
          {configuredHomeSections.map((config: any, sectionIndex: number) => {
            const cat = categories.find((item) => item.id === config.category || item.slug === config.category);
            if (!cat) return null;
            const catProds = products.filter((p) => isProductInCategory(p, cat));
            if (catProds.length === 0) return null;
            const catIcon = getCatIcon(cat.slug || cat.id);

            return (
              <section key={config.id || `${cat.id}-${sectionIndex}`} id={`cat-${cat.id}`} className="bw-cat-block">
                <div className="bw-cat-block-header">
                  <div className="bw-cat-block-title-box">
                    <div className="bw-cat-block-icon">{catIcon}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <h3 className="bw-cat-block-title">{config.title || cat.name}</h3>
                        <span className="bw-cat-block-badge">{catProds.length} টি পণ্য</span>
                      </div>
                      <p className="bw-cat-block-subtitle">
                        {cat.blurb || 'আপনার সোনামণির জন্য সবচেয়ে নরম ও আরামদায়ক পোশাক'}
                      </p>
                    </div>
                  </div>

                  <button
                    className="bw-cat-block-viewall"
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    সব দেখুন ({catProds.length}) →
                  </button>
                </div>

                <div className="bw-product-grid" style={{ padding: 0 }}>
                  {catProds.slice(0, Math.max(1, Number(config.count) || 40)).map(renderProductCard)}
                </div>
              </section>
            );
          })}
        </div>
      ))}

      {/* REAL PARENT FEEDBACK & UPLOAD SECTION */}
      {showSection('reviews') && <section id="reviews-section" className="bw-reviews-container">
        <div className="bw-reviews-header-row">
          <div>
            <h2 className="bw-section-title" style={{ textAlign: 'left', marginBottom: 4 }}>
              <span style={{ color: '#EC4899' }}>{homeCopy('reviewsTitle', 'রিয়েল প্যারেন্টস ফিডব্যাক ও অভিজ্ঞতা')}</span>
            </h2>
            <p className="bw-section-subtitle" style={{ textAlign: 'left' }}>
              আমাদের গ্রাহকদের আসল অভিজ্ঞতা ও ছবি · রেটিং: <b>⭐ {reviews.length ? `${reviewsAvg.toFixed(1)}/৫` : 'এখনো রিভিউ নেই'}</b> ({reviews.length}টি রিভিউ)
            </p>
          </div>

          <button
            className="bw-btn bw-btn-pink"
            onClick={() => setIsReviewModalOpen(true)}
          >
            ✍️ আপনার অভিজ্ঞতা শেয়ার করুন / রিভিউ লিখুন
          </button>
        </div>

        <div className="bw-reviews-grid">
          {reviews.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
              এখনো কোনো রিভিউ দেওয়া হয়নি। প্রথম রিভিউটি আপনি দিন!
            </div>
          ) : (
            reviews.map((rev) => (
              <div key={rev.id} className="bw-review-card">
                {/* Uploaded Baby Photo if available */}
                {rev.image && (
                  <img
                    src={rev.image}
                    alt="Customer feedback"
                    className="bw-review-photo"
                    loading="lazy"
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ color: '#F59E0B', fontSize: 16 }}>
                    {'⭐'.repeat(rev.rating || 5)}
                  </div>
                  {rev.productName && (
                    <span style={{ fontSize: 11, background: '#F0F9FF', color: '#0284C7', padding: '2px 8px', borderRadius: 99, fontWeight: 600 }}>
                      {rev.productName}
                    </span>
                  )}
                </div>

                <p style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.65, marginBottom: 16, flex: 1 }}>
                  "{rev.text}"
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid #F1F5F9', paddingTop: 12 }}>
                  <div
                    className="bw-review-avatar"
                    style={{
                      background: 'linear-gradient(135deg, #BAE6FD, #FBCFE8)',
                      color: '#0F3A66',
                    }}
                  >
                    {rev.name ? rev.name.charAt(0) : 'প'}
                  </div>
                  <div>
                    <b style={{ fontSize: 13.5, color: '#0F172A', display: 'block' }}>{rev.name}</b>
                    <span style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 600 }}>
                      ✓ ভেরিফাইড বায়ার · {rev.location || 'ঢাকা'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>}
      </>
    )}

      {/* Floating WhatsApp Button */}
      {whatsappLink && <div
        className="bw-floating-wa"
        onClick={() => window.open(whatsappLink, '_blank')}
        title="Chat on WhatsApp"
      >
        <WhatsAppIcon size={32} variant="official" />
      </div>}

      {/* Sticky Mobile Bottom Bar (Multi-Page Navigation on Phones) */}
      <div className="bw-mobile-bar">
        <button
          className="bw-btn bw-btn-outline"
          style={{ flex: 1, padding: '8px 4px', fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 2, border: 'none' }}
          onClick={() => {
            setActiveCategory('all');
            setSearchQuery('');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span style={{ fontSize: 16 }}>🏠</span>
          <span>হোম</span>
        </button>

        <button
          className="bw-btn bw-btn-outline"
          style={{ flex: 1, padding: '8px 4px', fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 2, border: 'none' }}
          onClick={() => {
            setActiveCategory('all');
            setSearchQuery('');
            document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          <span style={{ fontSize: 16 }}>🛍️</span>
          <span>শপ</span>
        </button>

        <button
          className="bw-btn bw-btn-outline"
          style={{ flex: 1, padding: '8px 4px', fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 2, border: 'none' }}
          onClick={() => {
            setShowTrackModal(true);
            setTrackResult(null);
          }}
        >
          <span style={{ fontSize: 16 }}>📦</span>
          <span>ট্র্যাক</span>
        </button>

        <button
          className="bw-btn bw-btn-pink"
          style={{ flex: 1.5, padding: '8px 10px', fontSize: 12.5 }}
          onClick={() => {
            if (cart.length > 0) {
              setDirectCheckoutItem(null);
              setIsCheckoutOpen(true);
            } else {
              document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
        >
          🛒 কার্ট ({cartTotalQty})
        </button>
      </div>

      {/* Write a Review Modal */}
      {isReviewModalOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsReviewModalOpen(false)}>
          <div className="bw-modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setIsReviewModalOpen(false)}>
              ✕
            </button>

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 4, lineHeight: 1.3 }}>
              ✍️ আপনার অভিজ্ঞতা ও রিভিউ শেয়ার করুন
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 18, lineHeight: 1.45 }}>
              আপনার মতামত ও ছবি অন্যান্য মা-বাবাদের সঠিক সিদ্ধান্ত নিতে সাহায্য করবে
            </p>

            <form onSubmit={handleSubmitReview}>
              <label className="bw-form-label">কোন পোশাকটি কিনেছেন?</label>
              <select
                className="bw-input"
                value={revProductId}
                onChange={(e) => setRevProductId(e.target.value)}
              >
                <option value="">(সাধারণ / কালেকশন রিভিউ)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (৳{p.price})
                  </option>
                ))}
              </select>

              <label className="bw-form-label">আপনার নাম *</label>
              <input
                className="bw-input"
                placeholder="যেমন: তানজিলা আহমেদ"
                required
                value={revName}
                onChange={(e) => setRevName(e.target.value)}
              />

              <label className="bw-form-label">আপনার জেলা বা এলাকা</label>
              <input
                className="bw-input"
                placeholder="যেমন: ধানমন্ডি, ঢাকা বা চট্টগ্রাম"
                value={revLocation}
                onChange={(e) => setRevLocation(e.target.value)}
              />

              <label className="bw-form-label">আপনার রেটিং নির্বাচন করুন</label>
              <div className="bw-star-picker">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className="bw-star-item"
                    style={{ color: star <= revRating ? '#F59E0B' : '#CBD5E1' }}
                    onClick={() => setRevRating(star)}
                  >
                    ★
                  </span>
                ))}
                <span style={{ fontSize: 13, color: '#64748B', marginLeft: 8, alignSelf: 'center' }}>
                  ({revRating}/৫ স্টার)
                </span>
              </div>

              <label className="bw-form-label">বাবুর পরা ছবি বা আনবক্সিং ছবি যুক্ত করুন (ঐচ্ছিক)</label>
              <div
                className="bw-upload-dropzone"
                onClick={() => fileInputRef.current?.click()}
              >
                {revImage ? (
                  <div>
                    <img
                      src={revImage}
                      alt="Preview"
                      style={{ maxHeight: 120, borderRadius: 8, margin: '0 auto 8px', display: 'block' }}
                    />
                    <span style={{ fontSize: 12, color: '#0284C7', fontWeight: 600 }}>
                      ✓ ছবি সিলেক্ট হয়েছে (পরিবর্তন করতে ক্লিক করুন)
                    </span>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>📸</div>
                    <span style={{ fontSize: 13, color: '#0284C7', fontWeight: 700 }}>
                      + ছবি আপলোড করতে এখানে ক্লিক করুন
                    </span>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>
                      PNG, JPG সর্বোচ্চ ৫ মেগাবাইট
                    </p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleReviewPhotoSelect}
                />
              </div>

              <label className="bw-form-label">আপনার রিভিউ বা মন্তব্য *</label>
              <textarea
                className="bw-input"
                rows={3}
                placeholder="কাপড়ের মান, সাইজ এবং ফিটিংস সম্পর্কে আপনার অনুভূতি লিখুন..."
                required
                value={revText}
                onChange={(e) => setRevText(e.target.value)}
              />

              <button
                type="submit"
                disabled={revSubmitting}
                className="bw-btn bw-btn-pink"
                style={{ width: '100%', padding: '14px', fontSize: 16 }}
              >
                {revSubmitting ? 'রিভিউ জমা হচ্ছে…' : '✓ রিভিউ পাবলিশ করুন'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Quick View Product Modal */}
      {quickViewProduct && (
        <div className="bw-modal-backdrop" onClick={() => setQuickViewProduct(null)}>
          <div
            className="bw-modal-card"
            style={{ maxWidth: 650 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="bw-modal-close" onClick={() => setQuickViewProduct(null)}>
              ✕
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
              <div>
                <img
                  src={quickViewActiveImg || (quickViewProduct.images && quickViewProduct.images[0]) || quickViewProduct.image || '/uploads/baby-wear-logo.png'}
                  alt={quickViewProduct.name}
                  style={{ width: '100%', height: 280, objectFit: 'cover', borderRadius: 16 }}
                />
                {quickViewProduct.images && quickViewProduct.images.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {quickViewProduct.images.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt="thumb"
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 8,
                          objectFit: 'cover',
                          cursor: 'pointer',
                          border: quickViewActiveImg === img ? '2px solid #0284C7' : '1px solid #E2E8F0',
                        }}
                        onClick={() => setQuickViewActiveImg(img)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="bw-card-fabric-tag">🌿 {quickViewProduct.fabric || '১০০% প্রিমিয়াম সুতি'}</span>
                <h3 style={{ fontSize: 18, color: '#0F172A', fontWeight: 800, marginTop: 6, marginBottom: 8, lineHeight: 1.35 }}>
                  {quickViewProduct.name}
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.55, marginBottom: 14 }}>
                  {quickViewProduct.desc || 'বাচ্চার জন্য অত্যন্ত নরম ও আরামদায়ক ১০০% পিওর সুতি পোশাক।'}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#BE185D' }}>
                    ৳{quickViewProduct.price}
                  </span>
                  {(quickViewProduct.originalPrice || quickViewProduct.compareAt || 0) > quickViewProduct.price && (
                    <span style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'line-through' }}>
                      ৳{quickViewProduct.originalPrice || quickViewProduct.compareAt}
                    </span>
                  )}
                </div>

                {getProductSizes(quickViewProduct).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <b style={{ fontSize: 12, color: '#0F172A' }}>সাইজ:</b>
                      <span
                        style={{ fontSize: 11, color: '#0284C7', cursor: 'pointer', fontWeight: 600 }}
                        onClick={() => setIsSizeGuideOpen(true)}
                      >
                        📏 সাইজ গাইড চার্ট
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {getProductSizes(quickViewProduct).map((s) => (
                        <span
                          key={s}
                          className={`bw-size-chip ${selectedSizes[quickViewProduct.id] === s ? 'selected' : ''}`}
                          onClick={() => setSelectedSizes((p) => ({ ...p, [quickViewProduct.id]: s }))}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button
                    className="bw-btn bw-btn-pink"
                    style={{ flex: 1.2, padding: '12px' }}
                    onClick={() => {
                      const szs = getProductSizes(quickViewProduct);
                      const curS = selectedSizes[quickViewProduct.id] || szs[0];
                      setQuickViewProduct(null);
                      openDirectBuy(quickViewProduct, curS);
                    }}
                  >
                    ⚡ সরাসরি অর্ডার
                  </button>

                  <button
                    className="bw-btn bw-btn-blue"
                    style={{ flex: 1, padding: '12px' }}
                    onClick={() => {
                      const szs = getProductSizes(quickViewProduct);
                      const curS = selectedSizes[quickViewProduct.id] || szs[0];
                      addToCart(quickViewProduct, curS);
                    }}
                  >
                    🛒 কার্টে যোগ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Size Guide Modal */}
      {isSizeGuideOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsSizeGuideOpen(false)}>
          <div className="bw-modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setIsSizeGuideOpen(false)}>
              ✕
            </button>

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 6, lineHeight: 1.3 }}>
              📏 বেবি ওয়্যার স্ট্যান্ডার্ড সাইজ গাইড
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14, lineHeight: 1.45 }}>
              আপনার সোনামণির বয়স, উচ্চতা ও ওজন মিলিয়ে সঠিক সাইজ নির্বাচন করুন:
            </p>

            <table className="bw-size-table">
              <thead>
                <tr>
                  <th>সাইজ কোড</th>
                  <th>বয়স সীমা</th>
                  <th>বাচ্চার উচ্চতা</th>
                  <th>বাচ্চার ওজন</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>0-3M</b></td>
                  <td>০ থেকে ৩ মাস</td>
                  <td>৫০ - ৬০ সেমি</td>
                  <td>৩.০ - ৫.৫ কেজি</td>
                </tr>
                <tr>
                  <td><b>3-6M</b></td>
                  <td>৩ থেকে ৬ মাস</td>
                  <td>৬০ - ৬৮ সেমি</td>
                  <td>৫.৫ - ৭.৫ কেজি</td>
                </tr>
                <tr>
                  <td><b>6-12M</b></td>
                  <td>৬ থেকে ১২ মাস</td>
                  <td>৬৮ - ৭৬ সেমি</td>
                  <td>৭.৫ - ৯.৫ কেজি</td>
                </tr>
                <tr>
                  <td><b>12-18M</b></td>
                  <td>১২ থেকে ১৮ মাস</td>
                  <td>৭৬ - ৮৪ সেমি</td>
                  <td>৯.৫ - ১১.৫ কেজি</td>
                </tr>
                <tr>
                  <td><b>18-24M</b></td>
                  <td>১৮ থেকে ২৪ মাস</td>
                  <td>৮৪ - ৯০ সেমি</td>
                  <td>১১.৫ - ১৩.০ কেজি</td>
                </tr>
                <tr>
                  <td><b>2-3Y</b></td>
                  <td>২ থেকে ৩ বছর</td>
                  <td>৯০ - ৯৮ সেমি</td>
                  <td>১৩.০ - ১৫.০ কেজি</td>
                </tr>
              </tbody>
            </table>

            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: 12, fontSize: 12, color: '#0369A1', lineHeight: 1.5 }}>
              💡 <b>টিপ:</b> যদি বাবু স্বাস্থ্যবান হয় তবে ১ সাইজ বড় অর্ডার করার পরামর্শ দেওয়া হচ্ছে। সাইজ ছোট বা বড় হলে ৭ দিনের মধ্যে পরিবর্তন সুবিধা রয়েছে।
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsCartOpen(false)}>
          <div className="bw-modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F172A', margin: 0, lineHeight: 1.3 }}>
                🛒 আপনার শপিং ব্যাগ ({cartTotalQty})
              </h3>
              <button className="bw-modal-close" onClick={() => setIsCartOpen(false)}>
                ✕
              </button>
            </div>

            {/* Free Shipping Progress */}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              {cartSubtotal >= storeSettings.freeShipThreshold ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', textAlign: 'center', lineHeight: 1.4 }}>
                  🎉 অভিনন্দন! আপনি <b>ফ্রি ডেলিভারি</b> পেয়েছেন!
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, color: '#0369A1', marginBottom: 6, display: 'flex', justifyContent: 'space-between', lineHeight: 1.4 }}>
                    <span>ফ্রি ডেলিভারির জন্য আর প্রয়োজন:</span>
                    <b>৳{storeSettings.freeShipThreshold - cartSubtotal}</b>
                  </div>
                  <div style={{ background: '#E2E8F0', height: 6, borderRadius: 99, overflow: 'hidden' }}>
                    <div
                      style={{
                        background: 'linear-gradient(90deg, #0284C7, #EC4899)',
                        height: '100%',
                        width: `${Math.min(100, (cartSubtotal / storeSettings.freeShipThreshold) * 100)}%`,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🛍️</div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>আপনার শপিং ব্যাগ খালি!</p>
                <button
                  className="bw-btn bw-btn-pink"
                  style={{ marginTop: 14 }}
                  onClick={() => setIsCartOpen(false)}
                >
                  👶 কেনাকাটা শুরু করুন
                </button>
              </div>
            ) : (
              <div>
                <div style={{ maxHeight: '45vh', overflowY: 'auto', marginBottom: 18 }}>
                  {cart.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 0',
                        borderBottom: '1px solid #E2E8F0',
                        alignItems: 'center',
                      }}
                    >
                      <img
                        src={(item.product.images && item.product.images[0]) || item.product.image || '/uploads/baby-wear-logo.png'}
                        alt={item.product.name}
                        style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 13.5, color: '#0F172A', display: 'block', lineHeight: 1.3 }}>
                          {item.product.name}
                        </b>
                        <span style={{ fontSize: 12, color: '#64748B' }}>
                          সাইজ: {item.size}
                        </span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#BE185D', marginTop: 3 }}>
                          ৳{item.product.price} × {item.qty} = ৳{item.product.price * item.qty}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button
                          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                          onClick={() => updateCartQty(idx, -1)}
                        >
                          -
                        </button>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{item.qty}</span>
                        <button
                          style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                          onClick={() => updateCartQty(idx, 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '2px solid #F1F5F9', paddingTop: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                    <span>সাবটোটাল:</span>
                    <span style={{ color: '#BE185D' }}>৳{cartSubtotal}</span>
                  </div>
                  <span style={{ fontSize: 12, color: '#64748B' }}>* ডেলিভারি চার্জ চেকআউটে যুক্ত হবে</span>
                </div>

                <button
                  className="bw-btn bw-btn-pink"
                  style={{ width: '100%', padding: '14px', fontSize: 16 }}
                  onClick={() => {
                    setIsCartOpen(false);
                    setDirectCheckoutItem(null);
                    setIsCheckoutOpen(true);
                  }}
                >
                  ⚡ ক্যাশ অন ডেলিভারি চেকআউট
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1-Click Fast Checkout Modal with District & Thana Dropdowns */}
      {isCheckoutOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsCheckoutOpen(false)}>
          <div className="bw-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setIsCheckoutOpen(false)}>
              ✕
            </button>

            {orderSuccess ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                <h3 style={{ fontSize: 24, color: '#0F3A66', fontFamily: 'var(--font-display)', marginBottom: 8, lineHeight: 1.3 }}>
                  ধন্যবাদ! আপনার অর্ডারটি নিশ্চিত হয়েছে
                </h3>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 20 }}>
                  অর্ডার আইডি: <b style={{ color: '#0284C7' }}>#{orderSuccess.id}</b> <br />
                  আমাদের প্রতিনিধি শীঘ্রই আপনার সাথে ফোনে যোগাযোগ করে ডেলিভারি নিশ্চিত করবেন।
                </p>

                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: 16, textAlign: 'left', marginBottom: 24 }}>
                  <b style={{ fontSize: 14, color: '#166534', display: 'block', marginBottom: 6 }}>ডেলিভারি বিবরণী:</b>
                  <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.6 }}>
                    <div>গ্রাহকের নাম: <b>{orderSuccess.customer?.name}</b></div>
                    <div>মোবাইল: {orderSuccess.customer?.phone}</div>
                    <div>ঠিকানা: {orderSuccess.customer?.address}</div>
                    <div>মোট বিল: <b>৳{orderSuccess.total}</b> (ক্যাশ অন ডেলিভারি)</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    className="bw-btn bw-btn-blue"
                    style={{ flex: 1 }}
                    onClick={() => {
                      setOrderSuccess(null);
                      setIsCheckoutOpen(false);
                    }}
                  >
                    নতুন কেনাকাটা করুন
                  </button>

                  {whatsappNumber && <button
                    className="bw-btn bw-btn-pink"
                    style={{ flex: 1 }}
                    onClick={() => {
                      window.open(
                        `https://wa.me/${storeSettings.whatsapp}?text=${encodeURIComponent(
                          `আসসালামু আলাইকুম, Baby Wear এ অর্ডার #${orderSuccess.id} করেছি। অনুগ্রহ করে দ্রুত পাঠিয়ে দিন।`
                        )}`,
                        '_blank'
                      );
                    }}
                  >
                    💬 WhatsApp এ আপডেট
                  </button>}
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: 22, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 4, lineHeight: 1.3 }}>
                  🛍️ ক্যাশ অন ডেলিভারি অর্ডার ফরম
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 1.45 }}>
                  পণ্য হাতে পেয়ে মূল্য পরিশোধ করতে নিচের তথ্যগুলো সঠিকভাবে পূরণ করুন:
                </p>

                <form onSubmit={handleSubmitOrder}>
                  <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
                    <label className="bw-form-label">আপনার পূর্ণ নাম *</label>
                    <input
                      className="bw-input"
                      placeholder="যেমন: তানজিলা আহমেদ"
                      required
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                    />

                    <label className="bw-form-label">১১ ডিজিটের মোবাইল নাম্বার *</label>
                    <input
                      className="bw-input"
                      type="tel"
                      placeholder="01XXXXXXXXX"
                      required
                      value={custPhone}
                      onChange={(e) => setCustPhone(e.target.value)}
                    />

                    {/* Searchable District & Thana Dropdowns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <SearchableSelect
                        label="জেলা নির্বাচন করুন"
                        value={custDistrict}
                        options={Object.keys(BD_GEO)}
                        bilingualMap={BD_DISTRICTS_BN}
                        placeholder="জেলা লিখুন বা সার্চ করুন..."
                        required
                        onChange={(d) => {
                          setCustDistrict(d);
                          const thanas = BD_GEO[d] || [];
                          setCustThana(thanas[0] || '');
                          setDeliveryArea(d === 'Dhaka' ? 'inside' : 'outside');
                        }}
                      />

                      <SearchableSelect
                        label="থানা / উপজেলা"
                        value={custThana}
                        options={BD_GEO[custDistrict] || []}
                        placeholder="থানা খুঁজুন..."
                        required
                        disabled={!custDistrict}
                        onChange={(th) => setCustThana(th)}
                      />
                    </div>

                    <label className="bw-form-label">বাসা নং, রোড নং ও বিস্তারিত ঠিকানা *</label>
                    <textarea
                      className="bw-input"
                      rows={2}
                      placeholder="বাসা নং, রোড নং, এলাকা এবং কোনো ল্যান্ডমার্ক"
                      required
                      value={custStreet}
                      onChange={(e) => setCustStreet(e.target.value)}
                    />

                    <label className="bw-form-label">ডেলিভারি এরিয়া ও চার্জ *</label>
                    <div className="bw-radio-group">
                      <div
                        className={`bw-radio-card ${deliveryArea === 'inside' ? 'active' : ''}`}
                        onClick={() => setDeliveryArea('inside')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span>ঢাকা সিটির ভেতরে</span>
                          <span style={{ color: '#0284C7' }}>{isFreeDelivery ? 'ফ্রি' : `৳${storeSettings.deliveryInside}`}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748B' }}>২৪-৪৮ ঘণ্টায় হোম ডেলিভারি</span>
                      </div>

                      <div
                        className={`bw-radio-card ${deliveryArea === 'outside' ? 'active' : ''}`}
                        onClick={() => setDeliveryArea('outside')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span>ঢাকা সিটির বাইরে</span>
                          <span style={{ color: '#0284C7' }}>{isFreeDelivery ? 'ফ্রি' : `৳${storeSettings.deliveryOutside}`}</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748B' }}>২-৩ দিনে হোম ডেলিভারি</span>
                      </div>
                    </div>

                    {/* Coupon */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        className="bw-input"
                        style={{ marginBottom: 0 }}
                        placeholder="কুপন কোড দিন (যেমন: BABYFIRST)"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                      />
                      <button
                        type="button"
                        className="bw-btn bw-btn-blue"
                        style={{ padding: '0 18px', whiteSpace: 'nowrap' }}
                        onClick={handleApplyCoupon}
                      >
                        প্রয়োগ
                      </button>
                    </div>
                    {couponErr && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 8 }}>{couponErr}</div>}
                    {appliedCoupon && (
                      <div style={{ fontSize: 12, color: '#16A34A', fontWeight: 700, marginBottom: 8 }}>
                        ✓ {appliedCoupon.code} প্রযোজ্য হয়েছে (৳{appliedCoupon.discount} ছাড়)
                      </div>
                    )}
                  </div>

                  {/* Order Bill Summary */}
                  <div style={{ background: '#F0F9FF', border: '1.5px solid #BAE6FD', borderRadius: 14, padding: 16, marginTop: 16 }}>
                    <b style={{ fontSize: 14, color: '#0F3A66', display: 'block', marginBottom: 10 }}>অর্ডার সামারি:</b>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>পণ্য সংখ্যা:</span>
                      <b>{checkoutItems.reduce((s, i) => s + i.qty, 0)} টি</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>পণ্যের মোট মূল্য:</span>
                      <b>৳{checkoutItemsTotal}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>ডেলিভারি চার্জ ({deliveryArea === 'inside' ? 'ঢাকা' : 'ঢাকার বাইরে'}):</span>
                      <b>{isFreeDelivery ? 'ফ্রি (৳০)' : `৳${deliveryFee}`}</b>
                    </div>
                    {discountAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#16A34A', marginBottom: 4 }}>
                        <span>কুপন ছাড়:</span>
                        <b>-৳{discountAmount}</b>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#BE185D', borderTop: '1px dashed #BAE6FD', paddingTop: 8, marginTop: 8 }}>
                      <span>সর্বমোট পরিশোধযোগ্য বিল:</span>
                      <span>৳{grandTotal}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="bw-btn bw-btn-pink"
                    style={{ width: '100%', padding: '16px', fontSize: 17, marginTop: 16 }}
                  >
                    {submittingOrder ? 'অর্ডার প্রসেস হচ্ছে…' : `✓ ৳${grandTotal} - ক্যাশ অন ডেলিভারিতে অর্ডার করুন`}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Order Tracker Modal */}
      {showTrackModal && (
        <div className="bw-modal-backdrop" onClick={() => setShowTrackModal(false)}>
          <div className="bw-modal-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setShowTrackModal(false)}>
              ✕
            </button>

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 6, lineHeight: 1.3 }}>
              📦 আপনার অর্ডার লাইভ ট্র্যাক করুন
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16, lineHeight: 1.45 }}>
              অর্ডার করার সময় ব্যবহৃত ১১ ডিজিটের মোবাইল নাম্বার অথবা অর্ডার আইডি দিন:
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="bw-input"
                style={{ marginBottom: 0 }}
                placeholder="01XXXXXXXXX বা অর্ডার আইডি"
                value={trackQuery}
                onChange={(e) => setTrackQuery(e.target.value)}
              />
              <button
                className="bw-btn bw-btn-blue"
                style={{ whiteSpace: 'nowrap' }}
                disabled={trackLoading}
                onClick={handleTrackOrder}
              >
                {trackLoading ? 'খোঁজা হচ্ছে…' : 'ট্র্যাক'}
              </button>
            </div>

            {trackResult && (
              <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 18 }}>
                {trackResult.notFound ? (
                  <p style={{ fontSize: 13, color: '#EF4444', margin: 0, textAlign: 'center' }}>
                    কোনো অর্ডার পাওয়া যায়নি। সঠিক মোবাইল নাম্বার বা আইডি দিয়ে পুনরায় চেষ্টা করুন।
                  </p>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <b style={{ fontSize: 15, color: '#0F172A' }}>অর্ডার #{trackResult.id}</b>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 99,
                          background: trackResult.status === 'delivered' ? '#DCFCE7' : '#E0F2FE',
                          color: trackResult.status === 'delivered' ? '#166534' : '#0369A1',
                        }}
                      >
                        {trackResult.status === 'delivered'
                          ? 'ডেলিভার্ড'
                          : trackResult.status === 'shipped'
                          ? 'শিপড / কুরিয়ারে আছে'
                          : 'কনফার্মড'}
                      </span>
                    </div>

                    {/* Visual Stepper */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 0 16px', position: 'relative' }}>
                      {['অর্ডার গৃহীত', 'প্যাকিং সম্পন্ন', 'কুরিয়ারে হস্তান্তর', 'ডেলিভার্ড'].map((st, i) => {
                        const isDone =
                          (trackResult.status === 'delivered') ||
                          (trackResult.status === 'shipped' && i <= 2) ||
                          (trackResult.status === 'confirmed' && i <= 1) ||
                          (i === 0);
                        return (
                          <div key={i} style={{ textAlign: 'center', flex: 1, position: 'relative', zIndex: 2 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: isDone ? '#0284C7' : '#E2E8F0',
                                color: '#FFFFFF',
                                fontSize: 12,
                                fontWeight: 800,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                margin: '0 auto 6px',
                              }}
                            >
                              {isDone ? '✓' : i + 1}
                            </div>
                            <span style={{ fontSize: 10.5, color: isDone ? '#0F172A' : '#94A3B8', fontWeight: isDone ? 700 : 500 }}>
                              {st}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, borderTop: '1px solid #E2E8F0', paddingTop: 10 }}>
                      <div>গ্রাহক: <b>{trackResult.customer?.name}</b></div>
                      <div>ঠিকানা: {trackResult.customer?.address}</div>
                      <div>মোট বিল: <b>৳{trackResult.total}</b> (ক্যাশ অন ডেলিভারি)</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      {showSection('footer') && <footer className="bw-footer">
        <div className="bw-footer-inner">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <img
                src={storeSettings.logo}
                alt="Baby Wear"
                style={{ width: 48, height: 48, borderRadius: '50%', background: '#FFF' }}
              />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800 }}>
                <span style={{ color: '#38BDF8' }}>Baby </span>
                <span style={{ color: '#EC4899' }}>Wear</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.65, maxWidth: 320 }}>
              আপনার সোনামণির জন্য সবচেয়ে নিরাপদ, আরামদায়ক ও ট্রেন্ডি বেবি পোশাকের নির্ভরযোগ্য ব্র্যান্ড। ১০০% অর্গানিক কম্বড কটন।
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: 15, color: '#F8FAFC', marginBottom: 14 }}>কুইক লিংক</h4>
            <ul style={{ listStyle: 'none', fontSize: 13, color: '#94A3B8', lineHeight: 2 }}>
              {categories.slice(0, 6).map((c) => (
                <li key={c.id}>
                  <a
                    href="#shop"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                    onClick={(event) => {
                      event.preventDefault();
                      setActiveCategory(c.id);
                      const el = document.getElementById(`cat-${c.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                      else window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    {c.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: 15, color: '#F8FAFC', marginBottom: 14 }}>গ্রাহক সুবিধা</h4>
            <ul style={{ listStyle: 'none', fontSize: 13, color: '#94A3B8', lineHeight: 2 }}>
              <li>
                <span style={{ cursor: 'pointer' }} onClick={() => setIsSizeGuideOpen(true)}>
                  📏 সাইজ গাইড চার্ট
                </span>
              </li>
              <li>
                <span style={{ cursor: 'pointer' }} onClick={() => setShowTrackModal(true)}>
                  📦 অর্ডার লাইভ ট্র্যাকিং
                </span>
              </li>
              <li>
                <span style={{ cursor: 'pointer' }} onClick={() => setIsReviewModalOpen(true)}>
                  ✍️ কাস্টমার রিভিউ দিন
                </span>
              </li>
              <li>🔄 ৭ দিনের সাইজ এক্সচেঞ্জ</li>
              <li>🚚 ক্যাশ অন ডেলিভারি পলিসি</li>
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: 15, color: '#F8FAFC', marginBottom: 14 }}>কাস্টমার সাপোর্ট</h4>
            <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 2 }}>
              {hotline && <div>
                📞 হটলাইন:{' '}
                <a href={`tel:${hotline}`} style={{ color: '#38BDF8', textDecoration: 'none' }}>
                  {hotline}
                </a>
              </div>}
              {whatsappLink && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <WhatsAppIcon size={16} variant="official" />
                <span>হোয়াটসঅ্যাপ:</span>{' '}
                <a href={whatsappLink} target="_blank" rel="noreferrer" style={{ color: '#22C55E', textDecoration: 'none' }}>
                  {hotline || whatsappNumber}
                </a>
              </div>}
              {!hotline && !whatsappLink && <div>সাপোর্টের যোগাযোগ নম্বর শিগগির যোগ করা হবে।</div>}
            </div>
          </div>
        </div>

        <div className="bw-footer-bottom">
          <div>© {new Date().getFullYear()} Baby Wear Bangladesh. সর্বস্বত্ব সংরক্ষিত।</div>
          <div className="bw-footer-dev-credits">
            <div className="bw-dev-line">
              Developed by{' '}
              <a href="https://shakil.metrroma.com" target="_blank" rel="noopener noreferrer">
                Shakil
              </a>
            </div>
            <div className="bw-dev-line">
              Powered by{' '}
              <a href="https://metrroma.com" target="_blank" rel="noopener noreferrer">
                MetroMa
              </a>
            </div>
          </div>
        </div>
      </footer>}
    </div>
  );
}
export default App;
