import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Nav, { notifyCartChanged } from '@/components/Nav';
import styles from '@/styles/Cart.module.css';
import { API_HEADERS, formatINR } from '@/lib/format';
import { getActiveCustomerId } from '@/lib/useActiveCustomer';
import type { CartResponse } from '@/lib/types';

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  async function loadCart() {
    try {
      const r = await fetch(`/api/cart/${getActiveCustomerId()}`, { headers: API_HEADERS, cache: 'no-store' });
      const d = await r.json();
      setCart(d);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    loadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optimistic update: apply the qty/removal to local state immediately
  // (recomputing subtotal from known unit prices) so the UI feels instant,
  // then reconcile with the server's response once it arrives — the
  // request itself still takes ~300ms round-trip, but the user isn't
  // staring at a frozen screen waiting for it. Shipping cost/method is
  // left as-is optimistically (it only changes in the rare case removing
  // an item drops the last "large_item", corrected within the same
  // response a moment later).
  function applyOptimistic(updater: (items: CartResponse['items']) => CartResponse['items']) {
    setCart((prev) => {
      if (!prev) return prev;
      const items = updater(prev.items);
      const subtotal = items.reduce((sum, i) => sum + i.line_total, 0);
      return {
        ...prev,
        items,
        item_count: items.reduce((sum, i) => sum + i.qty, 0),
        subtotal,
        subtotal_formatted: formatINR(subtotal),
      };
    });
  }

  async function changeQty(productId: string, newQty: number) {
    applyOptimistic((items) =>
      newQty <= 0
        ? items.filter((i) => i.product_id !== productId)
        : items.map((i) => (i.product_id === productId ? { ...i, qty: newQty, line_total: newQty * i.unit_price } : i))
    );
    notifyCartChanged();
    try {
      const r = await fetch(`/api/cart/${getActiveCustomerId()}/update`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ product_id: productId, quantity: newQty }),
      });
      const d = await r.json();
      setCart(d);
      notifyCartChanged();
    } catch {
      loadCart(); // reconcile from server if the optimistic update drifted
    }
  }

  async function removeItem(productId: string) {
    applyOptimistic((items) => items.filter((i) => i.product_id !== productId));
    notifyCartChanged();
    try {
      const r = await fetch(`/api/cart/${getActiveCustomerId()}/remove`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ product_id: productId }),
      });
      const d = await r.json();
      setCart(d);
      notifyCartChanged();
    } catch {
      loadCart();
    }
  }

  async function placeOrder() {
    setPlacing(true);
    setCheckoutError('');
    try {
      const cid = getActiveCustomerId();
      const r = await fetch(`/api/cart/${cid}/checkout`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ customer_id: cid }),
      });
      const d = await r.json();
      if (d.ok) {
        notifyCartChanged();
        router.push('/account');
      } else {
        setCheckoutError(d.message || 'Something went wrong. Please try again.');
        setPlacing(false);
      }
    } catch {
      setCheckoutError('Network error. Please check your connection and try again.');
      setPlacing(false);
    }
  }

  const items = cart?.items || [];
  const isEmpty = !loadError && items.length === 0;
  const shipping = cart?.shipping_cost || 0;
  const subtotal = cart?.subtotal || 0;

  return (
    <>
      <Head>
        <title>Cart — NestKart</title>
      </Head>

      <Nav />

      <main className={styles.cartPage}>
        <div className={styles.cartPageInner}>
          <h1 className={styles.cartPageHeading}>Your Bag</h1>

          {loadError && <p style={{ color: 'var(--muted)' }}>Unable to load cart.</p>}

          {isEmpty && (
            <div className={styles.cartEmpty}>
              <p className={styles.cartEmptyTitle}>Your bag is empty.</p>
              <p className={styles.cartEmptySub}>Looks like you haven't added anything yet.</p>
              <Link href="/shop" className="btn btn--dark">Continue Shopping</Link>
            </div>
          )}

          {!loadError && items.length > 0 && (
            <div className={styles.cartLayout}>
              <div className={styles.cartItems}>
                {items.map((item) => (
                  <div className={styles.cartItem} key={item.product_id}>
                    <div className={styles.cartItemImg}>
                      <img src={item.image_url} alt={item.product_name} />
                    </div>
                    <div className={styles.cartItemInfo}>
                      <p className={styles.cartItemCategory}>{item.category || ''}</p>
                      <h3 className={styles.cartItemName}>{item.product_name}</h3>
                      <p className={styles.cartItemPrice}>{formatINR(item.unit_price)}</p>
                      <div className={styles.cartItemStepper}>
                        <button className={styles.stepperBtn} onClick={() => changeQty(item.product_id, item.qty - 1)}>&minus;</button>
                        <input
                          className={styles.stepperQty}
                          type="number"
                          value={item.qty}
                          min={0}
                          onChange={(e) => changeQty(item.product_id, parseInt(e.target.value, 10) || 0)}
                        />
                        <button className={styles.stepperBtn} onClick={() => changeQty(item.product_id, item.qty + 1)}>+</button>
                      </div>
                      <button className={styles.cartItemRemove} onClick={() => removeItem(item.product_id)}>Remove</button>
                    </div>
                    <div className={styles.cartItemRight}>
                      <p className={styles.cartItemTotal}>{formatINR(item.line_total)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.orderSummary}>
                <p className={styles.orderSummaryTitle}>Order Summary</p>
                <div className={styles.summaryRow}>
                  <span>Subtotal</span>
                  <span>{formatINR(subtotal)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Shipping</span>
                  <span>{shipping > 0 ? formatINR(shipping) : <span className={styles.free}>Free</span>}</span>
                </div>
                <div className={`${styles.summaryRow} ${styles.summaryRowTotal}`}>
                  <span>Total</span>
                  <span className={styles.summaryAmount}>{formatINR(subtotal + shipping)}</span>
                </div>
                <button className={styles.checkoutBtn} disabled={placing} onClick={placeOrder}>
                  {placing ? 'Placing order…' : 'Place Order'}
                </button>
                {checkoutError && <p className={styles.checkoutError}>{checkoutError}</p>}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
