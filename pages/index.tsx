import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Newsletter from '@/components/Newsletter';
import styles from '@/styles/Home.module.css';
import { API_HEADERS, formatINR } from '@/lib/format';
import { getActiveCustomerId } from '@/lib/useActiveCustomer';
import type { Product } from '@/lib/types';

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadNewArrivals() {
      try {
        const r = await fetch('/api/products?sort=newest', { headers: API_HEADERS, cache: 'no-store' });
        const d = await r.json();
        if (!cancelled && d.ok) setProducts(d.products.slice(0, 4));
      } catch {
        /* ignore */
      }
    }
    loadNewArrivals();
    return () => {
      cancelled = true;
    };
  }, []);

  async function addToCart(productId: string) {
    try {
      const r = await fetch(`/api/cart/${getActiveCustomerId()}/add`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ product_id: productId, quantity: 1 }),
      });
      await r.json();
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <Head>
        <title>NestKart — Home goods you'll love living with</title>
      </Head>

      <Nav active="home" />

      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroImg}>
          <img
            src="https://images.unsplash.com/photo-1618220179428-22790b461013?w=1800&q=82"
            alt="Warm, sunlit living room interior"
            loading="eager"
          />
        </div>
        <div className={styles.heroOverlay}></div>
        <div className={styles.heroContent}>
          <p className={styles.heroLabel}>New Collection &mdash; Summer 2025</p>
          <h1 className={styles.heroTitle}>Crafted for<br /><em>how you live.</em></h1>
          <p className={styles.heroSub}>Thoughtfully sourced furniture and home goods for spaces you&rsquo;ll love coming back to.</p>
          <Link href="/shop" className="btn btn--light">Shop the Collection</Link>
        </div>
      </section>

      {/* TRUST BAR */}
      <div className={styles.trustBar}>
        <div className={styles.trustBarInner}>
          <div className={styles.trustItem}>
            <svg className={styles.trustItemIcon} fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <div>
              <p className={styles.trustItemTitle}>Free Delivery Over ₹10,000</p>
              <p className={styles.trustItemSub}>Across India, right to your door</p>
            </div>
          </div>
          <div className={styles.trustItem}>
            <svg className={styles.trustItemIcon} fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <div>
              <p className={styles.trustItemTitle}>30-Day Returns</p>
              <p className={styles.trustItemSub}>No questions, no hassle</p>
            </div>
          </div>
          <div className={styles.trustItem}>
            <svg className={styles.trustItemIcon} fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div>
              <p className={styles.trustItemTitle}>2-Year Warranty</p>
              <p className={styles.trustItemSub}>On all solid wood furniture</p>
            </div>
          </div>
          <div className={styles.trustItem}>
            <svg className={styles.trustItemIcon} fill="none" stroke="currentColor" strokeWidth="1.4" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div>
              <p className={styles.trustItemTitle}>Expert Support</p>
              <p className={styles.trustItemSub}>Mon–Sat, 9 am to 7 pm</p>
            </div>
          </div>
        </div>
      </div>

      {/* NEW ARRIVALS */}
      <section className="section section--white">
        <div className="section__inner">
          <div className="section__header">
            <div>
              <p className="section__kicker">Just In</p>
              <h2 className="section__title">New Arrivals</h2>
            </div>
            <Link href="/shop" className="section__viewall">View All</Link>
          </div>

          <div className="products-grid">
            {products.map((p) => (
              <div className="product-card" key={p.product_id}>
                <div className="product-card__img-wrap">
                  {p.badge && <span className="product-card__badge">{p.badge}</span>}
                  <img src={p.image_url} alt={p.name} loading="lazy" />
                  <button
                    className="product-card__quick"
                    onClick={() => addToCart(p.product_id)}
                    disabled={p.stock_status === 'out_of_stock'}
                    style={p.stock_status === 'out_of_stock' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                  >
                    {p.stock_status === 'out_of_stock' ? 'Out of Stock' : 'Add to Bag'}
                  </button>
                </div>
                <p className="product-card__category">{p.category.charAt(0).toUpperCase() + p.category.slice(1)}</p>
                <h3 className="product-card__name">{p.name}</h3>
                <p className="product-card__price">
                  {p.original_price ? <><s>{formatINR(p.original_price)}</s> </> : null}
                  {formatINR(p.price)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHOP BY ROOM */}
      <section className="section section--surface">
        <div className="section__inner">
          <div className="section__header section__header--center">
            <p className="section__kicker">Browse by Space</p>
            <h2 className="section__title">Shop by Room</h2>
          </div>
          <div className={styles.roomsGrid}>
            <Link href="/shop" className={styles.roomTile}>
              <img
                src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=900&q=80"
                alt="Living Room"
                loading="lazy"
              />
              <div className={styles.roomTileOverlay}></div>
              <div className={styles.roomTileContent}>
                <p className={styles.roomTileLabel}>Explore</p>
                <h3 className={styles.roomTileName}>Living<br />Room</h3>
                <span className={styles.roomTileCta}>Shop Now</span>
              </div>
            </Link>
            <Link href="/shop" className={styles.roomTile}>
              <img
                src="https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=900&q=80"
                alt="Bedroom"
                loading="lazy"
              />
              <div className={styles.roomTileOverlay}></div>
              <div className={styles.roomTileContent}>
                <p className={styles.roomTileLabel}>Explore</p>
                <h3 className={styles.roomTileName}>Bedroom</h3>
                <span className={styles.roomTileCta}>Shop Now</span>
              </div>
            </Link>
            <Link href="/shop" className={styles.roomTile}>
              <img
                src="https://images.unsplash.com/photo-1617806118233-18e1de247200?w=900&q=80"
                alt="Dining"
                loading="lazy"
              />
              <div className={styles.roomTileOverlay}></div>
              <div className={styles.roomTileContent}>
                <p className={styles.roomTileLabel}>Explore</p>
                <h3 className={styles.roomTileName}>Dining<br />Room</h3>
                <span className={styles.roomTileCta}>Shop Now</span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* OUR STORY */}
      <section className={styles.story}>
        <div className={styles.storyImg}>
          <img
            src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1000&q=80"
            alt="Our story — a warmly lit interior"
            loading="lazy"
          />
        </div>
        <div className={styles.storyBody}>
          <p className="section__kicker">Our Story</p>
          <h2 className={styles.storyTitle}>Home should feel like a warm embrace.</h2>
          <p className={styles.storyText}>At NestKart, we believe every piece you bring into your home should tell a story — of careful craft, honest materials, and spaces made for living. We partner with skilled artisans across India to bring you furniture and décor that is as meaningful as it is beautiful.</p>
          <Link href="/about" className="btn btn--dark" style={{ alignSelf: 'flex-start' }}>Learn Our Story</Link>
        </div>
      </section>

      {/* JOURNAL */}
      <section className="section section--white">
        <div className="section__inner">
          <div className="section__header">
            <div>
              <p className="section__kicker">Ideas &amp; Inspiration</p>
              <h2 className="section__title">From the Journal</h2>
            </div>
            <Link href="/journal" className="section__viewall">Read All</Link>
          </div>

          <div className={styles.journalGrid}>
            <Link href="/journal" className={styles.journalCard}>
              <div className={styles.journalCardImg}>
                <img
                  src="https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=700&q=80"
                  alt="How to style a capsule living room"
                  loading="lazy"
                />
              </div>
              <p className={styles.journalCardDate}>June 12, 2025</p>
              <h3 className={styles.journalCardTitle}>How to Style a Capsule Living Room</h3>
              <p className={styles.journalCardExcerpt}>Fewer, better pieces. Here&rsquo;s how to curate a living room that feels calm, cohesive, and completely you.</p>
            </Link>

            <Link href="/journal" className={styles.journalCard}>
              <div className={styles.journalCardImg}>
                <img
                  src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80"
                  alt="The case for natural materials"
                  loading="lazy"
                />
              </div>
              <p className={styles.journalCardDate}>May 28, 2025</p>
              <h3 className={styles.journalCardTitle}>The Case for Natural Materials</h3>
              <p className={styles.journalCardExcerpt}>Why linen, wood, stone, and rattan have earned a permanent place in our homes — and our hearts.</p>
            </Link>

            <Link href="/journal" className={styles.journalCard}>
              <div className={styles.journalCardImg}>
                <img
                  src="https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=700&q=80"
                  alt="Bedroom rituals for better sleep"
                  loading="lazy"
                />
              </div>
              <p className={styles.journalCardDate}>May 10, 2025</p>
              <h3 className={styles.journalCardTitle}>Bedroom Rituals for Better Sleep</h3>
              <p className={styles.journalCardExcerpt}>Your bedroom environment shapes how well you rest. Small changes, big difference.</p>
            </Link>
          </div>
        </div>
      </section>

      <Newsletter />
      <Footer />
    </>
  );
}
