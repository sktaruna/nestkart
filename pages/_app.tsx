import { useEffect, useState } from 'react';
import type { AppProps } from 'next/app';
import Script from 'next/script';
import '@/styles/globals.css';
import TestUserSwitcher from '@/components/TestUserSwitcher';
import { seedCustomers } from '@/lib/data';
import { getActiveCustomerId } from '@/lib/useActiveCustomer';

const CUSTOMERS = seedCustomers();

/**
 * The identity the chat widget starts its first conversation with.
 *
 * This has to ride in on the loader's own `data-launch-initial-context`
 * rather than a later NambikkWidget.identify() call. Identity reaches the
 * widget only as a `launchInitialContext` query param baked into the iframe
 * URL, and that URL is built once when the frame first loads — by the time
 * identify() runs, a conversation already exists against an anonymous
 * `widget_<uuid>` visitor, and context hydration runs only once per
 * conversation, so it never re-fires for the real customer.
 */
function initialContext(customerId: string): string {
  const c = CUSTOMERS[customerId];
  return JSON.stringify({
    identity: {
      user_id: customerId,
      ...(c ? { user_name: c.name, user_email: c.email } : {}),
    },
  });
}

export default function App({ Component, pageProps }: AppProps) {
  /**
   * Which test user the widget should boot as. Read on the client, since the
   * selection lives in localStorage — so the loader is held back one tick
   * rather than shipping a server-rendered default that would be wrong for
   * anyone who has switched users.
   */
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setActiveId(getActiveCustomerId());
  }, []);

  return (
    <>
      <Component {...pageProps} />
      <TestUserSwitcher />
      {activeId && (
        <Script
          src="https://widget-staging-7747.up.railway.app/loader.js"
          data-widget-key="wk_live_cmxSg_C6R9LcVwEXka5-fQ"
          data-api-url="https://staging.api.nambikk.ai/api/v1"
          data-label="Tweety"
          data-mode="bubble"
          data-position="bottom-right"
          data-launch-initial-context={initialContext(activeId)}
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
