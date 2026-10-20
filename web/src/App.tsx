import React, { useState, useEffect, useMemo, useRef } from 'react';

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
  stock: number;
  featured?: boolean;
  badge?: string;
  fabric?: string;
  care?: string;
  rating?: number;
  ratingCount?: number;
  image?: string;
  images: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  desc?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  blurb?: string;
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
  const [reviewsAvg, setReviewsAvg] = useState(4.9);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  // Store Settings
  const [storeSettings, setStoreSettings] = useState<any>({
    storeName: 'Baby Wear',
    hotline: '01633-617136',
    whatsapp: '8801633617136',
    freeShipThreshold: 2000,
    deliveryInside: 70,
    deliveryOutside: 130,
  });

  // Modals & Drawers
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

  // Form Fields
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
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
        const [catRes, setRes] = await Promise.all([
          fetch('/api/catalog').then((r) => r.json()),
          fetch('/api/settings').then((r) => r.json()).catch(() => ({})),
        ]);

        if (catRes && catRes.products) {
          setProducts(catRes.products);
          setCategories(catRes.categories || []);

          // Initialize default sizes
          const initSizes: Record<string, string> = {};
          catRes.products.forEach((p: Product) => {
            if (p.sizes && p.sizes.length > 0) {
              initSizes[p.id] = p.sizes[0];
            }
          });
          setSelectedSizes(initSizes);
        }

        if (setRes && setRes.storeName) {
          setStoreSettings({
            storeName: setRes.storeName || 'Baby Wear',
            hotline: setRes.phone || '01633-617136',
            whatsapp: setRes.whatsapp || '8801633617136',
            freeShipThreshold: setRes.freeShipThreshold || 2000,
            deliveryInside: setRes.deliveryInside || 70,
            deliveryOutside: setRes.deliveryOutside || 130,
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
    const sizeToUse = customSize || selectedSizes[product.id] || product.sizes[0] || 'Standard';
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
    const sizeToUse = customSize || selectedSizes[product.id] || product.sizes[0] || 'Standard';
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

  const isFreeDelivery = checkoutItemsTotal >= (storeSettings.freeShipThreshold || 2000);
  const deliveryFee = isFreeDelivery
    ? 0
    : deliveryArea === 'inside'
    ? storeSettings.deliveryInside || 70
    : storeSettings.deliveryOutside || 130;

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
    if (!custAddress.trim()) {
      alert('অনুগ্রহ করে আপনার পূর্ণাঙ্গ ঠিকানা ও জেলা উল্লেখ করুন');
      return;
    }

    setSubmittingOrder(true);
    const orderPayload = {
      customer: {
        name: custName.trim(),
        phone: cleanPh,
        address: custAddress.trim(),
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
        image: i.product.images[0] || i.product.image,
      })),
      itemsTotal: checkoutItemsTotal,
      delivery: deliveryFee,
      discount: discountAmount,
      coupon: appliedCoupon?.code || '',
      total: grandTotal,
      payment: 'cash_on_delivery',
      source: 'web_storefront',
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
      const res = await fetch(`/api/orders/track?q=${encodeURIComponent(trackQuery.trim())}`).then((r) => r.json());
      if (res && res.length) {
        setTrackResult(res[0]);
      } else if (res && res.id) {
        setTrackResult(res);
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
        showToast('🎉 ধন্যবাদ! আপনার মূল্যবান রিভিউটি সফলভাবে যুক্ত হয়েছে।');
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

  const whatsappLink = `https://wa.me/${storeSettings.whatsapp}?text=${encodeURIComponent(
    'আসসালামু আলাইকুম, Baby Wear থেকে কিছু পোশাক সম্পর্কে জানতে চাচ্ছি।'
  )}`;

  // Product Card Renderer Component
  const renderProductCard = (p: Product) => {
    const curSize = selectedSizes[p.id] || (p.sizes && p.sizes[0]) || 'Standard';
    const discountPct = p.originalPrice > p.price ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
    const savings = p.originalPrice > p.price ? p.originalPrice - p.price : 0;

    return (
      <div key={p.id} className="bw-card">
        {/* Media */}
        <div
          className="bw-card-media"
          onClick={() => {
            setQuickViewProduct(p);
            setQuickViewActiveImg(p.images[0] || p.image || '');
          }}
        >
          {p.badge && <span className="bw-card-badge">{p.badge}</span>}
          {discountPct > 0 && <span className="bw-card-discount">-{discountPct}% OFF</span>}

          <img
            src={p.images[0] || p.image}
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
            onClick={() => {
              setQuickViewProduct(p);
              setQuickViewActiveImg(p.images[0] || p.image || '');
            }}
          >
            {p.name}
          </h3>

          {/* Rating */}
          <div className="bw-card-meta-row">
            <span className="bw-card-stars">⭐ {p.rating || 4.9}</span>
            <span>({p.ratingCount || 50}+ রিভিউ)</span>
          </div>

          {/* Size Selector */}
          {p.sizes && p.sizes.length > 0 && (
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
                {p.sizes.map((s) => (
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
            {p.originalPrice > p.price && (
              <span className="bw-price-old">৳{p.originalPrice}</span>
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
          👶 ১০০% অর্গানিক নরম সুতি ফেব্রিক · সংবেদনশীল ত্বকে শতভাগ নিরাপদ · ফ্রি ডেলিভারি ৳২,০০০+ অর্ডারে
        </div>
        <a href={`tel:${storeSettings.hotline}`} className="bw-topbar-hotline">
          📞 হটলাইন: {storeSettings.hotline}
        </a>
      </div>

      {/* Main Header */}
      <header className="bw-header">
        <div className="bw-header-inner">
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
              <img src="/uploads/baby-wear-logo.png" alt="Baby Wear Logo" />
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
            <a href={`tel:${storeSettings.hotline}`} className="bw-action-pill">
              📞 {storeSettings.hotline}
            </a>

            <a href={whatsappLink} target="_blank" rel="noreferrer" className="bw-action-pill bw-action-wa">
              💬 WhatsApp
            </a>

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
      </header>

      {/* Hero Showcase Section */}
      <section className="bw-hero">
        <div className="bw-hero-card">
          <div>
            <div className="bw-hero-pill">
              🧸 আপনার সোনামণির কোমল ত্বকের জন্য সেরা পছন্দ
            </div>
            <h1 className="bw-hero-title">
              সবচেয়ে নরম ও আরামদায়ক <br />
              <span>বেবি পোশাকের রাজকীয় কালেকশন</span>
            </h1>
            <p className="bw-hero-desc">
              ১০০% পিওর ব্রিদেবল কম্বড সুতি কাপড়ে তৈরি। বাচ্চার কোমল সংবেদনশীল ত্বকে দেবে চুলকানি ও অ্যালার্জি মুক্ত পরম স্বস্তি।
            </p>

            <div className="bw-hero-cta-group">
              <a
                href="#catalog"
                className="bw-btn bw-btn-pink"
                onClick={(e) => {
                  e.preventDefault();
                  setActiveCategory('all');
                  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                👶 সম্পূর্ণ কালেকশন দেখুন
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
            <img
              src="https://images.unsplash.com/photo-1519689680058-324335c77eba?auto=format&fit=crop&w=900&q=85"
              alt="Baby Wear Luxury Collection"
              className="bw-hero-img"
            />
            <div className="bw-hero-floating-badge">
              <span style={{ fontSize: 24 }}>⭐</span>
              <div>
                <b style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>৪.৯/৫ স্টার রেটিং</b>
                <span style={{ fontSize: 11.5, color: '#64748B' }}>১২,৫০০+ সন্তুষ্ট মা-বাবা সারাদেশে</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Features Bar */}
      <section className="bw-features-bar">
        <div className="bw-feature-item">
          <div className="bw-feature-icon">🌿</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>১০০% অর্গানিক কম্বড সুতি</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>নিকেল-ফ্রি স্ন্যাপ বাটন, ত্বক থাকবে র‍্যাশমুক্ত</span>
          </div>
        </div>

        <div className="bw-feature-item bw-feature-pink">
          <div className="bw-feature-icon">🚚</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>ক্যাশ অন ডেলিভারি</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>পণ্য হাতে পেয়ে চেক করে মূল্য পরিশোধের সুবিধা</span>
          </div>
        </div>

        <div className="bw-feature-item">
          <div className="bw-feature-icon">🔄</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>৭ দিনে সহজ সাইজ এক্সচেঞ্জ</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>সাইজ ছোট বা বড় হলে দ্রুত পরিবর্তন গ্যারান্টি</span>
          </div>
        </div>

        <div className="bw-feature-item bw-feature-pink">
          <div className="bw-feature-icon">💬</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>প্যারেন্টস হেল্পলাইন</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>হোয়াটসঅ্যাপ বা কলে তাৎক্ষণিক পরামর্শ সেবা</span>
          </div>
        </div>
      </section>

      {/* Category Stories Navigation */}
      <section className="bw-category-stories">
        <div className="bw-category-scroll">
          <div
            className={`bw-story-card ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            <div className="bw-story-avatar">🌟</div>
            <span className="bw-story-title">সব কালেকশন</span>
          </div>

          {categories.map((c) => {
            const icon = getCatIcon(c.slug || c.id);
            return (
              <div
                key={c.id}
                className={`bw-story-card ${activeCategory === c.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(c.id);
                  const el = document.getElementById(`cat-${c.id}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <div className="bw-story-avatar">{icon}</div>
                <span className="bw-story-title">{c.name.split('(')[0].trim()}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Catalog Title */}
      <section id="catalog" className="bw-cat-section">
        <div className="bw-section-header">
          <h2 className="bw-section-title">
            <span style={{ color: '#0284C7' }}>আমাদের স্পেশাল </span>
            <span style={{ color: '#EC4899' }}>বেবি ওয়্যার কালেকশন</span>
          </h2>
          <p className="bw-section-subtitle">
            বয়স, সাইজ ও ফেব্রিক অনুযায়ী সাজানো আমাদের প্রতিটি ক্যাটাগরি এক্সপ্লোর করুন
          </p>
        </div>
      </section>

      {/* HOMEPAGE ORGANIZED CATEGORY-BY-CATEGORY */}
      {loading ? (
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
            const catObj = categories.find((c) => c.id === activeCategory);
            const catProds = products.filter((p) => p.category === activeCategory);
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
      ) : (
        /* Default: Categorized Homepage Shelf Display */
        <div>
          {categories.map((cat) => {
            const catProds = products.filter((p) => p.category === cat.id || p.category === cat.slug);
            if (catProds.length === 0) return null;
            const catIcon = getCatIcon(cat.slug || cat.id);

            return (
              <section key={cat.id} id={`cat-${cat.id}`} className="bw-cat-block">
                <div className="bw-cat-block-header">
                  <div className="bw-cat-block-title-box">
                    <div className="bw-cat-block-icon">{catIcon}</div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <h3 className="bw-cat-block-title">{cat.name}</h3>
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
                  {catProds.map(renderProductCard)}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* REAL PARENT FEEDBACK & UPLOAD SECTION */}
      <section className="bw-reviews-container">
        <div className="bw-reviews-header-row">
          <div>
            <h2 className="bw-section-title" style={{ textAlign: 'left', marginBottom: 4 }}>
              <span style={{ color: '#EC4899' }}>রিয়েল প্যারেন্টস </span>
              <span style={{ color: '#0284C7' }}>ফিডব্যাক ও অভিজ্ঞতা</span>
            </h2>
            <p className="bw-section-subtitle" style={{ textAlign: 'left' }}>
              আমাদের গ্রাহকদের আসল অভিজ্ঞতা ও ছবি · রেটিং: <b>⭐ {reviewsAvg}/৫</b> ({reviews.length}+ রিভিউ)
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
      </section>

      {/* Floating WhatsApp Button */}
      <div
        className="bw-floating-wa"
        onClick={() => window.open(whatsappLink, '_blank')}
        title="Chat on WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
          <path d="M12.031 2C6.494 2 2 6.494 2 12.031c0 1.956.564 3.782 1.54 5.336L2 22l4.786-1.503a9.98 9.98 0 0 0 5.245 1.488h.005c5.536 0 10.03-4.494 10.03-10.031C22.066 6.494 17.568 2 12.031 2zm5.834 14.195c-.244.686-1.22 1.258-1.745 1.336-.505.075-1.164.107-1.879-.122-1.928-.616-3.153-2.585-3.249-2.713-.095-.128-.781-1.042-.781-1.987 0-.946.495-1.411.671-1.603.176-.192.385-.24.514-.24.129 0 .258.002.371.008.119.006.278-.045.435.333.162.388.552 1.345.601 1.442.049.097.081.21.016.338-.065.129-.097.21-.193.322-.097.113-.203.253-.29.339-.097.097-.198.203-.085.397.113.194.502.828 1.077 1.341.741.661 1.365.866 1.559.963.194.097.307.081.42-.049.113-.129.484-.564.613-.758.129-.194.258-.161.435-.097.177.065 1.129.532 1.323.629.194.097.322.145.371.226.048.08.048.468-.196 1.154z" />
        </svg>
      </div>

      {/* Sticky Mobile Bar */}
      <div className="bw-mobile-bar">
        <a
          href={`tel:${storeSettings.hotline}`}
          className="bw-btn bw-btn-outline"
          style={{ flex: 1, padding: '10px 8px', fontSize: 13 }}
        >
          📞 কল দিন
        </a>

        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          className="bw-btn bw-btn-outline"
          style={{ flex: 1, padding: '10px 8px', fontSize: 13, color: '#16A34A' }}
        >
          💬 WhatsApp
        </a>

        <button
          className="bw-btn bw-btn-pink"
          style={{ flex: 1.3, padding: '10px 10px', fontSize: 13 }}
          onClick={() => {
            if (cart.length > 0) {
              setDirectCheckoutItem(null);
              setIsCheckoutOpen(true);
            } else {
              document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
            }
          }}
        >
          ⚡ অর্ডার করুন {cartTotalQty > 0 ? `(${cartTotalQty})` : ''}
        </button>
      </div>

      {/* Write a Review Modal */}
      {isReviewModalOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsReviewModalOpen(false)}>
          <div className="bw-modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setIsReviewModalOpen(false)}>
              ✕
            </button>

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 4 }}>
              ✍️ আপনার অভিজ্ঞতা ও রিভিউ শেয়ার করুন
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 18 }}>
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
                  src={quickViewActiveImg || quickViewProduct.images[0] || quickViewProduct.image}
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
                <h3 style={{ fontSize: 18, color: '#0F172A', fontWeight: 800, marginTop: 6, marginBottom: 8 }}>
                  {quickViewProduct.name}
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, marginBottom: 14 }}>
                  {quickViewProduct.desc}
                </p>

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#BE185D' }}>
                    ৳{quickViewProduct.price}
                  </span>
                  {quickViewProduct.originalPrice > quickViewProduct.price && (
                    <span style={{ fontSize: 14, color: '#94A3B8', textDecoration: 'line-through' }}>
                      ৳{quickViewProduct.originalPrice}
                    </span>
                  )}
                </div>

                {quickViewProduct.sizes && (
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
                      {quickViewProduct.sizes.map((s) => (
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
                      const curS = selectedSizes[quickViewProduct.id] || quickViewProduct.sizes[0];
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
                      const curS = selectedSizes[quickViewProduct.id] || quickViewProduct.sizes[0];
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

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 6 }}>
              📏 বেবি ওয়্যার স্ট্যান্ডার্ড সাইজ গাইড
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>
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

            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: 12, fontSize: 12, color: '#0369A1' }}>
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
              <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F172A', margin: 0 }}>
                🛒 আপনার শপিং ব্যাগ ({cartTotalQty})
              </h3>
              <button className="bw-modal-close" onClick={() => setIsCartOpen(false)}>
                ✕
              </button>
            </div>

            {/* Free Shipping Progress */}
            <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: 12, marginBottom: 16 }}>
              {cartSubtotal >= storeSettings.freeShipThreshold ? (
                <div style={{ fontSize: 13, fontWeight: 700, color: '#16A34A', textAlign: 'center' }}>
                  🎉 অভিনন্দন! আপনি <b>ফ্রি ডেলিভারি</b> পেয়েছেন!
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12.5, color: '#0369A1', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
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
                        src={item.product.images[0] || item.product.image}
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

      {/* 1-Click Fast Checkout Modal */}
      {isCheckoutOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsCheckoutOpen(false)}>
          <div className="bw-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setIsCheckoutOpen(false)}>
              ✕
            </button>

            {orderSuccess ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                <h3 style={{ fontSize: 24, color: '#0F3A66', fontFamily: 'var(--font-display)', marginBottom: 8 }}>
                  ধন্যবাদ! আপনার অর্ডারটি নিশ্চিত হয়েছে
                </h3>
                <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 20 }}>
                  অর্ডার আইডি: <b style={{ color: '#0284C7' }}>#{orderSuccess.id}</b> <br />
                  আমাদের প্রতিনিধি শীঘ্রই আপনার সাথে ফোনে যোগাযোগ করে ডেলিভারি নিশ্চিত করবেন।
                </p>

                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 14, padding: 16, textAlign: 'left', marginBottom: 24 }}>
                  <b style={{ fontSize: 14, color: '#166534', display: 'block', marginBottom: 6 }}>ডেলিভারি বিবরণী:</b>
                  <div style={{ fontSize: 13, color: '#1F2937', lineHeight: 1.6 }}>
                    <div>গ্রাহকের নাম: {orderSuccess.customer?.name}</div>
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

                  <button
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
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: 22, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 4 }}>
                  🛍️ ক্যাশ অন ডেলিভারি অর্ডার ফরম
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
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

                    <label className="bw-form-label">সম্পূর্ণ ডেলিভারি ঠিকানা (বাসা/রোড/থানা/জেলা) *</label>
                    <textarea
                      className="bw-input"
                      rows={2}
                      placeholder="বাসা নং, রোড নং, এলাকা এবং জেলা উল্লেখ করুন"
                      required
                      value={custAddress}
                      onChange={(e) => setCustAddress(e.target.value)}
                    />

                    <label className="bw-form-label">ডেলিভারি এরিয়া নির্বাচন করুন *</label>
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
                      <span>ডেলিভারি চার্জ:</span>
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

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 6 }}>
              📦 আপনার অর্ডার লাইভ ট্র্যাক করুন
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
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
      <footer className="bw-footer">
        <div className="bw-footer-inner">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <img
                src="/uploads/baby-wear-logo.png"
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
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <a
                    href={`#cat-${c.id}`}
                    style={{ color: 'inherit', textDecoration: 'none' }}
                    onClick={() => {
                      setActiveCategory('all');
                      const el = document.getElementById(`cat-${c.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
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
              <div>
                📞 হটলাইন:{' '}
                <a href={`tel:${storeSettings.hotline}`} style={{ color: '#38BDF8', textDecoration: 'none' }}>
                  {storeSettings.hotline}
                </a>
              </div>
              <div>
                💬 হোয়াটসঅ্যাপ:{' '}
                <a href={whatsappLink} target="_blank" rel="noreferrer" style={{ color: '#22C55E', textDecoration: 'none' }}>
                  {storeSettings.hotline}
                </a>
              </div>
              <div>✉️ ইমেইল: support@babywear.com.bd</div>
              <div>🕒 কাস্টমার সার্ভিস: সকাল ৯টা - রাত ১১টা</div>
            </div>
          </div>
        </div>

        <div className="bw-footer-bottom">
          <div>© {new Date().getFullYear()} Baby Wear Bangladesh. সর্বস্বত্ব সংরক্ষিত।</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ color: '#64748B' }}>🔒 নিরাপদ পেমেন্ট ও ১০০% ক্যাশ অন ডেলিভারি</span>
            <a href="/wp-admin" style={{ color: '#64748B', textDecoration: 'none', fontSize: 12 }}>
              Admin Panel
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default App;
