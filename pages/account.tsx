import Head from 'next/head';
import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import styles from '@/styles/Account.module.css';
import { API_HEADERS, formatINR, fmtDate, fmtMemberSince } from '@/lib/format';
import { getActiveCustomerId } from '@/lib/useActiveCustomer';
import type { Order } from '@/lib/types';

const CURRENT_STATUSES = ['processing', 'dispatched', 'in_transit'];
const DONE_STATUSES = ['delivered', 'cancelled'];

interface Profile {
  name: string;
  email: string;
  phone: string | null;
  account_created: string;
  address?: { street: string; city: string; state: string; pincode: string };
}

function itemSummary(items: Order['items']) {
  if (!items || !items.length) return '';
  return items.map((i) => `${i.product_name} × ${i.qty}`).join(', ');
}

type PanelType = 'cancel' | 'reschedule' | 'address' | 'return' | 'replacement';

function OrderCard({ order, isCompleted }: { order: Order; isCompleted: boolean }) {
  const [status, setStatus] = useState(order.status);
  const [estDelivery, setEstDelivery] = useState(order.estimated_delivery);
  const [openPanel, setOpenPanel] = useState<PanelType | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionDone, setActionDone] = useState(false);

  // cancel
  const [cancelReason, setCancelReason] = useState('changed_my_mind');
  // reschedule
  const [slots, setSlots] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  // address
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [addrState, setAddrState] = useState('');
  const [pincode, setPincode] = useState('');
  // return
  const [returnReason, setReturnReason] = useState('change_of_mind');
  const [returnCondition, setReturnCondition] = useState('unused');
  const [hasPkg, setHasPkg] = useState(true);
  // replacement
  const [repReason, setRepReason] = useState('');
  const [repDesc, setRepDesc] = useState('');

  function togglePanel(type: PanelType) {
    if (openPanel === type) {
      setOpenPanel(null);
      return;
    }
    setOpenPanel(type);
    setMsg(null);
    if (type === 'reschedule' && slots === null) {
      loadSlots();
    }
  }

  async function loadSlots() {
    try {
      const r = await fetch(`/api/orders/${order.order_id}/reschedule/slots`, { headers: API_HEADERS, cache: 'no-store' });
      const d = await r.json();
      setSlots(d.ok && d.slots ? d.slots : []);
    } catch {
      setSlots([]);
    }
  }

  async function doCancel() {
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${order.order_id}/cancel`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ customer_id: getActiveCustomerId(), reason: cancelReason }),
      });
      const d = await r.json();
      if (d.ok && d.cancelled) {
        setMsg({ type: 'success', text: `Order cancelled. Refund will be processed in ${d.refund_timeline}` });
        setActionDone(true);
        setStatus('cancelled');
      } else {
        setMsg({ type: 'error', text: d.message || 'This order cannot be cancelled.' });
        setBusy(false);
      }
    } catch {
      setMsg({ type: 'error', text: 'Something went wrong. Please try again.' });
      setBusy(false);
    }
  }

  async function doReschedule() {
    if (!selectedSlot) {
      setMsg({ type: 'error', text: 'Please select a date first.' });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${order.order_id}/reschedule`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ customer_id: getActiveCustomerId(), new_date: selectedSlot }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({ type: 'success', text: `Delivery rescheduled to ${fmtDate(d.new_estimated_delivery)}.` });
        setActionDone(true);
        setEstDelivery(d.new_estimated_delivery);
      } else {
        setMsg({ type: 'error', text: d.message || 'Unable to reschedule.' });
        setBusy(false);
      }
    } catch {
      setMsg({ type: 'error', text: 'Something went wrong. Please try again.' });
      setBusy(false);
    }
  }

  async function doUpdateAddress() {
    if (!street.trim() || !city.trim() || !addrState.trim() || !pincode.trim()) {
      setMsg({ type: 'error', text: 'Please fill in all address fields.' });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${order.order_id}/address`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({
          customer_id: getActiveCustomerId(),
          street: street.trim(),
          city: city.trim(),
          state: addrState.trim(),
          pincode: pincode.trim(),
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({ type: 'success', text: `Address updated to: ${street}, ${city}, ${addrState} ${pincode}` });
        setActionDone(true);
      } else {
        setMsg({ type: 'error', text: d.message || 'Unable to update address.' });
        setBusy(false);
      }
    } catch {
      setMsg({ type: 'error', text: 'Something went wrong. Please try again.' });
      setBusy(false);
    }
  }

  async function doReturn() {
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${order.order_id}/returns`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({
          customer_id: getActiveCustomerId(),
          reason: returnReason,
          condition: returnCondition,
          has_original_packaging: hasPkg,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({
          type: 'success',
          text: `Return ${d.return_id} created. ${d.return_shipping_label_url ? 'Label: ' + d.return_shipping_label_url + ' ' : ''}Estimated refund: ${fmtDate(d.estimated_refund_date)}.`,
        });
        setActionDone(true);
      } else {
        setMsg({ type: 'error', text: d.reason || d.message || 'Unable to initiate return.' });
        setBusy(false);
      }
    } catch {
      setMsg({ type: 'error', text: 'Something went wrong. Please try again.' });
      setBusy(false);
    }
  }

  async function doReplacement() {
    if (!repReason.trim()) {
      setMsg({ type: 'error', text: 'Please enter a reason.' });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/orders/${order.order_id}/replacement`, {
        method: 'POST',
        headers: API_HEADERS,
        cache: 'no-store',
        body: JSON.stringify({ customer_id: getActiveCustomerId(), reason: repReason.trim(), description: repDesc.trim() }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({ type: 'success', text: `Replacement ${d.replacement_id} requested. Estimated dispatch: ${fmtDate(d.estimated_dispatch_date)}.` });
        setActionDone(true);
      } else {
        setMsg({ type: 'error', text: d.message || 'Unable to submit replacement.' });
        setBusy(false);
      }
    } catch {
      setMsg({ type: 'error', text: 'Something went wrong. Please try again.' });
      setBusy(false);
    }
  }

  let actions: JSX.Element | null = null;
  if (!isCompleted) {
    if (status === 'processing') {
      actions = (
        <div className={styles.orderActions}>
          <button className={`${styles.btnSm} ${styles.btnSmDanger}`} onClick={() => togglePanel('cancel')}>Cancel Order</button>
          <button className={styles.btnSm} onClick={() => togglePanel('reschedule')}>Reschedule Delivery</button>
          <button className={styles.btnSm} onClick={() => togglePanel('address')}>Update Address</button>
        </div>
      );
    } else if (status === 'dispatched') {
      actions = (
        <div className={styles.orderActions}>
          <button className={styles.btnSm} onClick={() => togglePanel('reschedule')}>Reschedule Delivery</button>
        </div>
      );
    } else if (status === 'in_transit' && order.tracking_url) {
      actions = (
        <div className={styles.orderActions}>
          <a href={order.tracking_url} target="_blank" rel="noreferrer" className={styles.btnSm}>Track Shipment →</a>
        </div>
      );
    }
  } else if (status === 'delivered') {
    actions = (
      <div className={styles.orderActions}>
        <button className={styles.btnSm} onClick={() => togglePanel('return')}>Return Items</button>
        {order.damage_claim_active && (
          <button className={styles.btnSm} onClick={() => togglePanel('replacement')}>Request Replacement</button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.orderCard}>
      <div className={styles.orderCardHeader}>
        <span className={styles.orderId}>{order.order_id}</span>
        <span className={`status-pill status-pill--${status}`}>{status.replace('_', ' ')}</span>
      </div>
      <div className={styles.orderCardBody}>
        <p className={styles.orderItemsSummary}>{itemSummary(order.items)}</p>
        <div className={styles.orderMeta}>
          <span>Total: <strong>{formatINR(order.price_total)}</strong></span>
          <span>{status === 'delivered' ? 'Delivered: ' : 'Est. delivery: '}<strong>{fmtDate(estDelivery)}</strong></span>
        </div>
        {!actionDone && actions}
      </div>

      {openPanel === 'cancel' && (
        <div className={styles.inlinePanel}>
          <p className={styles.inlinePanelTitle}>Cancel This Order</p>
          <p style={{ fontSize: '0.88rem', color: 'var(--body)', marginBottom: 16 }}>Are you sure you want to cancel order {order.order_id}?</p>
          <div className={styles.formGroup}>
            <label>Reason</label>
            <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
              <option value="changed_my_mind">Changed my mind</option>
              <option value="ordered_by_mistake">Ordered by mistake</option>
              <option value="found_better_price">Found a better price</option>
              <option value="delivery_too_slow">Delivery too slow</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className={styles.panelActions}>
            {!actionDone && (
              <button className={styles.panelConfirm} disabled={busy} onClick={doCancel}>
                {busy ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            )}
            <button className={styles.panelCancel} onClick={() => setOpenPanel(null)}>Go Back</button>
          </div>
          {msg && <p className={`${styles.panelMessage} ${msg.type === 'success' ? styles.panelMessageSuccess : styles.panelMessageError}`}>{msg.text}</p>}
        </div>
      )}

      {openPanel === 'reschedule' && (
        <div className={styles.inlinePanel}>
          <p className={styles.inlinePanelTitle}>Reschedule Delivery</p>
          <p style={{ fontSize: '0.88rem', color: 'var(--body)', marginBottom: 16 }}>Select a new delivery date:</p>
          <div className={styles.slotPills}>
            {slots === null && <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>Loading available dates…</p>}
            {slots !== null && slots.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>No slots available.</p>}
            {slots?.map((s) => (
              <button
                key={s}
                className={`${styles.slotPill} ${selectedSlot === s ? styles.slotPillSelected : ''}`}
                onClick={() => setSelectedSlot(s)}
              >
                {fmtDate(s)}
              </button>
            ))}
          </div>
          <div className={styles.panelActions} style={{ marginTop: 20 }}>
            {!actionDone && (
              <button className={styles.panelConfirm} disabled={busy} onClick={doReschedule}>
                {busy ? 'Rescheduling…' : 'Confirm Reschedule'}
              </button>
            )}
            <button className={styles.panelCancel} onClick={() => setOpenPanel(null)}>Go Back</button>
          </div>
          {msg && <p className={`${styles.panelMessage} ${msg.type === 'success' ? styles.panelMessageSuccess : styles.panelMessageError}`}>{msg.text}</p>}
        </div>
      )}

      {openPanel === 'address' && (
        <div className={styles.inlinePanel}>
          <p className={styles.inlinePanelTitle}>Update Delivery Address</p>
          <div className={styles.formGroup}>
            <label>Street</label>
            <input type="text" placeholder="Street address" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label>City</label>
              <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label>State</label>
              <input type="text" placeholder="State" value={addrState} onChange={(e) => setAddrState(e.target.value)} />
            </div>
          </div>
          <div className={styles.formGroup}>
            <label>Pincode</label>
            <input type="text" placeholder="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
          </div>
          <div className={styles.panelActions}>
            {!actionDone && (
              <button className={styles.panelConfirm} disabled={busy} onClick={doUpdateAddress}>
                {busy ? 'Updating…' : 'Update Address'}
              </button>
            )}
            <button className={styles.panelCancel} onClick={() => setOpenPanel(null)}>Go Back</button>
          </div>
          {msg && <p className={`${styles.panelMessage} ${msg.type === 'success' ? styles.panelMessageSuccess : styles.panelMessageError}`}>{msg.text}</p>}
        </div>
      )}

      {openPanel === 'return' && (
        <div className={styles.inlinePanel}>
          <p className={styles.inlinePanelTitle}>Return Items</p>
          <div className={styles.formGroup}>
            <label>Reason for Return</label>
            <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
              <option value="change_of_mind">Change of mind</option>
              <option value="item_not_as_described">Item not as described</option>
              <option value="damaged_on_arrival">Damaged on arrival</option>
              <option value="defective">Defective</option>
              <option value="wrong_item_received">Wrong item received</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Item Condition</label>
            <select value={returnCondition} onChange={(e) => setReturnCondition(e.target.value)}>
              <option value="unused">Unused</option>
              <option value="opened">Opened</option>
              <option value="assembled">Assembled</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label>Original Packaging?</label>
            <div className={styles.pkgToggle}>
              <button className={`${styles.pkgOpt} ${hasPkg ? styles.pkgOptSelected : ''}`} onClick={() => setHasPkg(true)}>Yes</button>
              <button className={`${styles.pkgOpt} ${!hasPkg ? styles.pkgOptSelected : ''}`} onClick={() => setHasPkg(false)}>No</button>
            </div>
          </div>
          <div className={styles.panelActions}>
            {!actionDone && (
              <button className={styles.panelConfirm} disabled={busy} onClick={doReturn}>
                {busy ? 'Submitting…' : 'Initiate Return'}
              </button>
            )}
            <button className={styles.panelCancel} onClick={() => setOpenPanel(null)}>Go Back</button>
          </div>
          {msg && <p className={`${styles.panelMessage} ${msg.type === 'success' ? styles.panelMessageSuccess : styles.panelMessageError}`}>{msg.text}</p>}
        </div>
      )}

      {openPanel === 'replacement' && (
        <div className={styles.inlinePanel}>
          <p className={styles.inlinePanelTitle}>Request Replacement</p>
          <div className={styles.formGroup}>
            <label>Reason</label>
            <input type="text" placeholder="e.g. Item arrived damaged" value={repReason} onChange={(e) => setRepReason(e.target.value)} />
          </div>
          <div className={styles.formGroup}>
            <label>Description</label>
            <textarea placeholder="Describe the damage or issue in detail…" value={repDesc} onChange={(e) => setRepDesc(e.target.value)} />
          </div>
          <div className={styles.panelActions}>
            {!actionDone && (
              <button className={styles.panelConfirm} disabled={busy} onClick={doReplacement}>
                {busy ? 'Submitting…' : 'Submit Replacement Request'}
              </button>
            )}
            <button className={styles.panelCancel} onClick={() => setOpenPanel(null)}>Go Back</button>
          </div>
          {msg && <p className={`${styles.panelMessage} ${msg.type === 'success' ? styles.panelMessageSuccess : styles.panelMessageError}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<'current' | 'completed'>('current');

  useEffect(() => {
    let cancelled = false;
    const cid = getActiveCustomerId();

    async function loadProfile() {
      try {
        const r = await fetch(`/api/customers/${cid}`, { headers: API_HEADERS, cache: 'no-store' });
        const d = await r.json();
        if (!cancelled && d.ok) setProfile(d);
      } catch {
        /* ignore */
      }
    }

    async function loadOrders() {
      try {
        const r = await fetch(`/api/customers/${cid}/orders`, { headers: API_HEADERS, cache: 'no-store' });
        const d = await r.json();
        if (!cancelled && d.ok) setOrders(d.orders);
      } catch {
        /* ignore */
      }
    }

    loadProfile();
    loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = orders.filter((o) => CURRENT_STATUSES.includes(o.status));
  const completed = orders.filter((o) => DONE_STATUSES.includes(o.status));

  return (
    <>
      <Head>
        <title>My Account — NestKart</title>
      </Head>

      <Nav active="account" />

      <main className={styles.accountPage}>
        <div className={styles.accountPageInner}>
          <div className={styles.profileCard}>
            <p className={styles.profileCardName}>{profile?.name || '—'}</p>
            <div>
              <div className={styles.profileField}><p className={styles.profileLabel}>Email</p><p className={styles.profileValue}>{profile?.email || '—'}</p></div>
              <div className={styles.profileField}><p className={styles.profileLabel}>Phone</p><p className={styles.profileValue}>{profile?.phone || '—'}</p></div>
              <div className={styles.profileField}><p className={styles.profileLabel}>Member Since</p><p className={styles.profileValue}>{profile ? fmtMemberSince(profile.account_created) : '—'}</p></div>
            </div>
            <div>
              <div className={styles.profileField}>
                <p className={styles.profileLabel}>Address</p>
                <p className={styles.profileValue}>
                  {profile?.address ? `${profile.address.street}, ${profile.address.city}, ${profile.address.state} ${profile.address.pincode}` : '—'}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.ordersTabs}>
            <div className={styles.tabBar}>
              <button className={`${styles.tabBtn} ${tab === 'current' ? styles.tabBtnActive : ''}`} onClick={() => setTab('current')}>Current Orders</button>
              <button className={`${styles.tabBtn} ${tab === 'completed' ? styles.tabBtnActive : ''}`} onClick={() => setTab('completed')}>Completed Orders</button>
            </div>
            {tab === 'current' && (
              <div className={styles.tabPanel}>
                {current.length === 0 ? (
                  <p className={styles.noOrders}>No orders here yet.</p>
                ) : (
                  current.map((o) => <OrderCard key={o.order_id} order={o} isCompleted={false} />)
                )}
              </div>
            )}
            {tab === 'completed' && (
              <div className={styles.tabPanel}>
                {completed.length === 0 ? (
                  <p className={styles.noOrders}>No orders here yet.</p>
                ) : (
                  completed.map((o) => <OrderCard key={o.order_id} order={o} isCompleted={true} />)
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
