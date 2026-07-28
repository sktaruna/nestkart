import Head from 'next/head';
import { useEffect, useState } from 'react';
import Nav, { notifyCartChanged } from '@/components/Nav';
import Footer from '@/components/Footer';
import Newsletter from '@/components/Newsletter';
import styles from '@/styles/Shop.module.css';
import { API_HEADERS, formatINR } from '@/lib/format';
import { getActiveCustomerId } from '@/lib/useActiveCustomer';
import type { Product } from '@/lib/types';

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'living', label: 'Living Room' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'dining', label: 'Dining' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'decor', label: 'Décor' },
];

const SORT_MAP: Record<string, string> = {
  'Price: Low to High': 'price_asc',
  'Price: High to Low': 'price_desc',
  Newest: 'newest',
};

export default function ShopPage() {
  const [category, setCategory] = useState('all');
  const [sortLabel, setSortLabel] = useState('Featured');
  const [products, setProducts] = useState<Product[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadProducts() {
      try {
        const sort = SORT_MAP[sortLabel] || '';
        let url = '/api/products?';
        if (category && category !== 'all') url += `category=${category}&`;
        if (sort) url += `sort=${sort}`;
        const r = await fetch(url, { headers: API_HEADERS, cache: 'no-store' });
        const d = await r.json();
        if (!cancelled && d.ok) setProducts(d.products);
      } catch {
        /* ignore */
      }
    }
    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [category, sortLabel]);

  async function addToCart(productId: string) {
    // Show "Added" immediately rather than waiting on the ~300ms round
    // trip — the request still runs in the background; on the rare
    // failure (e.g. out of stock) we roll the feedback back and surface
    // the real error instead of leaving a false "Added" state up.
    setAddedId(productId);
    setAddError('');
    notifyCartChanged();
    try {
      const r = await fetch(`/api/cart/${getActiveCustomerId()}/add`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ product_id: productId, quantity: 1 }),
      });
      const d = await r.json();
      if (d.ok) {
        setTimeout(() => setAddedId((cur) => (cur === productId ? null : cur)), 1200);
        notifyCartChanged();
      } else {
        setAddedId((cur) => (cur === productId ? null : cur));
        setAddError(d.message || 'Could not add this item to your cart.');
        notifyCartChanged();
      }
    } catch {
      setAddedId((cur) => (cur === productId ? null : cur));
      setAddError('Network error. Please try again.');
      notifyCartChanged();
    }
  }

  return (
    <>
      <Head>
        <title>Shop — NestKart</title>
      </Head>

      <Nav active="shop" />

      <div className={styles.pageBanner}>
        <img src="https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=1600&q=80" alt="Shop all" loading="eager" />
        <div className={styles.pageBannerOverlay}></div>
        <div className={styles.pageBannerContent}>
          <p className={styles.pageBannerKicker}>Curated for you</p>
          <h1 className={styles.pageBannerTitle}>Shop All</h1>
        </div>
      </div>

      {addError && (
        <div style={{ maxWidth: 1200, margin: '16px auto 0', padding: '0 24px' }}>
          <p style={{ color: '#b3261e', background: '#fdecea', padding: '10px 16px', borderRadius: 6 }}>
            {addError}
          </p>
        </div>
      )}

      <div className={styles.filterBar}>
        <div className={styles.filterBarInner}>
          <div className={styles.filterTabs}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                className={`${styles.filterTab} ${category === c.key ? styles.filterTabActive : ''}`}
                onClick={() => setCategory(c.key)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className={styles.filterSort}>
            <label htmlFor="sort">Sort:</label>
            <select id="sort" value={sortLabel} onChange={(e) => setSortLabel(e.target.value)}>
              <option>Featured</option>
              <option>Price: Low to High</option>
              <option>Price: High to Low</option>
              <option>Newest</option>
            </select>
          </div>
        </div>
      </div>

      <section className={styles.shopSection}>
        <div className={styles.shopSectionInner}>
          <p className={styles.shopCount}>Showing <span>{products.length}</span> products</p>
          <div className={styles.shopGrid}>
            {products.length === 0 && (
              <p style={{ color: 'var(--muted)', gridColumn: '1/-1', textAlign: 'center', padding: '48px 0' }}>No products found.</p>
            )}
            {products.map((p) => {
              const oos = p.stock_status === 'out_of_stock';
              let badge: any = null;
              if (p.stock_status === 'low_stock') {
                badge = <span className="product-card__badge" style={{ background: '#B08450' }}>Low Stock</span>;
              } else if (oos) {
                badge = <span className="product-card__badge" style={{ background: '#8A7968' }}>Out of Stock</span>;
              } else if (p.badge) {
                badge = <span className="product-card__badge">{p.badge}</span>;
              }
              let btnLabel = 'Add to Bag';
              if (oos) btnLabel = 'Out of Stock';
              else if (addedId === p.product_id) btnLabel = 'Added!';

              return (
                <div className="product-card" data-cat={p.category} key={p.product_id}>
                  <div className="product-card__img-wrap">
                    {badge}
                    <img src={p.image_url} alt={p.name} loading="lazy" />
                    <button
                      className="product-card__quick"
                      onClick={() => addToCart(p.product_id)}
                      disabled={oos}
                      style={oos ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                    >
                      {btnLabel}
                    </button>
                  </div>
                  <p className="product-card__category">{p.category.charAt(0).toUpperCase() + p.category.slice(1)}</p>
                  <h3 className="product-card__name">{p.name}</h3>
                  <p className="product-card__price">
                    {p.original_price ? <><s>{formatINR(p.original_price)}</s> </> : null}
                    {formatINR(p.price)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Newsletter />
      <Footer />
    </>
  );
}
