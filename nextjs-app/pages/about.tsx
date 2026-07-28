import Head from 'next/head';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Newsletter from '@/components/Newsletter';
import styles from '@/styles/About.module.css';

export default function AboutPage() {
  return (
    <>
      <Head>
        <title>About — NestKart</title>
      </Head>

      <Nav active="about" />

      <section className={styles.aboutHero}>
        <img src="https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=1600&q=80" alt="NestKart interior" loading="eager" />
        <div className={styles.aboutHeroOverlay}></div>
        <div className={styles.aboutHeroContent}>
          <p className={styles.aboutHeroKicker}>Our Story</p>
          <h1 className={styles.aboutHeroTitle}>Made for the way<br /><em>you live.</em></h1>
        </div>
      </section>

      <section className={styles.mission}>
        <div className={styles.missionInner}>
          <p className={styles.missionQuote}>&ldquo;Every home is a self-portrait. We help you paint it beautifully.&rdquo;</p>
          <p className={styles.missionText}>NestKart was founded in 2019 with a simple belief: that your home should be a reflection of how you truly want to live — not a showroom, but a sanctuary. We work directly with Indian craftspeople and small workshops to bring you furniture and home goods that are honest, durable, and quietly beautiful.</p>
        </div>
      </section>

      <section className={styles.split}>
        <div className={styles.splitImg}>
          <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1000&q=80" alt="Crafted furniture" loading="lazy" />
        </div>
        <div className={`${styles.splitBody} ${styles.splitBodyWhite}`}>
          <p className="section__kicker">Where we began</p>
          <h2 className={styles.splitTitle}>A small workshop.<br />A big idea.</h2>
          <p className={styles.splitText}>Our founder Priya started NestKart after spending years in the export furniture industry and watching beautiful Indian craftsmanship get lost in mass production. She set out to build a brand that kept those skills alive — and made them accessible to homes across India. We started with four products and a single workshop in Jodhpur. Today, we partner with over 40 artisan studios.</p>
          <Link href="/shop" className="btn btn--dark" style={{ alignSelf: 'flex-start' }}>Explore the Collection</Link>
        </div>
      </section>

      <section className={`${styles.split} ${styles.splitReverse}`}>
        <div className={styles.splitImg}>
          <img src="https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=1000&q=80" alt="Artisan craftsmanship" loading="lazy" />
        </div>
        <div className={styles.splitBody}>
          <p className="section__kicker">Our craft</p>
          <h2 className={styles.splitTitle}>Materials that<br />age gracefully.</h2>
          <p className={styles.splitText}>We believe in natural materials — solid sheesham, mango wood, hand-woven jute, stone-washed linen. These are things that don't just look good; they get better with time. Every piece is built to outlast trends and stay beautiful for decades. No particleboard. No veneers. No shortcuts.</p>
          <Link href="/shop" className="btn btn--dark" style={{ alignSelf: 'flex-start' }}>Our Materials</Link>
        </div>
      </section>

      <section className={styles.values}>
        <div className={styles.valuesInner}>
          <div className={styles.valuesHeader}>
            <p className={styles.valuesKicker}>What we stand for</p>
            <h2 className={styles.valuesTitle}>Our Principles</h2>
          </div>
          <div className={styles.valuesGrid}>
            <div className={styles.valueCard}>
              <p className={styles.valueCardNum}>01</p>
              <h3 className={styles.valueCardTitle}>Craft Over Speed</h3>
              <p className={styles.valueCardText}>We don't rush anything. Each piece is made to order, taking the time it needs to be built well. We'd rather you wait a little longer for something you'll keep forever.</p>
            </div>
            <div className={styles.valueCard}>
              <p className={styles.valueCardNum}>02</p>
              <h3 className={styles.valueCardTitle}>Honest Materials</h3>
              <p className={styles.valueCardText}>Solid wood, natural textiles, hand-thrown ceramics — the real thing. We're transparent about what goes into every piece and proud of every material we use.</p>
            </div>
            <div className={styles.valueCard}>
              <p className={styles.valueCardNum}>03</p>
              <h3 className={styles.valueCardTitle}>Fair Partnerships</h3>
              <p className={styles.valueCardText}>Our artisan partners earn above-market wages, work in safe conditions, and are credited in our collections. Their names and stories are part of what we sell.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.press}>
        <div className={styles.pressInner}>
          <p className={styles.pressTitle}>As seen in</p>
          <div className={styles.pressLogos}>
            <span className={styles.pressLogo}>Architectural Digest</span>
            <span className={styles.pressLogo}>Elle Décor</span>
            <span className={styles.pressLogo}>Vogue Living</span>
            <span className={styles.pressLogo}>The Hindu</span>
            <span className={styles.pressLogo}>Better Homes</span>
          </div>
        </div>
      </section>

      <Newsletter />
      <Footer />
    </>
  );
}
