import { Html, Head, Main, NextScript } from "next/document";

// Minimal custom Document to satisfy Next's pages-router contract when the app router is present.
export default function Document() {
  return (
    <Html lang="en">
      <Head />
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
