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
 * Note this is NOT what sets identity.user_id. The widget takes that from the
 * `visitor_id` field of its POST /chat/widget/session, which it fills from a
 * `visitorId` option — never from the launch context. With no visitorId the
 * server mints an anonymous `widget_<uuid>`, and since identity.user_id is
 * protected once set, the real ID sent here is then rejected as an overwrite.
 * Context hydration therefore fires for a customer that does not exist.
 *
 * `data-visitor-id` below is the fix, but the current loader build has no such
 * attribute and the widget frame reads no visitorId query param, so it is
 * inert until Nambikk plumbs it through. Kept here so the embed is correct the
 * day they do. Until then the only way to set the visitor is by hand, in the
 * widget origin's localStorage under
 * `nambikk.sdk.visitor:<widgetKey>:<pageOrigin>`.
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
          data-visitor-id={activeId}
          data-launch-initial-context={initialContext(activeId)}
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
