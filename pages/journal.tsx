import Head from 'next/head';
import { useState } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Newsletter from '@/components/Newsletter';
import styles from '@/styles/Journal.module.css';

const CATEGORIES = ['All', 'Styling', 'Materials', 'Bedroom', 'Living Room', 'Dining', 'Sustainability', 'Craft'];

const ARTICLES = [
  {
    img: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=700&q=80',
    alt: 'Rattan guide',
    tag: 'Materials',
    date: 'June 12, 2025',
    title: 'The Complete Guide to Rattan Furniture',
    excerpt: "Rattan is having a moment — again. But unlike past trends, this time the material is staying. Here's everything you need to know.",
  },
  {
    img: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80',
    alt: 'Natural materials',
    tag: 'Styling',
    date: 'May 28, 2025',
    title: 'The Case for Natural Materials',
    excerpt: 'Why linen, wood, stone, and rattan have earned a permanent place in our homes — and our hearts.',
  },
  {
    img: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=700&q=80',
    alt: 'Bedroom rituals',
    tag: 'Bedroom',
    date: 'May 10, 2025',
    title: 'Bedroom Rituals for Better Sleep',
    excerpt: 'Your bedroom environment shapes how well you rest. Here are the small changes that make a big difference.',
  },
  {
    img: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=700&q=80',
    alt: 'Dining table styling',
    tag: 'Dining',
    date: 'April 22, 2025',
    title: 'How to Style a Dining Table for Every Season',
    excerpt: 'A well-styled dining table transforms a meal into an occasion. Four seasons, four approaches — all using what you already own.',
  },
  {
    img: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=700&q=80',
    alt: 'Sheesham wood',
    tag: 'Craft',
    date: 'April 8, 2025',
    title: "Sheesham: India's Finest Furniture Wood",
    excerpt: "Indian rosewood has been prized for centuries. Here's why every piece of sheesham furniture you own will only look better with age.",
  },
  {
    img: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=700&q=80',
    alt: 'Declutter your home',
    tag: 'Styling',
    date: 'March 30, 2025',
    title: 'The NestKart Edit: 10 Things to Remove from Your Home',
    excerpt: "Sometimes making a room better isn't about adding anything at all. This is our guide to thoughtful decluttering.",
  },
];

export default function JournalPage() {
  const [activeCat, setActiveCat] = useState('All');

  return (
    <>
      <Head>
        <title>Journal — NestKart</title>
      </Head>

      <Nav active="journal" />

      <div className={styles.pageBanner}>
        <img src="https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1600&q=80" alt="Journal" loading="eager" />
        <div className={styles.pageBannerOverlay}></div>
        <div className={styles.pageBannerContent}>
          <p className={styles.pageBannerKicker}>Ideas &amp; Inspiration</p>
          <h1 className={styles.pageBannerTitle}>The Journal</h1>
        </div>
      </div>

      <div className={styles.journalCats}>
        <div className={styles.journalCatsInner}>
          <h2 className={styles.journalCatsTitle}>Browse by topic</h2>
          <div className={styles.catPills}>
            {CATEGORIES.map((c) => (
              <a
                href="#"
                key={c}
                className={`${styles.catPill} ${activeCat === c ? styles.catPillActive : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveCat(c);
                }}
              >
                {c}
              </a>
            ))}
          </div>
        </div>
      </div>

      <section className={styles.featuredArticle}>
        <div className={styles.featuredArticleInner}>
          <div className={styles.featuredArticleImg}>
            <img src="https://images.unsplash.com/photo-1618220179428-22790b461013?w=1000&q=80" alt="How to Style a Capsule Living Room" loading="lazy" />
          </div>
          <div>
            <span className={styles.featuredArticleTag}>Featured</span>
            <p className={styles.featuredArticleDate}>June 20, 2025</p>
            <h2 className={styles.featuredArticleTitle}>How to Style a Capsule Living Room That Feels Completely You</h2>
            <p className={styles.featuredArticleExcerpt}>Less is more — until it isn't. The secret to a capsule living room isn't minimalism for its own sake; it's restraint in service of meaning. Here's how to build a room around fewer, better pieces — and love every inch of it.</p>
            <a href="#" className={styles.articleLink}>Read the Article</a>
          </div>
        </div>
      </section>

      <section className={styles.articles}>
        <div className={styles.articlesInner}>
          <hr className={styles.articlesDivider} />
          <div className={styles.articlesGrid}>
            {ARTICLES.map((a) => (
              <a href="#" className={styles.articleCard} key={a.title}>
                <div className={styles.articleCardImg}>
                  <img src={a.img} alt={a.alt} loading="lazy" />
                </div>
                <p className={styles.articleCardTag}>{a.tag}</p>
                <p className={styles.articleCardDate}>{a.date}</p>
                <h3 className={styles.articleCardTitle}>{a.title}</h3>
                <p className={styles.articleCardExcerpt}>{a.excerpt}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      <Newsletter />
      <Footer />
    </>
  );
}
