import Head from 'next/head';
import { useState, type FormEvent } from 'react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import Newsletter from '@/components/Newsletter';
import styles from '@/styles/Contact.module.css';

export default function ContactPage() {
  const [fname, setFname] = useState('');
  const [lname, setLname] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setFname('');
      setLname('');
      setEmail('');
      setSubject('');
      setMessage('');
    }, 3000);
  }

  return (
    <>
      <Head>
        <title>Contact — NestKart</title>
      </Head>

      <Nav active="contact" />

      <div className={styles.pageBanner}>
        <img src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=1600&q=80" alt="Contact" loading="eager" />
        <div className={styles.pageBannerOverlay}></div>
        <div className={styles.pageBannerContent}>
          <p className={styles.pageBannerKicker}>Get in Touch</p>
          <h1 className={styles.pageBannerTitle}>Contact Us</h1>
        </div>
      </div>

      <section className={styles.contactSection}>
        <div className={styles.contactSectionInner}>
          <div className={styles.contactInfo}>
            <p className="section__kicker">We'd love to hear from you</p>
            <h2 className={styles.contactInfoTitle}>Have a question<br />or need advice?</h2>
            <p className={styles.contactInfoIntro}>Whether you're looking for help with an order, styling advice for a room, or simply want to know more about where our pieces come from — we're here. Real people, real conversations.</p>

            <div className={styles.contactDetails}>
              <div className={styles.contactDetail}>
                <div className={styles.contactDetailIcon}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div>
                  <p className={styles.contactDetailLabel}>Studio &amp; Showroom</p>
                  <p className={styles.contactDetailValue}>12, Rajpur Road, Jodhpur<br />Rajasthan — 342 001, India</p>
                </div>
              </div>

              <div className={styles.contactDetail}>
                <div className={styles.contactDetailIcon}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div>
                  <p className={styles.contactDetailLabel}>Email</p>
                  <p className={styles.contactDetailValue}>
                    <a href="mailto:hello@nestkart.in">hello@nestkart.in</a><br />
                    <a href="mailto:orders@nestkart.in">orders@nestkart.in</a>
                  </p>
                </div>
              </div>

              <div className={styles.contactDetail}>
                <div className={styles.contactDetailIcon}>
                  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.7 13.1a19.79 19.79 0 01-3.07-8.67A2 2 0 012.81 2h3a2 2 0 012 1.72c.13.96.36 1.9.68 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.86 6.86l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                  </svg>
                </div>
                <div>
                  <p className={styles.contactDetailLabel}>Phone</p>
                  <p className={styles.contactDetailValue}>
                    <a href="tel:+919001234567">+91 90012 34567</a><br />
                    Mon–Sat, 9 am – 7 pm IST
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.contactSocials}>
              <a href="#" className={styles.contactSocial} aria-label="Instagram">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4.5" />
                  <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href="#" className={styles.contactSocial} aria-label="Pinterest">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.87 6.39 9.29-.09-.78-.17-1.98.03-2.83.18-.77 1.22-5.16 1.22-5.16s-.31-.63-.31-1.55c0-1.45.84-2.54 1.89-2.54.89 0 1.32.67 1.32 1.48 0 .9-.57 2.25-.87 3.5-.25 1.04.52 1.89 1.55 1.89 1.86 0 3.1-2.39 3.1-5.21 0-2.15-1.45-3.77-4.09-3.77-2.98 0-4.83 2.23-4.83 4.71 0 .85.25 1.45.64 1.92.17.21.2.29.13.53-.05.17-.15.57-.2.73-.07.24-.28.33-.52.24-1.48-.6-2.16-2.22-2.16-4.04 0-3.05 2.59-6.75 7.74-6.75 4.13 0 6.86 3 6.86 6.22 0 4.27-2.37 7.47-5.85 7.47-1.17 0-2.27-.63-2.65-1.34l-.77 2.96c-.23.87-.83 1.96-1.27 2.62.96.29 1.97.45 3.02.45 5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                </svg>
              </a>
              <a href="#" className={styles.contactSocial} aria-label="Facebook">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                </svg>
              </a>
            </div>
          </div>

          <div className={styles.contactFormWrap}>
            <h3 className={styles.contactFormHeading}>Send us a message</h3>
            <form onSubmit={handleSubmit}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="fname">First Name</label>
                  <input type="text" id="fname" placeholder="Priya" required value={fname} onChange={(e) => setFname(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="lname">Last Name</label>
                  <input type="text" id="lname" placeholder="Sharma" required value={lname} onChange={(e) => setLname(e.target.value)} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="email">Email Address</label>
                <input type="email" id="email" placeholder="priya@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="subject">Subject</label>
                <select id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="">Select a topic</option>
                  <option>Order Enquiry</option>
                  <option>Product Information</option>
                  <option>Styling Advice</option>
                  <option>Returns &amp; Exchanges</option>
                  <option>Trade / Interior Design</option>
                  <option>Other</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="message">Your Message</label>
                <textarea id="message" placeholder="Tell us how we can help..." required value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              <button type="submit" className={`${styles.formSubmit} ${sent ? styles.formSubmitSent : ''}`}>
                {sent ? 'Message Sent ✓' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className={styles.hoursBand}>
        <div className={styles.hoursBandInner}>
          <div>
            <h2 className={styles.hoursTitle}>Visit our<br />showroom.</h2>
            <p className={styles.hoursSub}>Experience our pieces in person at our Jodhpur studio. No appointment needed — we'd love to meet you. Our design team is on hand to help you find exactly what you're looking for.</p>
          </div>
          <div>
            <table className={styles.hoursTable}>
              <tbody>
                <tr><td>Monday – Friday</td><td>10:00 am – 7:00 pm</td></tr>
                <tr><td>Saturday</td><td>10:00 am – 6:00 pm</td></tr>
                <tr><td>Sunday</td><td>11:00 am – 4:00 pm</td></tr>
                <tr><td>Public Holidays</td><td>Closed</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <Newsletter />
      <Footer />
    </>
  );
}
