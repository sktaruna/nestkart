import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'nk_active_user';
const DEFAULT_CUSTOMER_ID = 'cust_001';

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
  try {
    window.localStorage.setItem(STORAGE_KEY, customerId);
  } catch {
    /* ignore */
  }
}

export default function useActiveCustomer(): [string, (id: string) => void] {
  const [customerId, setCustomerId] = useState<string>(DEFAULT_CUSTOMER_ID);

  useEffect(() => {
    setCustomerId(getActiveCustomerId());
  }, []);

  const update = useCallback((id: string) => {
    setActiveCustomerId(id);
    setCustomerId(id);
  }, []);

  return [customerId, update];
}
