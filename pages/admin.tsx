import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from '@/styles/Admin.module.css';
import { formatRs } from '@/lib/format';
import type { AdminCustomerOrders, AdminReturn, Order, Product, RequestLogEntry } from '@/lib/types';

const ORDER_STATUSES = ['processing', 'dispatched', 'in_transit', 'delivered', 'cancelled'];
const RETURN_STATUSES = [
  'return_requested',
  'return_in_transit',
  'return_received',
  'under_review',
  'completed',
  'rejected',
];
const REFUND_STATUSES = ['pending', 'processing', 'issued', 'rejected'];
const LOG_CAP = 500;

const STOCK_LABELS: Record<string, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};
const STOCK_TONE: Record<string, string> = {
  in_stock: 'toneGood',
  low_stock: 'toneWarn',
  out_of_stock: 'toneBad',
};
const REFUND_TONE: Record<string, string> = {
  pending: 'toneNeutral',
  processing: 'toneWarn',
  issued: 'toneGood',
  rejected: 'toneBad',
};
const RETURN_TONE: Record<string, string> = {
  return_requested: 'toneNeutral',
  return_in_transit: 'toneInfo',
  return_received: 'toneInfo',
  under_review: 'toneWarn',
  completed: 'toneGood',
  rejected: 'toneBad',
};
const ORDER_TONE: Record<string, string> = {
  processing: 'toneNeutral',
  dispatched: 'toneInfo',
  in_transit: 'toneInfo',
  delivered: 'toneGood',
  cancelled: 'toneBad',
};

type Tab = 'orders' | 'returns' | 'inventory' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'returns', label: 'Returns' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'log', label: 'Request log' },
];
const TAB_IDS = TABS.map((t) => t.id);

/**
 * Marks every request as coming from the panel so the request log skips it —
 * see SKIP_HEADER in lib/requestLog.ts. Without it the panel's own polling
 * dominates the log it is displaying.
 */
const PANEL_HEADERS = { 'X-Admin-Panel': '1' };
const PANEL_JSON_HEADERS = { ...PANEL_HEADERS, 'Content-Type': 'application/json' };
const panelGet = (url: string) => fetch(url, { headers: PANEL_HEADERS, cache: 'no-store' });

/** "return_requested" -> "Return requested" */
function humanize(value: string): string {
  const spaced = (value || '').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

interface Eligibility {
  eligible: boolean;
  reason: string;
  return_window_expires_on: string | null;
  days_remaining: number | null;
  refund_locked?: boolean;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('orders');

  // Tab lives in the URL hash so a reload keeps your place and a tab can be
  // linked to (/admin#log). Read in an effect, not at init: this component
  // server-renders, where `location` does not exist.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '') as Tab;
      if (TAB_IDS.includes(h)) setTab(h);
    };
    fromHash();
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
  const [log, setLog] = useState<RequestLogEntry[]>([]);
  const [logEnabled, setLogEnabled] = useState(true);

  const [loading, setLoading] = useState({ orders: true, returns: true, stock: true, log: true });
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Selection is by id, not index, so a reload after an action keeps the same
  // record selected even when the list order changes.
  const [selOrderId, setSelOrderId] = useState<string | null>(null);
  const [selReturnId, setSelReturnId] = useState<string | null>(null);
  const [selLogKey, setSelLogKey] = useState<string | null>(null);

  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [deliveryInput, setDeliveryInput] = useState('');
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);

  const [toast, setToast] = useState<{ text: string; err: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, err = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, err });
    toastTimer.current = setTimeout(() => setToast(null), err ? 4200 : 2200);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const done = (key: keyof typeof loading) =>
    setLoading((l) => (l[key] ? { ...l, [key]: false } : l));

  const loadOrders = useCallback(async () => {
    try {
      const d = await (await panelGet('/api/admin/orders')).json();
      if (d.ok) setCustomers(d.customers);
    } catch {
      /* ignore */
    } finally {
      done('orders');
    }
  }, []);

  const loadReturns = useCallback(async () => {
    try {
      const d = await (await panelGet('/api/admin/returns')).json();
      if (d.ok) setReturns(d.returns);
    } catch {
      /* ignore */
    } finally {
      done('returns');
    }
  }, []);

  const loadStock = useCallback(async () => {
    try {
      const d = await (await panelGet('/api/products')).json();
      if (d.ok) {
        const sorted = [...d.products].sort(
          (a: Product, b: Product) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
        );
        setProducts(sorted);
        setStockInputs(Object.fromEntries(sorted.map((p: Product) => [p.product_id, String(p.stock)])));
      }
    } catch {
      /* ignore */
    } finally {
      done('stock');
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const d = await (await panelGet('/api/admin/log')).json();
      if (d.ok) {
        setLog(d.entries);
        setLogEnabled(d.enabled);
      }
    } catch {
      /* ignore */
    } finally {
      done('log');
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadReturns();
    loadStock();
    loadLog();
  }, [loadOrders, loadReturns, loadStock, loadLog]);

  const allOrders: Order[] = useMemo(
    () => customers.flatMap((c) => c.orders || []),
    [customers]
  );
  const customerName = useCallback(
    (id: string) => customers.find((c) => c.customer_id === id)?.name || id,
    [customers]
  );

  const selOrder = allOrders.find((o) => o.order_id === selOrderId) || null;
  const selReturn = returns.find((r) => r.return_id === selReturnId) || null;
  const selLog = log.find((e, i) => `${e.ts}-${i}` === selLogKey) || null;

  // The delivery input is a draft the user edits, so it is only re-seeded when a
  // different order is picked — not on every reload, which would discard typing.
  useEffect(() => {
    setDeliveryInput(selOrder?.estimated_delivery || '');
  }, [selOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Shows what the agent would read for the selected order. Read-only, and
   * panel-flagged so it never appears in the request log.
   */
  useEffect(() => {
    if (!selOrderId) {
      setEligibility(null);
      return;
    }
    let live = true;
    panelGet(`/api/orders/${selOrderId}/return-eligibility`)
      .then((r) => r.json())
      .then((d) => {
        if (live && d.ok) setEligibility(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [selOrderId, customers]);

  /** POST a JSON body, reload on success, report the outcome as a toast. */
  const post = useCallback(
    async (url: string, body: unknown, label: string, reload: () => Promise<void>) => {
      try {
        const d = await (
          await fetch(url, {
            method: 'POST',
            headers: PANEL_JSON_HEADERS,
            cache: 'no-store',
            body: JSON.stringify(body),
          })
        ).json();
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

  const del = useCallback(
    async (url: string, label: string, reload: () => Promise<void>) => {
      try {
        const d = await (
          await fetch(url, { method: 'DELETE', headers: PANEL_HEADERS, cache: 'no-store' })
        ).json();
        if (d.ok) {
          showToast(d.message || label);
          await reload();
        } else {
          showToast(d.message || `${label} failed`, true);
        }
        return d.ok as boolean;
      } catch {
        showToast(`${label} failed`, true);
        return false;
      }
    },
    [showToast]
  );

  async function deleteOrder(orderId: string) {
    if (!window.confirm(`Delete order ${orderId}? This cannot be undone.`)) return;
    if (await del(`/api/admin/orders/${orderId}`, `${orderId} deleted`, loadOrders)) {
      setSelOrderId(null);
    }
  }

  async function deleteReturn(returnId: string) {
    if (!window.confirm(`Delete return ${returnId}?`)) return;
    if (await del(`/api/admin/returns/${returnId}`, `${returnId} deleted`, loadReturns)) {
      setSelReturnId(null);
      // Deleting a return can drop the order's damage claim, so orders are stale.
      await loadOrders();
    }
  }

  function setStock(p: Product) {
    const val = parseInt(stockInputs[p.product_id], 10);
    if (isNaN(val) || val < 0) {
      showToast('Stock must be a whole number, 0 or more', true);
      return;
    }
    return post(
      `/api/admin/products/${p.product_id}/stock`,
      { stock: val },
      `${p.name} → ${val} in stock`,
      loadStock
    );
  }

  async function refreshAll() {
    setLoading({ orders: true, returns: true, stock: true, log: true });
    await Promise.all([loadOrders(), loadReturns(), loadStock(), loadLog()]);
  }

  async function doReset() {
    setShowResetConfirm(false);
    try {
      const d = await (
        await fetch('/api/admin/reset', { method: 'POST', headers: PANEL_HEADERS, cache: 'no-store' })
      ).json();
      if (d.ok) {
        showToast('Demo data reset');
        setSelOrderId(null);
        setSelReturnId(null);
        await refreshAll();
      }
    } catch {
      showToast('Reset failed', true);
    }
  }

  // Deliberately separate from Reset Demo: the log records what happened, and
  // wiping it as a side effect of resetting data throws away the trail of the
  // conversation you were debugging.
  async function clearLog() {
    if (await del('/api/admin/log', 'Request log cleared', loadLog)) setSelLogKey(null);
  }

  const counts: Record<Tab, number | null> = {
    orders: loading.orders ? null : allOrders.length,
    returns: loading.returns ? null : returns.length,
    inventory: loading.stock ? null : products.length,
    log: loading.log ? null : log.length,
  };

  const Pill = ({ tone, children }: { tone: string; children: React.ReactNode }) => (
    <span className={`${styles.pill} ${styles[tone] || ''}`}>{children}</span>
  );

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );

  const Placeholder = ({ children }: { children: React.ReactNode }) => (
    <div className={styles.placeholder}>{children}</div>
  );

  return (
    <div className={styles.body}>
      <Head>
        <title>Admin — NestKart</title>
      </Head>

      <header className={styles.topBar}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.brand}>NestKart Admin</p>
            <p className={styles.brandSub}>Agent testing control panel</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.btnGhostDark} onClick={refreshAll}>Refresh</button>
            <button className={styles.btnDanger} onClick={() => setShowResetConfirm(true)}>Reset demo</button>
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
        <div className={styles.banner}>
          <p>Resets orders, carts, returns and stock to their seeded state. The request log is kept.</p>
          <button className={styles.btnDanger} onClick={doReset}>Yes, reset</button>
          <button className={styles.btnGhost} onClick={() => setShowResetConfirm(false)}>Cancel</button>
        </div>
      )}

      <main className={styles.main}>
        {/* ── ORDERS ────────────────────────────────────────────────────────── */}
        {tab === 'orders' && (
          <div className={styles.split}>
            <div className={styles.listPane}>
              <div className={styles.paneHead}>
                <h2 className={styles.paneTitle}>Orders</h2>
                <span className={styles.paneHint}>Pick one to edit it</span>
              </div>
              <div className={styles.scroll}>
                {loading.orders && <Placeholder>Loading…</Placeholder>}
                {!loading.orders && allOrders.length === 0 && <Placeholder>No orders yet.</Placeholder>}
                {!loading.orders &&
                  customers
                    .filter((c) => c.orders?.length)
                    .map((cust) => (
                      <div key={cust.customer_id}>
                        <div className={styles.groupLabel}>
                          {cust.name}
                          <span className={styles.groupId}>{cust.customer_id}</span>
                        </div>
                        {cust.orders.map((o) => (
                          <button
                            key={o.order_id}
                            className={`${styles.row} ${selOrderId === o.order_id ? styles.rowActive : ''}`}
                            onClick={() => setSelOrderId(o.order_id)}
                          >
                            <span className={styles.rowMain}>
                              <span className={styles.rowId}>{o.order_id}</span>
                              <span className={styles.rowSub}>
                                {(o.items || []).map((i) => `${i.product_name} ×${i.qty}`).join(', ')}
                              </span>
                            </span>
                            <span className={styles.rowSide}>
                              <Pill tone={ORDER_TONE[o.status]}>{o.status.replace('_', ' ')}</Pill>
                              <span className={styles.rowAmount}>{formatRs(o.price_total)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
              </div>
            </div>

            <aside className={styles.detailPane}>
              {!selOrder ? (
                <Placeholder>Select an order on the left to change its status, damage claim or delivery date.</Placeholder>
              ) : (
                <div className={styles.scroll}>
                  <div className={styles.detailHead}>
                    <h2 className={styles.detailTitle}>{selOrder.order_id}</h2>
                    <p className={styles.detailSub}>
                      {customerName(selOrder.customer_id)} · {selOrder.customer_id}
                      {selOrder.is_seed && <span className={styles.seedTag}>seed</span>}
                    </p>
                  </div>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Order</h3>
                    <Field label="Items">
                      {(selOrder.items || []).map((i) => (
                        <div key={i.product_id}>{i.product_name} ×{i.qty}</div>
                      ))}
                    </Field>
                    <Field label="Total">{formatRs(selOrder.price_total)}</Field>
                    <Field label="Placed">{selOrder.placed_at?.slice(0, 10) || '—'}</Field>
                    <Field label="Shipping">{humanize(selOrder.shipping_method)}</Field>
                    <Field label="Tracking">
                      {selOrder.tracking_number ? (
                        <span className={styles.mono}>{selOrder.tracking_number}</span>
                      ) : (
                        <span className={styles.muted}>none until dispatched</span>
                      )}
                    </Field>
                    <Field label="Address">
                      {selOrder.delivery_address
                        ? `${selOrder.delivery_address.street}, ${selOrder.delivery_address.city} ${selOrder.delivery_address.pincode}`
                        : '—'}
                    </Field>
                  </section>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>What the agent sees</h3>
                    <Field label="Cancellable">
                      {selOrder.cancellable ? 'yes' : <span className={styles.muted}>no</span>}
                    </Field>
                    <Field label="Returnable">
                      {eligibility ? (
                        <>
                          {eligibility.eligible ? 'yes' : <span className={styles.muted}>no</span>}
                          {eligibility.refund_locked && <Pill tone="toneWarn">refund locked</Pill>}
                          <div className={styles.reasonText}>{eligibility.reason}</div>
                        </>
                      ) : (
                        <span className={styles.muted}>…</span>
                      )}
                    </Field>
                  </section>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Controls</h3>
                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Status</span>
                      <select
                        className={styles.select}
                        value={selOrder.status}
                        onChange={(e) =>
                          post(
                            `/api/admin/orders/${selOrder.order_id}/set-status`,
                            { status: e.target.value },
                            `${selOrder.order_id} → ${humanize(e.target.value)}`,
                            loadOrders
                          )
                        }
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>{humanize(s)}</option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Damage claim</span>
                      <span className={styles.checkWrap}>
                        <input
                          type="checkbox"
                          checked={selOrder.damage_claim_active}
                          onChange={(e) =>
                            post(
                              `/api/admin/orders/${selOrder.order_id}/flags`,
                              { damage_claim_active: e.target.checked },
                              `${selOrder.order_id} damage claim ${e.target.checked ? 'opened' : 'cleared'}`,
                              loadOrders
                            )
                          }
                        />
                        <span className={styles.muted}>
                          {selOrder.damage_claim_active
                            ? 'active — free return, refund held'
                            : 'none'}
                        </span>
                      </span>
                    </label>

                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Delivery date</span>
                      <span className={styles.inputRow}>
                        <input
                          className={styles.input}
                          type="date"
                          value={deliveryInput}
                          onChange={(e) => setDeliveryInput(e.target.value)}
                        />
                        <button
                          className={styles.btnPrimary}
                          onClick={() =>
                            post(
                              `/api/admin/orders/${selOrder.order_id}/flags`,
                              { estimated_delivery: deliveryInput || null },
                              `${selOrder.order_id} delivery date saved`,
                              loadOrders
                            )
                          }
                        >
                          Save
                        </button>
                      </span>
                    </label>
                    <p className={styles.controlHint}>
                      Backdate more than 30 days to expire the return window.
                    </p>

                    {!selOrder.is_seed && (
                      <button className={styles.btnDangerGhost} onClick={() => deleteOrder(selOrder.order_id)}>
                        Delete order
                      </button>
                    )}
                  </section>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ── RETURNS ───────────────────────────────────────────────────────── */}
        {tab === 'returns' && (
          <div className={styles.split}>
            <div className={styles.listPane}>
              <div className={styles.paneHead}>
                <h2 className={styles.paneTitle}>Returns</h2>
                <span className={styles.paneHint}>Pick one to edit it</span>
              </div>
              <div className={styles.scroll}>
                {loading.returns && <Placeholder>Loading…</Placeholder>}
                {!loading.returns && returns.length === 0 && (
                  <Placeholder>No returns yet. File one through the API and it appears here.</Placeholder>
                )}
                {!loading.returns &&
                  returns.map((r) => (
                    <button
                      key={r.return_id}
                      className={`${styles.row} ${selReturnId === r.return_id ? styles.rowActive : ''}`}
                      onClick={() => setSelReturnId(r.return_id)}
                    >
                      <span className={styles.rowMain}>
                        <span className={styles.rowId}>
                          {r.return_id}
                          {(r.refund_locked || r.requires_agent_escalation) && (
                            <span className={styles.flagDot} title="Refund locked or escalated" />
                          )}
                        </span>
                        <span className={styles.rowSub}>{r.item_name}</span>
                      </span>
                      <span className={styles.rowSide}>
                        <Pill tone={RETURN_TONE[r.status]}>{r.status.replace(/_/g, ' ')}</Pill>
                        <Pill tone={REFUND_TONE[r.refund_status]}>{r.refund_status}</Pill>
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            <aside className={styles.detailPane}>
              {!selReturn ? (
                <Placeholder>Select a return on the left to move it through its lifecycle.</Placeholder>
              ) : (
                <div className={styles.scroll}>
                  <div className={styles.detailHead}>
                    <h2 className={styles.detailTitle}>{selReturn.return_id}</h2>
                    <p className={styles.detailSub}>
                      {selReturn.order_id} · {customerName(selReturn.customer_id)}
                      {selReturn.is_seed && <span className={styles.seedTag}>seed</span>}
                    </p>
                  </div>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Return</h3>
                    <Field label="Item">{selReturn.item_name}</Field>
                    <Field label="Reason">{humanize(selReturn.reason)}</Field>
                    <Field label="Refund">{selReturn.refund_amount || <span className={styles.muted}>not set</span>}</Field>
                    <Field label="Initiated">{selReturn.return_initiated || '—'}</Field>
                    <Field label="Received">{selReturn.return_received_date || <span className={styles.muted}>—</span>}</Field>
                    <Field label="Refund ETA">{selReturn.refund_estimated_date || <span className={styles.muted}>—</span>}</Field>
                    <Field label="Paid out">{selReturn.refund_issued_date || <span className={styles.muted}>—</span>}</Field>
                  </section>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Controls</h3>
                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Return status</span>
                      <select
                        className={styles.select}
                        value={selReturn.status}
                        onChange={(e) =>
                          post(
                            `/api/admin/returns/${selReturn.return_id}/set-status`,
                            { status: e.target.value },
                            `${selReturn.return_id} → ${humanize(e.target.value)}`,
                            loadReturns
                          )
                        }
                      >
                        {RETURN_STATUSES.map((s) => (
                          <option key={s} value={s}>{humanize(s)}</option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Refund</span>
                      <select
                        className={styles.select}
                        value={selReturn.refund_status}
                        onChange={(e) =>
                          post(
                            `/api/admin/returns/${selReturn.return_id}/set-status`,
                            { refund_status: e.target.value },
                            `${selReturn.return_id} refund → ${humanize(e.target.value)}`,
                            loadReturns
                          )
                        }
                      >
                        {REFUND_STATUSES.map((s) => (
                          <option key={s} value={s}>{humanize(s)}</option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Refund locked</span>
                      <span className={styles.checkWrap}>
                        <input
                          type="checkbox"
                          checked={selReturn.refund_locked}
                          onChange={(e) =>
                            post(
                              `/api/admin/returns/${selReturn.return_id}/flags`,
                              { refund_locked: e.target.checked },
                              `${selReturn.return_id} refund ${e.target.checked ? 'locked' : 'unlocked'}`,
                              loadReturns
                            )
                          }
                        />
                        <span className={styles.muted}>
                          {selReturn.refund_locked
                            ? humanize(selReturn.refund_locked_reason || 'held')
                            : 'not locked'}
                        </span>
                      </span>
                    </label>

                    <label className={styles.control}>
                      <span className={styles.controlLabel}>Escalate</span>
                      <span className={styles.checkWrap}>
                        <input
                          type="checkbox"
                          checked={selReturn.requires_agent_escalation}
                          onChange={(e) =>
                            post(
                              `/api/admin/returns/${selReturn.return_id}/flags`,
                              { requires_agent_escalation: e.target.checked },
                              `${selReturn.return_id} ${e.target.checked ? 'escalated' : 'escalation cleared'}`,
                              loadReturns
                            )
                          }
                        />
                        <span className={styles.muted}>
                          {selReturn.requires_agent_escalation
                            ? humanize(selReturn.escalation_reason || 'needs a human')
                            : 'no escalation'}
                        </span>
                      </span>
                    </label>
                    <p className={styles.controlHint}>
                      These two are what an agent handles worst: a refund it must not promise a date for,
                      and a case it should hand to a human.
                    </p>

                    <button className={styles.btnDangerGhost} onClick={() => deleteReturn(selReturn.return_id)}>
                      {selReturn.is_seed ? 'Revert seeded return' : 'Delete return'}
                    </button>
                  </section>
                </div>
              )}
            </aside>
          </div>
        )}

        {/* ── INVENTORY ─────────────────────────────────────────────────────────
            Left as a plain table: one control per row is not clutter, and a
            detail pane for a single number would be worse than the table.     */}
        {tab === 'inventory' && (
          <div className={styles.single}>
            <div className={styles.paneHead}>
              <h2 className={styles.paneTitle}>Inventory</h2>
              <span className={styles.paneHint}>
                0 makes cart-add and checkout fail with out_of_stock · 1–3 reports as low_stock
              </span>
            </div>
            <div className={styles.scroll}>
              {loading.stock && <Placeholder>Loading…</Placeholder>}
              {!loading.stock &&
                products.map((p) => (
                  <div key={p.product_id} className={styles.stockRow}>
                    <span className={styles.stockName}>{p.name}</span>
                    <span className={styles.stockCat}>{p.category}</span>
                    <span className={styles.stockPrice}>{formatRs(p.price)}</span>
                    <Pill tone={STOCK_TONE[p.stock_status]}>
                      {STOCK_LABELS[p.stock_status] || p.stock_status}
                    </Pill>
                    <span className={styles.inputRow}>
                      <input
                        className={styles.input}
                        type="number"
                        min={0}
                        step={1}
                        value={stockInputs[p.product_id] ?? ''}
                        onChange={(e) => setStockInputs((s) => ({ ...s, [p.product_id]: e.target.value }))}
                      />
                      <button className={styles.btnPrimary} onClick={() => setStock(p)}>Save</button>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── REQUEST LOG ───────────────────────────────────────────────────── */}
        {tab === 'log' && (
          <div className={styles.split}>
            <div className={styles.listPane}>
              <div className={styles.paneHead}>
                <h2 className={styles.paneTitle}>Request log</h2>
                <div className={styles.headerActions}>
                  <button className={styles.btnGhost} onClick={clearLog}>Clear</button>
                </div>
              </div>
              {!logEnabled && (
                <p className={styles.warnNote}>
                  Logging is off. Set <code>REQUEST_LOG=1</code> and restart to record requests.
                </p>
              )}
              <div className={styles.scroll}>
                {loading.log && <Placeholder>Loading…</Placeholder>}
                {!loading.log && log.length === 0 && (
                  <Placeholder>
                    {logEnabled ? 'No requests recorded yet.' : 'Nothing to show while logging is off.'}
                  </Placeholder>
                )}
                {!loading.log &&
                  log.map((e, i) => {
                    const key = `${e.ts}-${i}`;
                    // A 200 carrying ok:false is a business refusal, not a transport
                    // failure — the case an agent most often misreads as success.
                    const declined = e.status === 200 && e.ok === false;
                    return (
                      <button
                        key={key}
                        className={`${styles.row} ${styles.logRow} ${selLogKey === key ? styles.rowActive : ''} ${declined ? styles.rowFlagged : ''}`}
                        onClick={() => setSelLogKey(key)}
                      >
                        <span className={styles.logTime}>{e.ts.slice(11, 19)}</span>
                        <span className={styles.logMethod}>{e.method}</span>
                        <span className={styles.logPath}>{e.path}</span>
                        <span className={e.status >= 400 ? styles.logBad : styles.logCode}>{e.status}</span>
                        {declined && <span className={styles.declinedDot} title="Declined with HTTP 200" />}
                      </button>
                    );
                  })}
              </div>
              <p className={styles.paneFoot}>
                External callers only, newest first, capped at {LOG_CAP}. This panel&apos;s own requests are
                excluded, so what you see is the agent.
              </p>
            </div>

            <aside className={styles.detailPane}>
              {!selLog ? (
                <Placeholder>Select a request to see its body and outcome.</Placeholder>
              ) : (
                <div className={styles.scroll}>
                  <div className={styles.detailHead}>
                    <h2 className={styles.detailTitle}>
                      {selLog.method} {selLog.status}
                    </h2>
                    <p className={styles.detailSub}>{selLog.ts.replace('T', ' ').replace('Z', ' UTC')}</p>
                  </div>

                  {selLog.status === 200 && selLog.ok === false && (
                    <div className={styles.calloutWarn}>
                      <strong>Declined with HTTP 200.</strong> The request succeeded at the transport level but
                      the action was refused. An agent branching on the status code alone reports this to the
                      customer as done.
                    </div>
                  )}

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Request</h3>
                    <Field label="Path"><span className={styles.mono}>{selLog.path}</span></Field>
                    <Field label="Duration">{selLog.ms} ms</Field>
                    <Field label="Body">
                      {selLog.body !== undefined ? (
                        <pre className={styles.codeBlock}>{JSON.stringify(selLog.body, null, 2)}</pre>
                      ) : (
                        <span className={styles.muted}>none</span>
                      )}
                    </Field>
                  </section>

                  <section className={styles.section}>
                    <h3 className={styles.sectionTitle}>Outcome</h3>
                    <Field label="HTTP">{selLog.status}</Field>
                    <Field label="ok">
                      {selLog.ok === null ? (
                        <span className={styles.muted}>not JSON</span>
                      ) : (
                        <span className={selLog.ok ? styles.okTrue : styles.okFalse}>{String(selLog.ok)}</span>
                      )}
                    </Field>
                    {selLog.error && <Field label="Error"><span className={styles.mono}>{selLog.error}</span></Field>}
                    {selLog.reason && <Field label="Reason">{selLog.reason}</Field>}
                  </section>
                </div>
              )}
            </aside>
          </div>
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
