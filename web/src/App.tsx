import React, { useState, useEffect, useMemo } from 'react';
import './styles.css';

// Type definitions
interface Product {
  id: string;
  slug: string;
  name: string;
  title: string;
  subtitle: string;
  category: string;
  price: number;
  originalPrice: number;
  stock: number;
  featured: boolean;
  badge?: string;
  images: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  desc: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CartItem {
  product: Product;
  size: string;
  color: string;
  qty: number;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Cart & Modals
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('bw_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');

  // Checkout modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [directCheckoutItem, setDirectCheckoutItem] = useState<CartItem | null>(null);
  
  // Checkout Form State
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [deliveryArea, setDeliveryArea] = useState<'inside' | 'outside'>('inside');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponErr, setCouponErr] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);

  // Tracking modal
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [trackQuery, setTrackQuery] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackLoading, setTrackLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  // Sync cart to localStorage
  useEffect(() => {
    localStorage.setItem('bw_cart', JSON.stringify(cart));
  }, [cart]);

  // Load products from API
  useEffect(() => {
    fetch('/api/products')
      .then((r) => r.json())
      .then((data) => {
        if (data.products && Array.isArray(data.products)) {
          setProducts(data.products);
          setCategories(data.categories || []);
        } else if (Array.isArray(data)) {
          setProducts(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('API error, using local fallback:', err);
        setLoading(false);
      });
  }, []);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCategory === 'all' || p.category === activeCategory;
      const matchSearch =
        !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.desc.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  // Cart operations
  const addToCart = (product: Product, size?: string, color?: string, qty = 1) => {
    const chosenSize = size || product.sizes[0] || 'Standard';
    const chosenColor = color || (product.colors[0]?.name ?? 'Default');

    setCart((prev) => {
      const idx = prev.findIndex(
        (item) => item.product.id === product.id && item.size === chosenSize && item.color === chosenColor
      );
      if (idx > -1) {
        const next = [...prev];
        next[idx].qty += qty;
        return next;
      }
      return [...prev, { product, size: chosenSize, color: chosenColor, qty }];
    });
    showToast(`🛒 "${product.name}" কার্টে যোগ হয়েছে!`);
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = next[idx].qty + delta;
      if (newQty <= 0) {
        next.splice(idx, 1);
      } else {
        next[idx].qty = newQty;
      }
      return next;
    });
  };

  const cartTotalQty = useMemo(() => cart.reduce((sum, i) => sum + i.qty, 0), [cart]);
  const cartSubtotal = useMemo(() => cart.reduce((sum, i) => sum + i.product.price * i.qty, 0), [cart]);

  // Open Direct Buy Modal for single item
  const openDirectBuy = (product: Product) => {
    const item: CartItem = {
      product,
      size: product.sizes[0] || 'Standard',
      color: product.colors[0]?.name || 'Default',
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
  const deliveryFee = deliveryArea === 'inside' ? 70 : 130;
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
        setCouponErr('এই কুপনটির জন্য সর্বনিম্ন ১০০০ টাকার অর্ডার প্রয়োজন');
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
      alert('অনুগ্রহ করে সঠিক ১১ ডিজিটের মোবাইল নাম্বার দিন');
      return;
    }
    if (!custAddress.trim()) {
      alert('অনুগ্রহ করে আপনার পূর্ণাঙ্গ ঠিকানা ও জেলা লিখুন');
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
        image: i.product.images[0],
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
      alert('নেটওয়ার্ক ত্রুটি: ' + (err.message || 'Error'));
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            color: '#FFF',
            padding: '12px 24px',
            borderRadius: 99,
            fontSize: 14,
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {toast}
        </div>
      )}

      {/* Top Bar Announcement */}
      <div className="bw-topbar">
        👶 ১০০% অর্গানিক নরম সুতি ফেব্রিক · সারাদেশে ক্যাশ অন ডেলিভারি · ফ্রি ডেলিভারি ৳২০০০+ অর্ডারে · হটলাইন: <b>01700-000000</b>
      </div>

      {/* Header */}
      <header className="bw-header">
        <div className="bw-header-inner">
          {/* Logo & Brand matching uploaded picture */}
          <a href="/" className="bw-logo-container" onClick={(e) => { e.preventDefault(); setActiveCategory('all'); setSearchQuery(''); }}>
            <div className="bw-logo-badge">
              <img src="/uploads/baby-wear-logo.png" alt="Baby Wear Logo" />
            </div>
            <div className="bw-brand-text">
              <div className="bw-brand-title">
                <span className="bw-brand-baby">Baby</span>
                <span className="bw-brand-wear">Wear</span>
              </div>
              <span className="bw-brand-tagline">PREMIUM BABY CLOTHING</span>
            </div>
          </a>

          {/* Search bar */}
          <div className="bw-search-wrapper">
            <span className="bw-search-icon">🔍</span>
            <input
              type="text"
              className="bw-search-input"
              placeholder="বেবি রম্পার, ফ্রক, নিউবর্ন সেট বা সাইজ খুঁজুন..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Actions: Track & Cart */}
          <div className="bw-actions">
            <button
              className="bw-btn bw-btn-outline"
              style={{ padding: '8px 16px', fontSize: 13 }}
              onClick={() => setShowTrackModal(true)}
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

      {/* Hero Banner Section */}
      <section className="bw-hero">
        <div className="bw-hero-card">
          <div>
            <div className="bw-hero-pill">
              🧸 আপনার সোনামণির প্রথম পছন্দ
            </div>
            <h1 className="bw-hero-title">
              সবচেয়ে নরম ও আরামদায়ক <br />
              <span>বেবি ওয়্যার কালেকশন</span>
            </h1>
            <p className="bw-hero-desc">
              ১০০% পিওর ব্রিদেবল সুতি কাপড়ে তৈরি। বাচ্চার কোমল সংবেদনশীল ত্বকে দিবে মা'য়ের হাতের মতো স্নিগ্ধ আরাম ও স্বস্তি।
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <a
                href="#catalog"
                className="bw-btn bw-btn-pink"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                👶 কালেকশন দেখুন
              </a>
              <button
                className="bw-btn bw-btn-blue"
                onClick={() => {
                  setActiveCategory('cat_newborn');
                  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                🎁 নিউবর্ন গিফট সেট
              </button>
            </div>
          </div>

          <div className="bw-hero-image-box">
            <img
              src="https://images.unsplash.com/photo-1522771930-78848d9293e8?auto=format&fit=crop&w=800&q=80"
              alt="Baby Wear Collection"
              className="bw-hero-img"
            />
            <div className="bw-hero-floating-badge">
              <span style={{ fontSize: 24 }}>⭐</span>
              <div>
                <b style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>৪.৯/৫ স্টার রেটিং</b>
                <span style={{ fontSize: 11, color: '#64748B' }}>৫,০০০+ হ্যাপি প্যারেন্টস</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bar */}
      <section className="bw-features-bar">
        <div className="bw-feature-item">
          <div className="bw-feature-icon">🌿</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>১০০% অর্গানিক সুতি</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>বাচ্চার কোমল ত্বকে চুলকানি বা র‍্যাশ মুক্ত</span>
          </div>
        </div>
        <div className="bw-feature-item bw-feature-pink">
          <div className="bw-feature-icon">🚚</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>সারাদেশে ক্যাশ অন ডেলিভারি</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>পণ্য হাতে পেয়ে চেক করে মূল্য পরিশোধ</span>
          </div>
        </div>
        <div className="bw-feature-item">
          <div className="bw-feature-icon">🔄</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>সহজ সাইজ এক্সচেঞ্জ</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>সাইজ ছোট বা বড় হলে দ্রুত পরিবর্তন সুবিধা</span>
          </div>
        </div>
        <div className="bw-feature-item bw-feature-pink">
          <div className="bw-feature-icon">💬</div>
          <div>
            <b style={{ fontSize: 14, color: '#0F172A', display: 'block' }}>২৪/৭ কাস্টমার সাপোর্ট</b>
            <span style={{ fontSize: 12, color: '#64748B' }}>হোয়াটসঅ্যাপ বা কলে তাৎক্ষণিক পরামর্শ</span>
          </div>
        </div>
      </section>

      {/* Catalog & Filter Section */}
      <section id="catalog" className="bw-cat-section">
        <div className="bw-section-header">
          <h2 className="bw-section-title">
            <span style={{ color: '#0284C7' }}>আমাদের স্পেশাল</span>
            <span style={{ color: '#EC4899' }}>বেবি কালেকশন</span>
          </h2>
          <p className="bw-section-subtitle">
            বয়স ও ক্যাটাগরি অনুযায়ী আপনার পছন্দের পোশাকটি বেছে নিন
          </p>
        </div>

        {/* Category Tabs */}
        <div className="bw-cat-tabs">
          <button
            className={`bw-cat-tab ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            🌟 সব কালেকশন
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`bw-cat-tab ${activeCategory === c.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>

      {/* Product Grid */}
      <section className="bw-product-grid">
        {loading ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', fontSize: 18, color: '#64748B' }}>
            👶 লোড হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', fontSize: 16, color: '#64748B' }}>
            কোনো পণ্য পাওয়া যায়নি। অন্য কিছু খুঁজে দেখুন।
          </div>
        ) : (
          filteredProducts.map((p) => (
            <div key={p.id} className="bw-card">
              <div className="bw-card-media" onClick={() => setQuickViewProduct(p)}>
                {p.badge && <span className="bw-card-badge">{p.badge}</span>}
                <img src={p.images[0]} alt={p.name} className="bw-card-img" loading="lazy" />
              </div>

              <div className="bw-card-body">
                <h3 className="bw-card-title" onClick={() => setQuickViewProduct(p)}>
                  {p.name}
                </h3>
                <p className="bw-card-subtitle">{p.subtitle}</p>

                {/* Available Sizes */}
                {p.sizes && p.sizes.length > 0 && (
                  <div className="bw-sizes-row">
                    {p.sizes.map((s) => (
                      <span key={s} className="bw-size-pill">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Pricing */}
                <div className="bw-price-row">
                  <span className="bw-price-now">৳{p.price}</span>
                  {p.originalPrice > p.price && (
                    <span className="bw-price-old">৳{p.originalPrice}</span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="bw-card-actions">
                  <button className="bw-btn-order-now" onClick={() => openDirectBuy(p)}>
                    ⚡ সরাসরি অর্ডার
                  </button>
                  <button className="bw-btn-add-cart" onClick={() => addToCart(p)}>
                    🛒 কার্টে যোগ
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* Happy Parents Reviews */}
      <section style={{ maxWidth: 1240, margin: '20px auto 60px', padding: '0 20px' }}>
        <div className="bw-section-header">
          <h2 className="bw-section-title">
            <span style={{ color: '#EC4899' }}>হ্যাপি প্যারেন্টস</span>
            <span style={{ color: '#0284C7' }}>ফিডব্যাক ও রিভিউ</span>
          </h2>
          <p className="bw-section-subtitle">আমাদের পোশাক পরে সোনামণিদের মা-বাবারা যা বলছেন</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div className="bw-card" style={{ padding: 22 }}>
            <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 8 }}>⭐⭐⭐⭐⭐</div>
            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 14 }}>
              "কাপড়টা আসলেই অনেক সফট! বাচ্চার কোনো চুলকানি বা অস্বস্তি হয়নি। রঙটাও ছবির মতোই সুন্দর। ধন্যবাদ Baby Wear কে।"
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#BAE6FD', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#0369A1' }}>
                রা
              </div>
              <div>
                <b style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>রাবেয়া সুলতানা</b>
                <span style={{ fontSize: 11, color: '#64748B' }}>ধানমন্ডি, ঢাকা (Verified Buyer)</span>
              </div>
            </div>
          </div>

          <div className="bw-card" style={{ padding: 22 }}>
            <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 8 }}>⭐⭐⭐⭐⭐</div>
            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 14 }}>
              "মেয়ের ১ম জন্মদিনের জন্য প্রিন্সেস ফ্রকটি নিয়েছিলাম। সবাই অনেক প্রশংসা করেছে। ডেলিভারিও মাত্র ২ দিনে পেয়েছি।"
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#FBCFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#BE185D' }}>
                না
              </div>
              <div>
                <b style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>নাফিসা আনজুম</b>
                <span style={{ fontSize: 11, color: '#64748B' }}>চট্টগ্রাম (Verified Buyer)</span>
              </div>
            </div>
          </div>

          <div className="bw-card" style={{ padding: 22 }}>
            <div style={{ color: '#FBBF24', fontSize: 18, marginBottom: 8 }}>⭐⭐⭐⭐⭐</div>
            <p style={{ fontSize: 14, color: '#334155', lineHeight: 1.6, marginBottom: 14 }}>
              "নিউবর্ন গিফট বক্সটি আমার বোনের বাচ্চার জন্য অর্ডার করেছিলাম। প্যাকেজিং এবং কাপড়ের কোয়ালিটি সত্যিই প্রিমিয়াম।"
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#047857' }}>
                সা
              </div>
              <div>
                <b style={{ fontSize: 13, color: '#0F172A', display: 'block' }}>সাব্বির আহমেদ</b>
                <span style={{ fontSize: 11, color: '#64748B' }}>সিলেট (Verified Buyer)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Floating WhatsApp Button */}
      <div
        className="bw-floating-wa"
        onClick={() => {
          window.open(
            `https://wa.me/8801700000000?text=${encodeURIComponent('আসসালামু আলাইকুম, Baby Wear থেকে পণ্য সম্পর্কে জানতে চাচ্ছি।')}`,
            '_blank'
          );
        }}
        title="Chat on WhatsApp"
      >
        <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
          <path d="M12.031 2C6.494 2 2 6.494 2 12.031c0 1.956.564 3.782 1.54 5.336L2 22l4.786-1.503a9.98 9.98 0 0 0 5.245 1.488h.005c5.536 0 10.03-4.494 10.03-10.031C22.066 6.494 17.568 2 12.031 2zm5.834 14.195c-.244.686-1.22 1.258-1.745 1.336-.505.075-1.164.107-1.879-.122-1.928-.616-3.153-2.585-3.249-2.713-.095-.128-.781-1.042-.781-1.987 0-.946.495-1.411.671-1.603.176-.192.385-.24.514-.24.129 0 .258.002.371.008.119.006.278-.045.435.333.162.388.552 1.345.601 1.442.049.097.081.21.016.338-.065.129-.097.21-.193.322-.097.113-.203.253-.29.339-.097.097-.198.203-.085.397.113.194.502.828 1.077 1.341.741.661 1.365.866 1.559.963.194.097.307.081.42-.049.113-.129.484-.564.613-.758.129-.194.258-.161.435-.097.177.065 1.129.532 1.323.629.194.097.322.145.371.226.048.08.048.468-.196 1.154z" />
        </svg>
      </div>

      {/* Cart Drawer Modal */}
      {isCartOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsCartOpen(false)}>
          <div
            className="bw-modal-card"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F172A', margin: 0 }}>
                🛒 আপনার শপিং কার্ট ({cartTotalQty})
              </h3>
              <button className="bw-modal-close" onClick={() => setIsCartOpen(false)}>✕</button>
            </div>

            {cart.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748B' }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>🛍️</div>
                <p style={{ fontSize: 15, fontWeight: 600 }}>আপনার কার্ট বর্তমানে খালি আছে!</p>
                <button
                  className="bw-btn bw-btn-pink"
                  style={{ marginTop: 16 }}
                  onClick={() => setIsCartOpen(false)}
                >
                  👶 কেনাকাটা শুরু করুন
                </button>
              </div>
            ) : (
              <div>
                <div style={{ maxHeight: '50vh', overflowY: 'auto', marginBottom: 20 }}>
                  {cart.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        gap: 12,
                        padding: '12px 0',
                        borderBottom: '1px dashed #E2E8F0',
                        alignItems: 'center',
                      }}
                    >
                      <img
                        src={item.product.images[0]}
                        alt={item.product.name}
                        style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }}
                      />
                      <div style={{ flex: 1 }}>
                        <b style={{ fontSize: 14, color: '#0F172A', display: 'block', lineHeight: 1.3 }}>
                          {item.product.name}
                        </b>
                        <span style={{ fontSize: 12, color: '#64748B' }}>
                          সাইজ: {item.size} · কালার: {item.color}
                        </span>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#EC4899', marginTop: 4 }}>
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

                <div style={{ borderTop: '2px solid #F1F5F9', paddingTop: 14, marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                    <span>সাবটোটাল:</span>
                    <span style={{ color: '#EC4899' }}>৳{cartSubtotal}</span>
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
                  ⚡ ক্যাশ অন ডেলিভারিতে অর্ডার করুন
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quick View Product Modal */}
      {quickViewProduct && (
        <div className="bw-modal-backdrop" onClick={() => setQuickViewProduct(null)}>
          <div className="bw-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setQuickViewProduct(null)}>✕</button>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
              <div>
                <img
                  src={quickViewProduct.images[0]}
                  alt={quickViewProduct.name}
                  style={{ width: '100%', height: 320, objectFit: 'cover', borderRadius: 18 }}
                />
              </div>

              <div>
                <span className="bw-hero-pill" style={{ fontSize: 11, padding: '4px 10px', marginBottom: 8 }}>
                  {quickViewProduct.badge || '১০০% পিওর কটন'}
                </span>
                <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F172A', marginBottom: 8 }}>
                  {quickViewProduct.name}
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>{quickViewProduct.desc}</p>

                <div className="bw-price-row">
                  <span className="bw-price-now">৳{quickViewProduct.price}</span>
                  {quickViewProduct.originalPrice > quickViewProduct.price && (
                    <span className="bw-price-old">৳{quickViewProduct.originalPrice}</span>
                  )}
                </div>

                {/* Size Selector */}
                {quickViewProduct.sizes && quickViewProduct.sizes.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <b style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>সাইজ নির্বাচন করুন:</b>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {quickViewProduct.sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={`bw-size-pill ${selectedSize === s || (!selectedSize && s === quickViewProduct.sizes[0]) ? 'active' : ''}`}
                          style={{ padding: '6px 12px', fontSize: 12 }}
                          onClick={() => setSelectedSize(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
                  <button
                    className="bw-btn bw-btn-pink"
                    onClick={() => {
                      const sz = selectedSize || quickViewProduct.sizes[0];
                      setDirectCheckoutItem({
                        product: quickViewProduct,
                        size: sz,
                        color: quickViewProduct.colors[0]?.name || 'Default',
                        qty: 1,
                      });
                      setQuickViewProduct(null);
                      setIsCheckoutOpen(true);
                    }}
                  >
                    ⚡ সরাসরি অর্ডার
                  </button>
                  <button
                    className="bw-btn bw-btn-blue"
                    onClick={() => {
                      addToCart(quickViewProduct, selectedSize);
                      setQuickViewProduct(null);
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

      {/* Express Cash on Delivery Checkout Modal */}
      {isCheckoutOpen && (
        <div className="bw-modal-backdrop" onClick={() => setIsCheckoutOpen(false)}>
          <div className="bw-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setIsCheckoutOpen(false)}>✕</button>

            {orderSuccess ? (
              <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                <div style={{ fontSize: 54, marginBottom: 12 }}>🎉</div>
                <h3 style={{ fontSize: 24, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 8 }}>
                  ধন্যবাদ! আপনার অর্ডারটি গ্রহণ করা হয়েছে।
                </h3>
                <p style={{ fontSize: 15, color: '#334155', maxWidth: 480, margin: '0 auto 16px' }}>
                  আমাদের কাস্টমার কেয়ার থেকে আপনার সাথে দ্রুত যোগাযোগ করে পার্সেলটি পাঠিয়ে দেওয়া হবে।
                </p>

                <div style={{ background: '#F0F9FF', border: '2px dashed #93C5FD', borderRadius: 16, padding: 18, maxWidth: 360, margin: '0 auto 24px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748B' }}>অর্ডার আইডি:</span>
                    <b style={{ color: '#0284C7' }}>#{orderSuccess.id}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748B' }}>মোট বিল:</span>
                    <b style={{ color: '#EC4899' }}>৳{orderSuccess.total} (ক্যাশ অন ডেলিভারি)</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: '#64748B' }}>মোবাইল:</span>
                    <b>{orderSuccess.customer?.phone}</b>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button
                    className="bw-btn bw-btn-pink"
                    onClick={() => {
                      setOrderSuccess(null);
                      setIsCheckoutOpen(false);
                    }}
                  >
                    🛍️ আরও কেনাকাটা করুন
                  </button>
                  <button
                    className="bw-btn bw-btn-blue"
                    onClick={() => {
                      window.open(
                        `https://wa.me/8801700000000?text=${encodeURIComponent(`Hello Baby Wear, I placed order #${orderSuccess.id}`)}`,
                        '_blank'
                      );
                    }}
                  >
                    💬 হোয়াটসঅ্যাপে আপডেট
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ fontSize: 22, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 4 }}>
                  🛍️ ক্যাশ অন ডেলিভারি অর্ডার ফরম
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                  অর্ডারটি নিশ্চিত করতে নিচের তথ্যগুলো সঠিকভাবে পূরণ করুন:
                </p>

                <form onSubmit={handleSubmitOrder}>
                  <div className="bw-checkout-box">
                    <label className="bw-form-label">আপনার পূর্ণ নাম *</label>
                    <input
                      className="bw-input"
                      placeholder="e.g. তানজিলা আহমেদ"
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
                          <span style={{ color: '#0284C7' }}>৳৭০</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748B' }}>২৪-৪৮ ঘণ্টায় হোম ডেলিভারি</span>
                      </div>

                      <div
                        className={`bw-radio-card ${deliveryArea === 'outside' ? 'active' : ''}`}
                        onClick={() => setDeliveryArea('outside')}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                          <span>ঢাকা সিটির বাইরে</span>
                          <span style={{ color: '#0284C7' }}>৳১৩০</span>
                        </div>
                        <span style={{ fontSize: 11, color: '#64748B' }}>২-৪ দিনে হোম ডেলিভারি</span>
                      </div>
                    </div>

                    {/* Coupon */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <input
                        className="bw-input"
                        style={{ marginBottom: 0 }}
                        placeholder="ডিসকাউন্ট কুপন কোড (যেমন: BABYFIRST)"
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
                      <div style={{ fontSize: 12, color: '#10B981', fontWeight: 600, marginBottom: 8 }}>
                        ✓ {appliedCoupon.code} প্রযোজ্য হয়েছে (৳{appliedCoupon.discount} ছাড়)
                      </div>
                    )}
                  </div>

                  {/* Order Summary */}
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
                      <b>৳{deliveryFee}</b>
                    </div>
                    {discountAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#10B981', marginBottom: 4 }}>
                        <span>কুপন ছাড়:</span>
                        <b>-৳{discountAmount}</b>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#EC4899', borderTop: '1px dashed #BAE6FD', paddingTop: 8, marginTop: 8 }}>
                      <span>সর্বমোট বিল:</span>
                      <span>৳{grandTotal}</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="bw-btn bw-btn-pink"
                    style={{ width: '100%', padding: '16px', fontSize: 17, marginTop: 16 }}
                  >
                    {submittingOrder ? 'অর্ডার প্রসেস হচ্ছে…' : `✓ ৳${grandTotal} - অর্ডার কনফার্ম করুন`}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Track Order Modal */}
      {showTrackModal && (
        <div className="bw-modal-backdrop" onClick={() => setShowTrackModal(false)}>
          <div className="bw-modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <button className="bw-modal-close" onClick={() => setShowTrackModal(false)}>✕</button>

            <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)', color: '#0F3A66', marginBottom: 6 }}>
              📦 আপনার অর্ডার ট্র্যাক করুন
            </h3>
            <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
              অর্ডার করার সময় ব্যবহৃত মোবাইল নাম্বার বা অর্ডার আইডি দিন:
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
              <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 16 }}>
                {trackResult.notFound ? (
                  <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>
                    কোনো অর্ডার পাওয়া যায়নি। সঠিক মোবাইল নাম্বার দিয়ে চেষ্টা করুন।
                  </p>
                ) : (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <b>অর্ডার #{trackResult.id}</b>
                      <span className="bw-hero-pill" style={{ fontSize: 11, padding: '2px 8px', margin: 0 }}>
                        {trackResult.status === 'delivered' ? 'ডেলিভার্ড' : trackResult.status === 'shipped' ? 'শিপড / কুরিয়ারে' : 'কনফার্মড'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                      <div>গ্রাহক: {trackResult.customer?.name}</div>
                      <div>ঠিকানা: {trackResult.customer?.address}</div>
                      <div>মোট বিল: ৳{trackResult.total} (ক্যাশ অন ডেলিভারি)</div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <img src="/uploads/baby-wear-logo.png" alt="Baby Wear" style={{ width: 44, height: 44, borderRadius: '50%' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700 }}>
                <span style={{ color: '#38BDF8' }}>Baby </span>
                <span style={{ color: '#EC4899' }}>Wear</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, maxWidth: 300 }}>
              আপনার সোনামণির জন্য সবচেয়ে নিরাপদ, আরামদায়ক ও ট্রেন্ডি বেবি পোশাকের নির্ভরযোগ্য ঠিকানা।
            </p>
          </div>

          <div>
            <h4 style={{ fontSize: 15, color: '#F8FAFC', marginBottom: 14 }}>কুইক লিংক</h4>
            <ul style={{ listStyle: 'none', fontSize: 13, color: '#94A3B8', lineHeight: 2 }}>
              <li><a href="#catalog" style={{ color: 'inherit', textDecoration: 'none' }}>নিউবর্ন কালেকশন</a></li>
              <li><a href="#catalog" style={{ color: 'inherit', textDecoration: 'none' }}>বেবি বয় ও গার্ল ড্রেস</a></li>
              <li><a href="#catalog" style={{ color: 'inherit', textDecoration: 'none' }}>বেবি রম্পার ও স্লিপস্যুট</a></li>
              <li><a href="#catalog" style={{ color: 'inherit', textDecoration: 'none' }}>গিফট বক্স ও এক্সেসরিজ</a></li>
            </ul>
          </div>

          <div>
            <h4 style={{ fontSize: 15, color: '#F8FAFC', marginBottom: 14 }}>কাস্টমার সাপোর্ট</h4>
            <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 2 }}>
              <div>📞 মোবাইল: 01700-000000</div>
              <div>💬 হোয়াটসঅ্যাপ: 01700-000000</div>
              <div>✉️ ইমেইল: support@babywear.com</div>
              <div>🕒 সময়: সকাল ৯টা - রাত ১১টা</div>
            </div>
          </div>
        </div>

        <div className="bw-footer-bottom">
          <div>© {new Date().getFullYear()} Baby Wear. সর্বস্বত্ব সংরক্ষিত।</div>
          <div style={{ display: 'flex', gap: 16 }}>
            <span style={{ color: '#64748B' }}>🔒 নিরাপদ পেমেন্ট ও ১০০% ক্যাশ অন ডেলিভারি</span>
            <a href="/admin" style={{ color: '#475569', textDecoration: 'none', fontSize: 12 }}>Admin Login</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
