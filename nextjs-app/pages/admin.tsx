import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import styles from '@/styles/Admin.module.css';
import { formatRs } from '@/lib/format';
import type { AdminCustomerOrders, Product } from '@/lib/types';

const VALID_STATUSES = ['processing', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
const STOCK_LABELS: Record<string, string> = { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock' };
const STOCK_PILL_CLASS: Record<string, string> = {
  in_stock: 'stockPillInStock',
  low_stock: 'stockPillLowStock',
  out_of_stock: 'stockPillOutOfStock',
};

export default function AdminPage() {
  const [customers, setCustomers] = useState<AdminCustomerOrders[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [flashOrderId, setFlashOrderId] = useState<string | null>(null);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [stockFlash, setStockFlash] = useState<Record<string, { text: string; err: boolean }>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/orders', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) setCustomers(d.customers);
    } catch {
      /* ignore */
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadStock = useCallback(async () => {
    try {
      const r = await fetch('/api/products', { headers: { 'X-Api-Key': 'nk-fin-dev-key-2025' }, cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        const sorted = [...d.products].sort(
          (a: Product, b: Product) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        );
        setProducts(sorted);
        const inputs: Record<string, string> = {};
        sorted.forEach((p: Product) => {
          inputs[p.product_id] = String(p.stock);
        });
        setStockInputs(inputs);
      }
    } catch {
      /* ignore */
    } finally {
      setStockLoading(false);
    }
  }, []);

  // Load once on mount. No background polling — refresh happens manually
  // (Refresh button) or automatically right after an admin action succeeds.
  useEffect(() => {
    loadOrders();
    loadStock();
  }, [loadOrders, loadStock]);

  async function setStatus(orderId: string, status: string) {
    try {
      const r = await fetch(`/api/admin/orders/${orderId}/set-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ status }),
      });
      const d = await r.json();
      if (d.ok) {
        setFlashOrderId(orderId);
        setTimeout(() => setFlashOrderId((cur) => (cur === orderId ? null : cur)), 2000);
        await loadOrders();
      }
    } catch {
      /* ignore */
    }
  }

  async function deleteOrder(orderId: string) {
    if (!window.confirm(`Delete order ${orderId}? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/orders/${orderId}`, { method: 'DELETE', cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        // Remove immediately from local state...
        setCustomers((prev) =>
          prev.map((c) => ({ ...c, orders: c.orders.filter((o) => o.order_id !== orderId) }))
        );
        // ...and re-fetch to stay perfectly in sync with the server.
        await loadOrders();
      }
    } catch {
      /* ignore */
    }
  }

  async function setStock(productId: string) {
    const raw = stockInputs[productId];
    const val = parseInt(raw, 10);
    if (isNaN(val) || val < 0) {
      setStockFlash((f) => ({ ...f, [productId]: { text: 'Invalid value', err: true } }));
      setTimeout(() => setStockFlash((f) => ({ ...f, [productId]: undefined as any })), 2500);
      return;
    }
    try {
      const r = await fetch(`/api/admin/products/${productId}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ stock: val }),
      });
      const d = await r.json();
      if (d.ok) {
        setStockFlash((f) => ({ ...f, [productId]: { text: 'Saved', err: false } }));
        setTimeout(() => setStockFlash((f) => ({ ...f, [productId]: undefined as any })), 2000);
        await loadStock();
      } else {
        setStockFlash((f) => ({ ...f, [productId]: { text: 'Error', err: true } }));
        setTimeout(() => setStockFlash((f) => ({ ...f, [productId]: undefined as any })), 2500);
      }
    } catch {
      setStockFlash((f) => ({ ...f, [productId]: { text: 'Failed', err: true } }));
      setTimeout(() => setStockFlash((f) => ({ ...f, [productId]: undefined as any })), 2500);
    }
  }

  async function doReset() {
    setShowResetConfirm(false);
    try {
      const r = await fetch('/api/admin/reset', { method: 'POST', cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        await Promise.all([loadOrders(), loadStock()]);
      }
    } catch {
      /* ignore */
    }
  }

  async function refreshAll() {
    setOrdersLoading(true);
    setStockLoading(true);
    await Promise.all([loadOrders(), loadStock()]);
  }

  const customersWithOrders = customers.filter((c) => c.orders && c.orders.length > 0);

  return (
    <div className={styles.body}>
      <Head>
        <title>Admin — NestKart</title>
      </Head>

      <div className={styles.adminHeader}>
        <div>
          <p className={styles.adminHeaderTitle}>NestKart Admin</p>
          <p className={styles.adminHeaderSub}>Demo control panel</p>
        </div>
        <div>
          <button className={styles.refreshBtn} onClick={refreshAll}>Refresh</button>
          <button className={styles.resetBtn} onClick={() => setShowResetConfirm(true)}>Reset Demo</button>
        </div>
      </div>

      {showResetConfirm && (
        <div className={styles.resetConfirm}>
          <p className={styles.resetConfirmText}>This will reset all demo data — orders, carts, returns, status overrides, and stock. Are you sure?</p>
          <button className={styles.resetOk} onClick={doReset}>Yes, Reset</button>
          <button className={styles.resetCancel} onClick={() => setShowResetConfirm(false)}>Cancel</button>
        </div>
      )}

      <div className={styles.adminMain}>
        <div className={styles.adminStatusBar}>
          <h1 className={styles.adminTitle}>All Orders</h1>
          <p className={styles.pollIndicator}>Updated manually — use Refresh or take an action to reload.</p>
        </div>

        {ordersLoading && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Loading orders...</p>}
        {!ordersLoading && customersWithOrders.length === 0 && (
          <p style={{ color: 'var(--muted)' }}>No orders found.</p>
        )}
        {!ordersLoading &&
          customersWithOrders.map((cust) => (
            <div className={styles.customerSection} key={cust.customer_id}>
              <div className={styles.customerSectionHeader}>
                <span className={styles.customerSectionName}>{cust.name}</span>
                <span className={styles.customerSectionId}>{cust.customer_id}</span>
              </div>
              <table className={styles.ordersTable}>
                <thead>
                  <tr>
                    <th>Order ID</th><th>Items</th><th>Total</th><th>Status</th><th>Set Status</th><th></th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {cust.orders.map((o) => {
                    const items = (o.items || []).map((i) => `${i.product_name} x${i.qty}`).join(', ');
                    return (
                      <tr key={o.order_id}>
                        <td className={styles.orderIdCell}>{o.order_id}</td>
                        <td className={styles.itemsCell}>{items}</td>
                        <td>{formatRs(o.price_total)}</td>
                        <td><span className={`status-pill status-pill--${o.status}`}>{o.status.replace('_', ' ')}</span></td>
                        <td>
                          <select
                            className={styles.statusSelect}
                            value={o.status}
                            onChange={(e) => setStatus(o.order_id, e.target.value)}
                          >
                            {VALID_STATUSES.map((s) => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {flashOrderId === o.order_id && <span className={styles.flashOk}>Updated</span>}
                        </td>
                        <td>
                          {!o.is_seed && (
                            <button className={styles.deleteOrderBtn} onClick={() => deleteOrder(o.order_id)}>Delete</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

        {/* INVENTORY */}
        <div className={styles.sectionDivider}>
          <h1 className={styles.adminTitle}>Inventory</h1>
        </div>
        <table className={styles.stockTable}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Set Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {stockLoading && (
              <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>Loading inventory...</td></tr>
            )}
            {!stockLoading && products.length === 0 && (
              <tr><td colSpan={7} style={{ color: 'var(--muted)' }}>No products found.</td></tr>
            )}
            {!stockLoading && products.map((p) => {
              const flash = stockFlash[p.product_id];
              return (
                <tr key={p.product_id}>
                  <td className={styles.stockName}>{p.name}</td>
                  <td className={styles.stockCategory}>{p.category}</td>
                  <td>{formatRs(p.price)}</td>
                  <td className={styles.stockCount}>{p.stock}</td>
                  <td>
                    <span className={`${styles.stockPill} ${styles[STOCK_PILL_CLASS[p.stock_status]] || ''}`}>
                      {STOCK_LABELS[p.stock_status] || p.stock_status}
                    </span>
                  </td>
                  <td>
                    <input
                      className={styles.stockInput}
                      type="number"
                      min={0}
                      step={1}
                      value={stockInputs[p.product_id] ?? ''}
                      onChange={(e) => setStockInputs((s) => ({ ...s, [p.product_id]: e.target.value }))}
                    />
                    <button className={styles.stockSaveBtn} onClick={() => setStock(p.product_id)}>Save</button>
                  </td>
                  <td>
                    {flash && (
                      <span className={`${styles.flashStock} ${flash.err ? styles.flashStockErr : ''}`}>{flash.text}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
