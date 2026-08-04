import type { AppProps } from 'next/app';
import Script from 'next/script';
import '@/styles/globals.css';
import TestUserSwitcher from '@/components/TestUserSwitcher';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <TestUserSwitcher />
      <Script
        src="https://widget-staging-7747.up.railway.app/loader.js"
        data-widget-key="wk_live_cmxSg_C6R9LcVwEXka5-fQ"
        data-api-url="https://staging.api.nambikk.ai/api/v1"
        data-label="Tweety"
        data-mode="bubble"
        data-position="bottom-right"
        strategy="afterInteractive"
      />
    </>
  );
}
