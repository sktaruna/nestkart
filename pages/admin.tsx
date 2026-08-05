import Head from 'next/head';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
/** Refund progress gets the same colour language as order status. */
const REFUND_PILL_CLASS: Record<string, string> = {
  pending: 'pillNeutral',
  processing: 'pillWarn',
  issued: 'pillGood',
  rejected: 'pillBad',
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

  /**
   * One toast, rather than a per-row status column.
   *
   * Every table previously carried a trailing column that existed only to hold a
   * transient "Saved" note and was empty the rest of the time — dead width in
   * four tables. The toast names the row it refers to, so nothing is lost.
   */
  const [toast, setToast] = useState<{ text: string; err: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, err = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, err });
    toastTimer.current = setTimeout(() => setToast(null), err ? 4000 : 2200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
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

  /** POST a JSON body, reload on success, and report the outcome as a toast. */
  const post = useCallback(
    async (url: string, body: unknown, label: string, reload: () => Promise<void>) => {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: PANEL_JSON_HEADERS,
          cache: 'no-store',
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (d.ok) {
          showToast(label);
          await reload();
        } else {
          showToast(d.message || `${label} failed`, true);
        }
      } catch {
        showToast(`${label} failed`, true);
      }
    },
    [showToast]
  );

  /**
   * Deletes a return, or reverts a seeded one to its seeded state.
   * Orders are reloaded too: dropping a damaged-on-arrival return can clear the
   * order's damage claim, so the Orders tab would otherwise show a stale flag.
   */
  async function deleteReturn(ret: AdminReturn) {
    const verb = ret.is_seed ? 'Revert' : 'Delete';
    if (!window.confirm(`${verb} ${ret.return_id}?`)) return;
    try {
      const r = await fetch(`/api/admin/returns/${ret.return_id}`, {
        method: 'DELETE',
        headers: PANEL_HEADERS,
        cache: 'no-store',
      });
      const d = await r.json();
      if (d.ok) {
        showToast(d.message || `${ret.return_id} deleted`);
        await Promise.all([loadReturns(), loadOrders()]);
      } else {
        showToast(d.message || `${verb} failed`, true);
      }
    } catch {
      showToast(`${verb} failed`, true);
    }
  }

  async function deleteOrder(orderId: string) {
    if (!window.confirm(`Delete order ${orderId}? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/orders/${orderId}`, {
        method: 'DELETE',
        headers: PANEL_HEADERS,
        cache: 'no-store',
      });
      const d = await r.json();
      if (d.ok) {
        setCustomers((prev) =>
          prev.map((c) => ({ ...c, orders: c.orders.filter((o) => o.order_id !== orderId) }))
        );
        showToast(`${orderId} deleted`);
        await loadOrders();
      } else {
        showToast(d.message || 'Delete failed', true);
      }
    } catch {
      showToast('Delete failed', true);
    }
  }

  function setStock(product: Product) {
    const val = parseInt(stockInputs[product.product_id], 10);
    if (isNaN(val) || val < 0) {
      showToast('Stock must be a whole number, 0 or more', true);
      return;
    }
    return post(
      `/api/admin/products/${product.product_id}/stock`,
      { stock: val },
      `${product.name} → ${val} in stock`,
      loadStock
    );
  }

  async function doReset() {
    setShowResetConfirm(false);
    try {
      const r = await fetch('/api/admin/reset', { method: 'POST', headers: PANEL_HEADERS, cache: 'no-store' });
      const d = await r.json();
      if (d.ok) {
        showToast('Demo data reset');
        await Promise.all([loadOrders(), loadReturns(), loadStock(), loadLog()]);
      }
    } catch {
      showToast('Reset failed', true);
    }
  }

  // Deliberately separate from Reset Demo: the log is a record of what happened,
  // and wiping it as a side effect of resetting data would throw away the trail
  // of the conversation you were debugging.
  async function clearLog() {
    try {
      const r = await fetch('/api/admin/log', { method: 'DELETE', headers: PANEL_HEADERS, cache: 'no-store' });
      if ((await r.json()).ok) {
        showToast('Request log cleared');
        await loadLog();
      }
    } catch {
      showToast('Could not clear log', true);
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

  const visibleLog = logExpanded ? log : log.slice(0, LOG_PREVIEW_COUNT);

  return (
    <div className={styles.body}>
      <Head>
        <title>Admin — NestKart</title>
      </Head>

      <header className={styles.topBar}>
        <div className={styles.adminHeader}>
          <div>
            <p className={styles.adminHeaderTitle}>NestKart Admin</p>
            <p className={styles.adminHeaderSub}>Agent testing control panel</p>
          </div>
          <div className={styles.headerActions}>
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
      </header>

      {showResetConfirm && (
        <div className={styles.resetConfirm}>
          <p className={styles.resetConfirmText}>
            Resets orders, carts, returns and stock to their seeded state. The request log is kept.
          </p>
          <button className={styles.resetOk} onClick={doReset}>Yes, reset</button>
          <button className={styles.resetCancel} onClick={() => setShowResetConfirm(false)}>Cancel</button>
        </div>
      )}

      <main className={styles.adminMain}>
        {/* ── ORDERS ────────────────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h1 className={styles.panelTitle}>Orders</h1>
              <p className={styles.panelNote}>
                Status gates what the agent may do: cancel and address changes need <code>processing</code>,
                returns need <code>delivered</code>. Backdate <strong>delivery</strong> more than 30 days to
                expire the return window.
              </p>
            </div>

            {ordersLoading ? (
              <p className={styles.emptyState}>Loading orders…</p>
            ) : customersWithOrders.length === 0 ? (
              <p className={styles.emptyState}>No orders yet.</p>
            ) : (
              <div className={styles.tableScroll}>
                {/* One table with a group row per customer, rather than a separate
                    table each — five repeated header rows was most of the visual
                    noise on this tab. */}
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Order</th><th>Items</th><th className={styles.alignRight}>Total</th>
                      <th>Status</th><th>Set status</th><th>Delivery</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customersWithOrders.map((cust) => (
                      <Fragment key={cust.customer_id}>
                        <tr className={styles.groupRow}>
                          <td colSpan={8}>
                            <span className={styles.groupName}>{cust.name}</span>
                            <span className={styles.groupId}>{cust.customer_id}</span>
                            <span className={styles.groupMeta}>
                              {cust.orders.length} order{cust.orders.length === 1 ? '' : 's'}
                            </span>
                          </td>
                        </tr>
                        {cust.orders.map((o) => (
                          <tr key={o.order_id}>
                            <td className={styles.idCell}>{o.order_id}</td>
                            <td className={styles.itemsCell}>
                              {(o.items || []).map((i) => `${i.product_name} ×${i.qty}`).join(', ')}
                            </td>
                            <td className={`${styles.alignRight} ${styles.nowrapCell}`}>{formatRs(o.price_total)}</td>
                            <td>
                              <span className={`status-pill status-pill--${o.status}`}>
                                {o.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td>
                              <select
                                className={styles.select}
                                value={o.status}
                                onChange={(e) =>
                                  post(
                                    `/api/admin/orders/${o.order_id}/set-status`,
                                    { status: e.target.value },
                                    `${o.order_id} → ${humanize(e.target.value)}`,
                                    loadOrders
                                  )
                                }
                              >
                                {VALID_STATUSES.map((s) => (
                                  <option key={s} value={s}>{humanize(s)}</option>
                                ))}
                              </select>
                            </td>
                            <td className={styles.nowrapCell}>
                              <div className={styles.inputGroup}>
                                <input
                                  className={styles.dateInput}
                                  type="date"
                                  value={deliveryInputs[o.order_id] ?? ''}
                                  onChange={(e) =>
                                    setDeliveryInputs((s) => ({ ...s, [o.order_id]: e.target.value }))
                                  }
                                />
                                <button
                                  className={styles.saveBtn}
                                  onClick={() =>
                                    post(
                                      `/api/admin/orders/${o.order_id}/flags`,
                                      { estimated_delivery: deliveryInputs[o.order_id] || null },
                                      `${o.order_id} delivery date saved`,
                                      loadOrders
                                    )
                                  }
                                >
                                  Save
                                </button>
                              </div>
                            </td>
                            <td className={styles.alignRight}>
                              {o.is_seed ? (
                                <span className={styles.seedTag} title="Seeded demo order — cannot be deleted">
                                  seed
                                </span>
                              ) : (
                                <button className={styles.deleteBtn} onClick={() => deleteOrder(o.order_id)}>
                                  Delete
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── RETURNS ───────────────────────────────────────────────────────── */}
        {tab === 'returns' && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h1 className={styles.panelTitle}>Returns &amp; Refunds</h1>
              <p className={styles.panelNote}>
                Drives what <code>GET /api/returns/:id</code> reports. <strong>Locked</strong> and{' '}
                <strong>Escalate</strong> are the two cases an agent handles worst — a refund it must not
                promise a date for, and a case it should hand to a human.
              </p>
            </div>

            {returnsLoading ? (
              <p className={styles.emptyState}>Loading returns…</p>
            ) : returns.length === 0 ? (
              <p className={styles.emptyState}>No returns yet. File one through the API to see it here.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Return</th><th>Reason</th>
                      <th>Return status</th><th>Refund status</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((ret) => (
                      <tr key={ret.return_id}>
                        {/* Customer folded in here as a second line: as its own
                            column it pushed this table past the viewport and clipped
                            the delete control off the right edge. */}
                        <td className={styles.idCell}>
                          <div className={styles.idStack}>
                            <span>
                              {ret.return_id}
                              {ret.is_seed && <span className={styles.seedTag}>seed</span>}
                            </span>
                            <span className={styles.idSub}>
                              {customerNames[ret.customer_id] || ret.customer_id}
                            </span>
                          </div>
                        </td>
                        {/* Sentence case, not uppercase: "ITEM NOT AS DESCRIBED" was
                            one of the widest columns in a table with no room. */}
                        <td className={styles.reasonCell}>{humanize(ret.reason)}</td>
                        <td>
                          <select
                            className={styles.select}
                            value={ret.status}
                            onChange={(e) =>
                              post(
                                `/api/admin/returns/${ret.return_id}/set-status`,
                                { status: e.target.value },
                                `${ret.return_id} → ${humanize(e.target.value)}`,
                                loadReturns
                              )
                            }
                          >
                            {RETURN_STATUSES.map((s) => (
                              <option key={s} value={s}>{humanize(s)}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {/* Select only, no pill beside it: the select already shows
                              the current value. Colour comes from its own accent. */}
                          <select
                            className={`${styles.select} ${styles[REFUND_PILL_CLASS[ret.refund_status]] || ''}`}
                            value={ret.refund_status}
                            onChange={(e) =>
                              post(
                                `/api/admin/returns/${ret.return_id}/set-status`,
                                { refund_status: e.target.value },
                                `${ret.return_id} refund → ${humanize(e.target.value)}`,
                                loadReturns
                              )
                            }
                          >
                            {REFUND_STATUSES.map((s) => (
                              <option key={s} value={s}>{humanize(s)}</option>
                            ))}
                          </select>
                        </td>
                        <td className={styles.nowrapCell}>
                          {/* Inline, like every other control on the row: deleting a
                              return used to need a full Reset Demo. A seeded return
                              can't be deleted, only reverted to its seeded state. */}
                          {/* Icon-width, not a "Delete"/"Revert" label: the word
                              carries no more meaning than the glyph, and the title
                              attribute spells it out on hover. */}
                          <button
                            className={styles.iconBtn}
                            aria-label={ret.is_seed ? `Revert ${ret.return_id}` : `Delete ${ret.return_id}`}
                            title={
                              ret.is_seed
                                ? 'Discard edits and restore this seeded return'
                                : 'Delete this return'
                            }
                            onClick={() => deleteReturn(ret)}
                          >
                            {ret.is_seed ? '⤺' : '×'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── INVENTORY ─────────────────────────────────────────────────────── */}
        {tab === 'inventory' && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h1 className={styles.panelTitle}>Inventory</h1>
              <p className={styles.panelNote}>
                Set stock to <code>0</code> to make cart-add and checkout fail with <code>out_of_stock</code>.
                1–3 units reports as <code>low_stock</code>.
              </p>
            </div>

            {stockLoading ? (
              <p className={styles.emptyState}>Loading inventory…</p>
            ) : products.length === 0 ? (
              <p className={styles.emptyState}>No products found.</p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Product</th><th>Category</th><th className={styles.alignRight}>Price</th>
                      <th className={styles.alignRight}>Stock</th><th>Status</th><th>Set stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.product_id}>
                        <td className={styles.nameCell}>{p.name}</td>
                        <td className={styles.mutedCell}>{p.category}</td>
                        <td className={`${styles.alignRight} ${styles.nowrapCell}`}>{formatRs(p.price)}</td>
                        <td className={`${styles.alignRight} ${styles.stockCount}`}>{p.stock}</td>
                        <td>
                          <span className={`${styles.pill} ${styles[STOCK_PILL_CLASS[p.stock_status]] || ''}`}>
                            {STOCK_LABELS[p.stock_status] || p.stock_status}
                          </span>
                        </td>
                        <td className={styles.nowrapCell}>
                          <div className={styles.inputGroup}>
                            <input
                              className={styles.stockInput}
                              type="number"
                              min={0}
                              step={1}
                              value={stockInputs[p.product_id] ?? ''}
                              onChange={(e) => setStockInputs((s) => ({ ...s, [p.product_id]: e.target.value }))}
                            />
                            <button className={styles.saveBtn} onClick={() => setStock(p)}>Save</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── REQUEST LOG ───────────────────────────────────────────────────── */}
        {tab === 'log' && (
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelHeadRow}>
                <h1 className={styles.panelTitle}>Request Log</h1>
                <div className={styles.headActions}>
                  {log.length > LOG_PREVIEW_COUNT && (
                    <button className={styles.ghostBtn} onClick={() => setLogExpanded((v) => !v)}>
                      {logExpanded ? `Latest ${LOG_PREVIEW_COUNT}` : `Show all ${log.length}`}
                    </button>
                  )}
                  <button className={styles.ghostBtn} onClick={clearLog}>Clear</button>
                </div>
              </div>
              <p className={styles.panelNote}>
                External callers only, newest first, capped at {LOG_CAP} — this panel&apos;s own requests are
                excluded, so what you see is the agent. Highlighted rows returned HTTP 200 with{' '}
                <code>ok: false</code>: a refusal an agent may report to the customer as success.
              </p>
            </div>

            {!logEnabled && (
              <p className={styles.warnNote}>
                Logging is off, so this stays empty even while the agent is calling the API. Set{' '}
                <code>REQUEST_LOG=1</code> and restart to enable it.
              </p>
            )}

            {logLoading ? (
              <p className={styles.emptyState}>Loading log…</p>
            ) : log.length === 0 ? (
              <p className={styles.emptyState}>
                {logEnabled ? 'No requests recorded yet.' : 'Nothing to show while logging is off.'}
              </p>
            ) : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th><th>Method</th><th>Path</th><th className={styles.alignRight}>HTTP</th>
                      <th>ok</th><th>Detail</th><th className={styles.alignRight}>ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLog.map((e, i) => {
                      // A 200 carrying ok:false is a business refusal, not a transport
                      // failure — the case an agent most often misreads as success.
                      const declined = e.status === 200 && e.ok === false;
                      return (
                        <tr key={`${e.ts}-${i}`} className={declined ? styles.rowDeclined : undefined}>
                          <td className={styles.monoMuted}>{e.ts.slice(11, 23)}</td>
                          <td className={styles.methodCell}>{e.method}</td>
                          <td className={styles.pathCell}>{e.path}</td>
                          <td className={`${styles.alignRight} ${e.status >= 400 ? styles.statusErr : styles.monoMuted}`}>
                            {e.status}
                          </td>
                          <td>
                            {e.ok === null ? (
                              <span className={styles.monoMuted}>—</span>
                            ) : (
                              <span className={e.ok ? styles.okTrue : styles.okFalse}>{String(e.ok)}</span>
                            )}
                          </td>
                          <td className={styles.detailCell}>
                            {declined && <div className={styles.declinedTag}>declined with HTTP 200</div>}
                            {e.error && <div className={styles.errorCode}>{e.error}</div>}
                            {e.reason && <div>{e.reason}</div>}
                            {e.body !== undefined && (
                              <div className={styles.bodyPreview}>{JSON.stringify(e.body)}</div>
                            )}
                          </td>
                          <td className={`${styles.alignRight} ${styles.monoMuted}`}>{e.ms}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {toast && (
        <div className={`${styles.toast} ${toast.err ? styles.toastErr : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}
