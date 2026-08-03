import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import Script from 'next/script';
import '@/styles/globals.css';
import TestUserSwitcher from '@/components/TestUserSwitcher';

export default function App({ Component, pageProps }: AppProps) {
  const { pathname } = useRouter();
  // The Tweety widget is for shoppers, so keep it off the admin screens.
  const showWidget = !pathname.startsWith('/admin');

  return (
    <>
      <Component {...pageProps} />
      <TestUserSwitcher />
      {showWidget && (
        <Script
          src="http://localhost:3201/loader.js"
          strategy="afterInteractive"
          data-widget-key="wk_live_cmxSg_C6R9LcVwEXka5-fQ"
          data-api-url="https://staging.api.nambikk.ai/api/v1"
          data-label="Tweety"
          data-mode="bubble"
          data-position="bottom-right"
        />
      )}
    </>
  );
}
