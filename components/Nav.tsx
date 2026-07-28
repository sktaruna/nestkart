import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getActiveCustomerId } from '@/lib/useActiveCustomer';
import { API_HEADERS } from '@/lib/format';

interface NavProps {
  active?: 'home' | 'shop' | 'about' | 'journal' | 'contact' | 'admin' | 'account';
}

export default function Nav({ active }: NavProps) {
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function updateCartCount() {
      try {
        const r = await fetch(`/api/cart/${getActiveCustomerId()}`, {
          headers: API_HEADERS,
          cache: 'no-store',
        });
        const d = await r.json();
        if (!cancelled) setCartCount(d.item_count || 0);
      } catch {
        /* ignore */
      }
    }
    updateCartCount();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header className="nav">
      <div className="nav__inner">
        <Link href="/" className="nav__brand">NestKart</Link>
        <ul className="nav__links">
          <li><Link href="/" className={active === 'home' ? 'active' : ''}>Home</Link></li>
          <li><Link href="/shop" className={active === 'shop' ? 'active' : ''}>Shop</Link></li>
          <li><Link href="/about" className={active === 'about' ? 'active' : ''}>About</Link></li>
          <li><Link href="/journal" className={active === 'journal' ? 'active' : ''}>Journal</Link></li>
          <li><Link href="/contact" className={active === 'contact' ? 'active' : ''}>Contact</Link></li>
          <li><Link href="/admin" className={active === 'admin' ? 'active' : ''}>Admin</Link></li>
        </ul>
        <div className="nav__actions">
          <button className="nav__icon" aria-label="Search">
            <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7.5" />
              <line x1="16.5" y1="16.5" x2="22" y2="22" />
            </svg>
          </button>
          <Link href="/account" className={`nav__icon${active === 'account' ? ' active' : ''}`} aria-label="Account">
            <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </Link>
          <Link href="/cart" className="nav__icon nav__cart-count" id="nav-cart-btn" aria-label="Cart" data-count={cartCount}>
            <svg width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
