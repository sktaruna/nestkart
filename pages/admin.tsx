import Head from 'next/head';
import { useCallback, useEffect, useState } from 'react';
import styles from '@/styles/Admin.module.css';
import { formatRs } from '@/lib/format';
import type { AdminCustomerOrders, AdminReturn, Product, RequestLogEntry } from '@/lib/types';

const VALID_STATUSES = ['processing', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
const RETURN_STATUSES = [
  'return_requested',
  'return_in_transit',
  'return_received',
  'under_review',
  'completed',
  'rejected',
];
const REFUND_STATUSES = ['pending', 'processing', 'issued', 'rejected'];
/** Rows shown before "Show all" — enough to cover one agent conversation. */
const LOG_PREVIEW_COUNT = 25;
/** Mirrors MAX_ENTRIES in lib/requestLog.ts; display only. */
const LOG_CAP = 500;
const STOCK_LABELS: Record<string, string> = { in_stock: 'In Stock', low_stock: 'Low Stock', out_of_stock: 'Out of Stock' };
const STOCK_PILL_CLASS: Record<string, string> = {
  in_stock: 'stockPillInStock',
  low_stock: 'stockPillLowStock',
  out_of_stock: 'stockPillOutOfStock',
};

/** "return_requested" -> "Return requested" */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function AdminPage() {
  const [customers, setCustomers] = useState<AdminCustomerOrders[]>([]);
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [deliveryInputs, setDeliveryInputs] = useState<Record<string, string>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [returnsLoading, setReturnsLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);

  const [log, setLog] = useState<RequestLogEntry[]>([]);
  const [logEnabled, setLogEnabled] = useState(true);
  const [logLoading, setLogLoading] = useState(true);
  const [logExpanded, setLogExpanded] = useState(false);

  // One keyed map for every transient "Saved"/"Error" note on the page, so each
  // new control doesn't bring its own piece of flash state along with it.
  const [flash, setFlash] = useState<Record<string, { text: string; err: boolean }>>({});

  const showFlash = useCallback((key: string, text: string, err = false) => {
    setFlash((f) => ({ ...f, [key]: { text, err } }));
    setTimeout(() => {
      setFlash((f) => {
        if (f[key]?.text !== text) return f; // a newer note replaced this one
        const next = { ...f };
        delete next[key];
        return next;
      });
    }, err ? 2500 : 2000);
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/orders', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        setCustomers(d.customers);
        const inputs: Record<string, string> = {};
        (d.customers as AdminCustomerOrders[]).forEach((c) =>
          c.orders.forEach((o) => {
            inputs[o.order_id] = o.estimated_delivery || '';
          })
        );
        setDeliveryInputs(inputs);
      }
    } catch {
      /* ignore */
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadReturns = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/returns', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) setReturns(d.returns);
    } catch {
      /* ignore */
    } finally {
      setReturnsLoading(false);
    }
  }, []);

  const loadStock = useCallback(async () => {
    try {
      const r = await fetch('/api/products', { cache: 'no-store' });
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

  const loadLog = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/log', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        setLog(d.entries);
        setLogEnabled(d.enabled);
      }
    } catch {
      /* ignore */
    } finally {
      setLogLoading(false);
    }
  }, []);

  // Load once on mount. No background polling — refresh happens manually
  // (Refresh button) or automatically right after an admin action succeeds.
  useEffect(() => {
    loadOrders();
    loadReturns();
    loadStock();
    loadLog();
  }, [loadOrders, loadReturns, loadStock, loadLog]);

  /** POST a JSON body and reload on success, flashing the outcome under `key`. */
  const post = useCallback(
    async (url: string, body: unknown, key: string, reload: () => Promise<void>, okText = 'Saved') => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.ok) {
          showFlash(key, okText);
          await reload();
        } else {
          showFlash(key, d.message || 'Error', true);
        }
      } catch {
        showFlash(key, 'Failed', true);
      }
    },
    [showFlash]
  );

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

  function setStock(productId: string) {
    const val = parseInt(stockInputs[productId], 10);
    if (isNaN(val) || val < 0) {
      showFlash(`stock:${productId}`, 'Invalid value', true);
      return;
    }
    return post(`/api/admin/products/${productId}/stock`, { stock: val }, `stock:${productId}`, loadStock);
  }

  async function doReset() {
    setShowResetConfirm(false);
    try {
      const r = await fetch('/api/admin/reset', { method: 'POST', cache: 'no-store' });
      const d = await r.json();
      if (d.ok) await Promise.all([loadOrders(), loadReturns(), loadStock(), loadLog()]);
    } catch {
      /* ignore */
    }
  }

  // Deliberately separate from Reset Demo: the log is a record of what happened,
  // and wiping it as a side effect of resetting data would throw away the trail
  // of the conversation you were debugging.
  async function clearLog() {
    try {
      const r = await fetch('/api/admin/log', { method: 'DELETE', cache: 'no-store' });
      if ((await r.json()).ok) await loadLog();
    } catch {
      /* ignore */
    }
  }

  async function refreshAll() {
    setOrdersLoading(true);
    setReturnsLoading(true);
    setStockLoading(true);
    setLogLoading(true);
    await Promise.all([loadOrders(), loadReturns(), loadStock(), loadLog()]);
  }

  const customersWithOrders = customers.filter((c) => c.orders && c.orders.length > 0);
  const customerNames: Record<string, string> = {};
  customers.forEach((c) => {
    customerNames[c.customer_id] = c.name;
  });

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
        {/* REQUEST LOG — first because it's the live view during an agent test. */}
        <div className={styles.adminStatusBar}>
          <h1 className={styles.adminTitle}>Request Log</h1>
          <div className={styles.statusBarRight}>
            {log.length > LOG_PREVIEW_COUNT && (
              <button className={styles.linkBtn} onClick={() => setLogExpanded((v) => !v)}>
                {logExpanded ? `Show latest ${LOG_PREVIEW_COUNT}` : `Show all ${log.length}`}
              </button>
            )}
            <button className={styles.linkBtn} onClick={clearLog}>Clear</button>
          </div>
        </div>

        {!logEnabled && (
          <p className={styles.logDisabledNote}>
            Logging is off, so this table stays empty even while the agent is calling the API. Set{' '}
            <code>REQUEST_LOG=1</code> and restart to enable it.
          </p>
        )}

        {logLoading && <p className={styles.loadingNote}>Loading log...</p>}
        {!logLoading && logEnabled && log.length === 0 && (
          <p className={styles.loadingNote}>No requests recorded yet.</p>
        )}

        {!logLoading && log.length > 0 && (
          <>
            <table className={styles.logTable}>
              <thead>
                <tr>
                  <th>Time</th><th>Method</th><th>Path</th><th>HTTP</th><th>ok</th><th>Detail</th><th>ms</th>
                </tr>
              </thead>
              <tbody>
                {(logExpanded ? log : log.slice(0, LOG_PREVIEW_COUNT)).map((e, i) => {
                  // A 200 carrying ok:false is a business refusal, not a transport
                  // failure — the case an agent most often misreads as success.
                  const declined = e.status === 200 && e.ok === false;
                  return (
                    <tr key={`${e.ts}-${i}`} className={declined ? styles.logRowDeclined : undefined}>
                      <td className={styles.logTime}>{e.ts.slice(11, 23)}</td>
                      <td className={styles.logMethod}>{e.method}</td>
                      <td className={styles.logPath}>{e.path}</td>
                      <td className={e.status >= 400 ? styles.logStatusErr : undefined}>{e.status}</td>
                      <td>
                        {e.ok === null ? '—' : (
                          <span className={e.ok ? styles.logOkTrue : styles.logOkFalse}>
                            {String(e.ok)}
                          </span>
                        )}
                      </td>
                      <td className={styles.logDetail}>
                        {declined && <div className={styles.logDeclinedTag}>declined with HTTP 200</div>}
                        {e.error && <div><strong>{e.error}</strong></div>}
                        {e.reason && <div>{e.reason}</div>}
                        {e.body !== undefined && (
                          <div className={styles.logBody}>{JSON.stringify(e.body)}</div>
                        )}
                      </td>
                      <td className={styles.logMs}>{e.ms}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={styles.pollIndicator}>
              Newest first, capped at {LOG_CAP} entries. Admin panel requests are not logged.
            </p>
          </>
        )}

        <div className={styles.sectionDivider}>
          <h1 className={styles.adminTitle}>All Orders</h1>
          <p className={styles.pollIndicator}>Updated manually — use Refresh or take an action to reload.</p>
        </div>

        {ordersLoading && <p className={styles.loadingNote}>Loading orders...</p>}
        {!ordersLoading && customersWithOrders.length === 0 && (
          <p className={styles.loadingNote}>No orders found.</p>
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
                    <th>Order ID</th><th>Items</th><th>Total</th><th>Status</th><th>Set Status</th>
                    <th>Damage Claim</th><th>Est. Delivery</th><th></th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {cust.orders.map((o) => {
                    const items = (o.items || []).map((i) => `${i.product_name} x${i.qty}`).join(', ');
                    const key = `order:${o.order_id}`;
                    const f = flash[key];
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
                            onChange={(e) =>
                              post(`/api/admin/orders/${o.order_id}/set-status`, { status: e.target.value }, key, loadOrders, 'Updated')
                            }
                          >
                            {VALID_STATUSES.map((s) => (
                              <option key={s} value={s}>{humanize(s)}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <label className={styles.flagLabel}>
                            <input
                              type="checkbox"
                              checked={o.damage_claim_active}
                              onChange={(e) =>
                                post(
                                  `/api/admin/orders/${o.order_id}/flags`,
                                  { damage_claim_active: e.target.checked },
                                  key,
                                  loadOrders,
                                  e.target.checked ? 'Claim on' : 'Claim off'
                                )
                              }
                            />
                            <span>{o.damage_claim_active ? 'Active' : 'None'}</span>
                          </label>
                        </td>
                        <td className={styles.nowrapCell}>
                          <input
                            className={styles.dateInput}
                            type="date"
                            value={deliveryInputs[o.order_id] ?? ''}
                            onChange={(e) => setDeliveryInputs((s) => ({ ...s, [o.order_id]: e.target.value }))}
                          />
                          <button
                            className={styles.stockSaveBtn}
                            onClick={() =>
                              post(
                                `/api/admin/orders/${o.order_id}/flags`,
                                { estimated_delivery: deliveryInputs[o.order_id] || null },
                                key,
                                loadOrders
                              )
                            }
                          >
                            Save
                          </button>
                        </td>
                        <td>
                          {f && <span className={`${styles.flashOk} ${f.err ? styles.flashStockErr : ''}`}>{f.text}</span>}
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

        {/* RETURNS & REFUNDS */}
        <div className={styles.sectionDivider}>
          <h1 className={styles.adminTitle}>Returns &amp; Refunds</h1>
          <p className={styles.pollIndicator}>
            Drives what <code>GET /api/returns/:id</code> reports — status, refund progress, and the
            refund-locked / escalation flags.
          </p>
        </div>
        <table className={styles.returnsTable}>
          <thead>
            <tr>
              <th>Return</th><th>Order</th><th>Customer</th><th>Item</th><th>Reason</th>
              <th>Status</th><th>Refund</th><th>Refund Locked</th><th>Escalate</th><th>Dates</th><th></th>
            </tr>
          </thead>
          <tbody>
            {returnsLoading && (
              <tr><td colSpan={11} className={styles.loadingNote}>Loading returns...</td></tr>
            )}
            {!returnsLoading && returns.length === 0 && (
              <tr><td colSpan={11} className={styles.loadingNote}>No returns yet.</td></tr>
            )}
            {!returnsLoading && returns.map((ret) => {
              const key = `return:${ret.return_id}`;
              const f = flash[key];
              return (
                <tr key={ret.return_id}>
                  <td className={styles.orderIdCell}>{ret.return_id}</td>
                  <td className={styles.orderIdCell}>{ret.order_id}</td>
                  <td>{customerNames[ret.customer_id] || ret.customer_id}</td>
                  <td className={styles.itemsCell}>{ret.item_name}</td>
                  <td className={styles.stockCategory}>{ret.reason}</td>
                  <td>
                    <select
                      className={styles.statusSelect}
                      value={ret.status}
                      onChange={(e) =>
                        post(`/api/admin/returns/${ret.return_id}/set-status`, { status: e.target.value }, key, loadReturns, 'Updated')
                      }
                    >
                      {RETURN_STATUSES.map((s) => (
                        <option key={s} value={s}>{humanize(s)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className={styles.statusSelect}
                      value={ret.refund_status}
                      onChange={(e) =>
                        post(`/api/admin/returns/${ret.return_id}/set-status`, { refund_status: e.target.value }, key, loadReturns, 'Updated')
                      }
                    >
                      {REFUND_STATUSES.map((s) => (
                        <option key={s} value={s}>{humanize(s)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <label className={styles.flagLabel}>
                      <input
                        type="checkbox"
                        checked={ret.refund_locked}
                        onChange={(e) =>
                          post(
                            `/api/admin/returns/${ret.return_id}/flags`,
                            { refund_locked: e.target.checked },
                            key,
                            loadReturns,
                            e.target.checked ? 'Locked' : 'Unlocked'
                          )
                        }
                      />
                      <span>{ret.refund_locked ? ret.refund_locked_reason : 'No'}</span>
                    </label>
                  </td>
                  <td>
                    <label className={styles.flagLabel}>
                      <input
                        type="checkbox"
                        checked={ret.requires_agent_escalation}
                        onChange={(e) =>
                          post(
                            `/api/admin/returns/${ret.return_id}/flags`,
                            { requires_agent_escalation: e.target.checked },
                            key,
                            loadReturns,
                            e.target.checked ? 'Escalated' : 'Cleared'
                          )
                        }
                      />
                      <span>{ret.requires_agent_escalation ? ret.escalation_reason : 'No'}</span>
                    </label>
                  </td>
                  <td className={styles.datesCell}>
                    <div>Initiated {ret.return_initiated || '—'}</div>
                    <div>Received {ret.return_received_date || '—'}</div>
                    <div>Refund ETA {ret.refund_estimated_date || '—'}</div>
                    <div>Issued {ret.refund_issued_date || '—'}</div>
                  </td>
                  <td>
                    {f && <span className={`${styles.flashOk} ${f.err ? styles.flashStockErr : ''}`}>{f.text}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

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
              <tr><td colSpan={7} className={styles.loadingNote}>Loading inventory...</td></tr>
            )}
            {!stockLoading && products.length === 0 && (
              <tr><td colSpan={7} className={styles.loadingNote}>No products found.</td></tr>
            )}
            {!stockLoading && products.map((p) => {
              const f = flash[`stock:${p.product_id}`];
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
                    {f && (
                      <span className={`${styles.flashStock} ${f.err ? styles.flashStockErr : ''}`}>{f.text}</span>
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
