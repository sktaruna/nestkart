import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type Tab = 'orders' | 'returns' | 'inventory' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'returns', label: 'Returns' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'log', label: 'Request Log' },
];

const TAB_IDS = TABS.map((t) => t.id);

/**
 * Marks every request as coming from the panel so the request log skips it —
 * see SKIP_HEADER in lib/requestLog.ts. Without it the panel's own polling
 * dominates the log it is displaying.
 */
const PANEL_HEADERS = { 'X-Admin-Panel': '1' };
const PANEL_JSON_HEADERS = { ...PANEL_HEADERS, 'Content-Type': 'application/json' };

/** GET as the panel: never cached, never logged. */
const panelGet = (url: string) => fetch(url, { headers: PANEL_HEADERS, cache: 'no-store' });

/** "return_requested" -> "Return requested" */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Label for a flag checkbox: "Locked: Damage claim under review" when there's a
 * reason, plain "Locked" when there isn't. Seeded returns can carry a flag with
 * no reason (RET-2203 escalates without one), which rendered as a bare
 * "Escalate:" dangling a colon.
 */
function flagLabelText(on: string, off: string, active: boolean, reason?: string | null): string {
  if (!active) return off;
  return reason ? `${on}: ${humanize(reason)}` : on;
}

export default function AdminPage() {
  // Tab lives in the URL hash so a reload keeps your place and a tab can be
  // linked to (/admin#log). Initialised to 'orders' rather than read from the
  // hash here, because this component server-renders where `location` does not
  // exist — the hash is applied in an effect below.
  const [tab, setTab] = useState<Tab>('orders');

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '') as Tab;
      if (TAB_IDS.includes(h)) setTab(h);
    };
    fromHash();
    // Keeps the back button working between tabs.
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    window.location.hash = next;
  };

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
      const r = await panelGet('/api/admin/orders');
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
      const r = await panelGet('/api/admin/returns');
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
      const r = await panelGet('/api/products');
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
      const r = await panelGet('/api/admin/log');
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

  // Everything loads on mount rather than per-tab, so the tab counts are honest
  // before you've opened a tab. No background polling — refresh happens manually
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
          headers: PANEL_JSON_HEADERS,
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
      const r = await fetch(`/api/admin/orders/${orderId}`, { method: 'DELETE', headers: PANEL_HEADERS, cache: 'no-store' });
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
      const r = await fetch('/api/admin/reset', { method: 'POST', headers: PANEL_HEADERS, cache: 'no-store' });
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
      const r = await fetch('/api/admin/log', { method: 'DELETE', headers: PANEL_HEADERS, cache: 'no-store' });
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

  const orderCount = customers.reduce((sum, c) => sum + (c.orders?.length || 0), 0);
  const counts: Record<Tab, number | null> = useMemo(
    () => ({
      orders: ordersLoading ? null : orderCount,
      returns: returnsLoading ? null : returns.length,
      inventory: stockLoading ? null : products.length,
      log: logLoading ? null : log.length,
    }),
    [ordersLoading, orderCount, returnsLoading, returns.length, stockLoading, products.length, logLoading, log.length]
  );

  /** Renders the transient Saved/Error note for a row. */
  const flashFor = (key: string) => {
    const f = flash[key];
    if (!f) return null;
    return <span className={`${styles.flashOk} ${f.err ? styles.flashStockErr : ''}`}>{f.text}</span>;
  };

  return (
    <div className={styles.body}>
      <Head>
        <title>Admin — NestKart</title>
      </Head>

      {/* Header and tabs stay pinned so the controls remain reachable while a
          long table scrolls underneath. */}
      <div className={styles.topBar}>
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

        <nav className={styles.tabBar}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
              onClick={() => selectTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
              {counts[t.id] !== null && <span className={styles.tabCount}>{counts[t.id]}</span>}
            </button>
          ))}
        </nav>
      </div>

      {showResetConfirm && (
        <div className={styles.resetConfirm}>
          <p className={styles.resetConfirmText}>This will reset all demo data — orders, carts, returns, and stock. The request log is kept. Are you sure?</p>
          <button className={styles.resetOk} onClick={doReset}>Yes, Reset</button>
          <button className={styles.resetCancel} onClick={() => setShowResetConfirm(false)}>Cancel</button>
        </div>
      )}

      <div className={styles.adminMain}>
        {/* ── ORDERS ────────────────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <section>
            <div className={styles.panelHead}>
              <h1 className={styles.panelTitle}>Orders</h1>
              <p className={styles.panelNote}>
                Status drives what the agent may do: cancel and address changes need <code>processing</code>,
                returns need <code>delivered</code>. Backdate <strong>Est. Delivery</strong> past 30 days to
                expire the return window.
              </p>
            </div>

            {ordersLoading && <p className={styles.loadingNote}>Loading orders…</p>}
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
                  <div className={styles.tableScroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Order</th><th>Items</th><th>Total</th><th>Status</th><th>Set Status</th>
                          <th>Damage Claim</th><th>Est. Delivery</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cust.orders.map((o) => {
                          const items = (o.items || []).map((i) => `${i.product_name} x${i.qty}`).join(', ');
                          const key = `order:${o.order_id}`;
                          return (
                            <tr key={o.order_id}>
                              <td className={styles.orderIdCell}>{o.order_id}</td>
                              <td className={styles.itemsCell}>{items}</td>
                              <td className={styles.nowrapCell}>{formatRs(o.price_total)}</td>
                              <td>
                                <span className={`status-pill status-pill--${o.status}`}>
                                  {o.status.replace('_', ' ')}
                                </span>
                              </td>
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
                                  className={styles.saveBtn}
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
                              <td className={styles.rowActions}>
                                {flashFor(key)}
                                {!o.is_seed && (
                                  <button className={styles.deleteOrderBtn} onClick={() => deleteOrder(o.order_id)}>
                                    Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </section>
        )}

        {/* ── RETURNS ───────────────────────────────────────────────────────── */}
        {tab === 'returns' && (
          <section>
            <div className={styles.panelHead}>
              <h1 className={styles.panelTitle}>Returns &amp; Refunds</h1>
              <p className={styles.panelNote}>
                Drives what <code>GET /api/returns/:id</code> reports. <strong>Refund Locked</strong> and{' '}
                <strong>Escalate</strong> are the two cases an agent handles worst — a refund it must not
                promise a date for, and a case it should hand to a human.
              </p>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  {/* Refund-locked and escalation share one column: as two they
                      squeezed the table past the viewport and clipped Dates. */}
                  <tr>
                    <th>Return</th><th>Order</th><th>Customer</th><th>Item</th><th>Reason</th>
                    <th>Status</th><th>Refund</th><th>Flags</th><th>Dates</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {returnsLoading && (
                    <tr><td colSpan={10} className={styles.loadingNote}>Loading returns…</td></tr>
                  )}
                  {!returnsLoading && returns.length === 0 && (
                    <tr><td colSpan={10} className={styles.loadingNote}>No returns yet.</td></tr>
                  )}
                  {!returnsLoading && returns.map((ret) => {
                    const key = `return:${ret.return_id}`;
                    return (
                      <tr key={ret.return_id}>
                        <td className={styles.orderIdCell}>{ret.return_id}</td>
                        <td className={styles.orderIdCell}>{ret.order_id}</td>
                        <td className={styles.nowrapCell}>{customerNames[ret.customer_id] || ret.customer_id}</td>
                        <td className={styles.itemsCell}>{ret.item_name}</td>
                        <td className={styles.mutedCell}>{ret.reason}</td>
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
                        {/* Inner div does the stacking. Setting display:flex on the
                            <td> itself takes the cell out of table layout, so it
                            stops filling the row height and draws its border early. */}
                        <td>
                         <div className={styles.flagStack}>
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
                            {/* Reasons are humanized so they wrap at spaces. The raw
                                snake_case broke mid-word ("non_returnab le_item"). */}
                            <span>{flagLabelText('Locked', 'Not locked', ret.refund_locked, ret.refund_locked_reason)}</span>
                          </label>
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
                            <span>
                              {flagLabelText('Escalate', 'No escalation', ret.requires_agent_escalation, ret.escalation_reason)}
                            </span>
                          </label>
                         </div>
                        </td>
                        <td className={styles.datesCell}>
                          <div>Init <span>{ret.return_initiated || '—'}</span></div>
                          <div>Recv <span>{ret.return_received_date || '—'}</span></div>
                          <div>ETA <span>{ret.refund_estimated_date || '—'}</span></div>
                          <div>Paid <span>{ret.refund_issued_date || '—'}</span></div>
                        </td>
                        <td>{flashFor(key)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── INVENTORY ─────────────────────────────────────────────────────── */}
        {tab === 'inventory' && (
          <section>
            <div className={styles.panelHead}>
              <h1 className={styles.panelTitle}>Inventory</h1>
              <p className={styles.panelNote}>
                Set stock to 0 to make checkout and cart-add fail with <code>out_of_stock</code>; 1–3 reports
                as <code>low_stock</code>.
              </p>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Set Stock</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {stockLoading && (
                    <tr><td colSpan={7} className={styles.loadingNote}>Loading inventory…</td></tr>
                  )}
                  {!stockLoading && products.length === 0 && (
                    <tr><td colSpan={7} className={styles.loadingNote}>No products found.</td></tr>
                  )}
                  {!stockLoading && products.map((p) => (
                    <tr key={p.product_id}>
                      <td className={styles.stockName}>{p.name}</td>
                      <td className={styles.mutedCell}>{p.category}</td>
                      <td className={styles.nowrapCell}>{formatRs(p.price)}</td>
                      <td className={styles.stockCount}>{p.stock}</td>
                      <td>
                        <span className={`${styles.stockPill} ${styles[STOCK_PILL_CLASS[p.stock_status]] || ''}`}>
                          {STOCK_LABELS[p.stock_status] || p.stock_status}
                        </span>
                      </td>
                      <td className={styles.nowrapCell}>
                        <input
                          className={styles.stockInput}
                          type="number"
                          min={0}
                          step={1}
                          value={stockInputs[p.product_id] ?? ''}
                          onChange={(e) => setStockInputs((s) => ({ ...s, [p.product_id]: e.target.value }))}
                        />
                        <button className={styles.saveBtn} onClick={() => setStock(p.product_id)}>Save</button>
                      </td>
                      <td>{flashFor(`stock:${p.product_id}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── REQUEST LOG ───────────────────────────────────────────────────── */}
        {tab === 'log' && (
          <section>
            <div className={styles.panelHead}>
              <div className={styles.panelHeadRow}>
                <h1 className={styles.panelTitle}>Request Log</h1>
                <div>
                  {log.length > LOG_PREVIEW_COUNT && (
                    <button className={styles.linkBtn} onClick={() => setLogExpanded((v) => !v)}>
                      {logExpanded ? `Latest ${LOG_PREVIEW_COUNT}` : `All ${log.length}`}
                    </button>
                  )}
                  <button className={styles.linkBtn} onClick={clearLog}>Clear</button>
                </div>
              </div>
              <p className={styles.panelNote}>
                External callers only, newest first, capped at {LOG_CAP} — this panel&apos;s own requests are
                excluded, so what you see is the agent. Amber rows returned HTTP 200 with{' '}
                <code>ok: false</code>: a refusal an agent may report to the customer as success.
              </p>
            </div>

            {!logEnabled && (
              <p className={styles.logDisabledNote}>
                Logging is off, so this stays empty even while the agent is calling the API. Set{' '}
                <code>REQUEST_LOG=1</code> and restart to enable it.
              </p>
            )}

            {logLoading && <p className={styles.loadingNote}>Loading log…</p>}
            {!logLoading && logEnabled && log.length === 0 && (
              <p className={styles.loadingNote}>No requests recorded yet.</p>
            )}

            {!logLoading && log.length > 0 && (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
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
                              <span className={e.ok ? styles.logOkTrue : styles.logOkFalse}>{String(e.ok)}</span>
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
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
