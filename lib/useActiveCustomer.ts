import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'nk_active_user';
const DEFAULT_CUSTOMER_ID = 'cust_001';

declare global {
  interface Window {
    user_id?: string;
  }
}

/**
 * Mirrors the active customer id onto `window.user_id`.
 *
 * The chat widget is embedded as a bare <script> tag carrying no identity of
 * its own, so nothing on the page tells it which test user is selected. This
 * puts the id in one well-known global the widget can be pointed at — the
 * value that has to reach it as `identity.user_id`, since context hydration
 * only protects a user_id it was already given and never invents one.
 *
 * Kept in sync by setActiveCustomerId, so switching users updates it too.
 */
export function syncUserIdGlobal(customerId: string): void {
  if (typeof window === 'undefined') return;
  window.user_id = customerId;
}

/**
 * Reads/writes the active customer id from localStorage, matching the
 * site's existing `cid()` / `getCustomerId()` helper convention:
 *   localStorage.getItem('nk_active_user') || 'cust_001'
 */
export function getActiveCustomerId(): string {
  if (typeof window === 'undefined') return DEFAULT_CUSTOMER_ID;
  try {
    return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_CUSTOMER_ID;
  } catch {
    return DEFAULT_CUSTOMER_ID;
  }
}

export function setActiveCustomerId(customerId: string): void {
  if (typeof window === 'undefined') return;
  syncUserIdGlobal(customerId);
  try {
    window.localStorage.setItem(STORAGE_KEY, customerId);
  } catch {
    /* ignore */
  }
}

export default function useActiveCustomer(): [string, (id: string) => void] {
  const [customerId, setCustomerId] = useState<string>(DEFAULT_CUSTOMER_ID);

  useEffect(() => {
    const id = getActiveCustomerId();
    syncUserIdGlobal(id);
    setCustomerId(id);
  }, []);

  const update = useCallback((id: string) => {
    setActiveCustomerId(id);
    setCustomerId(id);
  }, []);

  return [customerId, update];
}
