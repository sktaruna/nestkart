import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__top">
          <div>
            <div className="footer__brand">NestKart</div>
            <p className="footer__tagline">Home goods curated for how you actually live — crafted with care, sourced with intention.</p>
            <div className="footer__socials">
              <a href="#" className="footer__social" aria-label="Instagram">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4.5" />
                  <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href="#" className="footer__social" aria-label="Pinterest">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.87 6.39 9.29-.09-.78-.17-1.98.03-2.83.18-.77 1.22-5.16 1.22-5.16s-.31-.63-.31-1.55c0-1.45.84-2.54 1.89-2.54.89 0 1.32.67 1.32 1.48 0 .9-.57 2.25-.87 3.5-.25 1.04.52 1.89 1.55 1.89 1.86 0 3.1-2.39 3.1-5.21 0-2.15-1.45-3.77-4.09-3.77-2.98 0-4.83 2.23-4.83 4.71 0 .85.25 1.45.64 1.92.17.21.2.29.13.53-.05.17-.15.57-.2.73-.07.24-.28.33-.52.24-1.48-.6-2.16-2.22-2.16-4.04 0-3.05 2.59-6.75 7.74-6.75 4.13 0 6.86 3 6.86 6.22 0 4.27-2.37 7.47-5.85 7.47-1.17 0-2.27-.63-2.65-1.34l-.77 2.96c-.23.87-.83 1.96-1.27 2.62.96.29 1.97.45 3.02.45 5.52 0 10-4.48 10-10S17.52 2 12 2z" />
                </svg>
              </a>
              <a href="#" className="footer__social" aria-label="Facebook">
                <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
                </svg>
              </a>
            </div>
          </div>

          <div>
            <h4 className="footer__col-title">Shop</h4>
            <ul className="footer__links">
              <li><Link href="/shop">All Products</Link></li>
              <li><Link href="/shop">Living Room</Link></li>
              <li><Link href="/shop">Bedroom</Link></li>
              <li><Link href="/shop">Dining</Link></li>
              <li><Link href="/shop">Accessories</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="footer__col-title">Company</h4>
            <ul className="footer__links">
              <li><Link href="/about">About Us</Link></li>
              <li><Link href="/journal">Journal</Link></li>
              <li><Link href="/contact">Contact</Link></li>
              <li><a href="#">Careers</a></li>
            </ul>
          </div>

          <div>
            <h4 className="footer__col-title">Help</h4>
            <ul className="footer__links">
              <li><a href="#">Shipping &amp; Returns</a></li>
              <li><a href="#">FAQs</a></li>
              <li><a href="#">Care Guide</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p>&copy; 2025 NestKart. All rights reserved.</p>
          <p>Made with care in India.</p>
        </div>
      </div>
    </footer>
  );
}
