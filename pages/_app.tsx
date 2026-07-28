import type { AppProps } from 'next/app';
import '@/styles/globals.css';
import TestUserSwitcher from '@/components/TestUserSwitcher';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <TestUserSwitcher />
    </>
  );
}
