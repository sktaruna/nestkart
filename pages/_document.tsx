import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/*
          Without these, every page load 404s on /favicon.ico: the browser asks
          for it implicitly and the project had no public/ directory at all. The
          SVG covers modern browsers; the shortcut-icon line stops older ones
          falling back to the /favicon.ico that still does not exist.
        */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
