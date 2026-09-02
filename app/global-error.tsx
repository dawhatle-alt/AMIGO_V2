'use client';

/**
 * Last-resort boundary for errors in the root layout itself. Renders its own
 * document because the layout is gone; keeps to plain styles for the same
 * reason.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#f5f6f8', color: '#1f2937', padding: 24 }}>
        <main role="alert" style={{ maxWidth: 640, margin: '48px auto', background: '#fff', border: '1px solid #fca5a5', borderRadius: 14, padding: 24 }}>
          <h1 style={{ fontSize: 17, fontWeight: 700 }}>AMIGO Concierge could not start</h1>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            The application shell failed to render. Your case is still in this browser&rsquo;s storage;
            reloading usually recovers it. If this keeps happening, clear the site data and open the
            last saved case file.
          </p>
          <pre style={{ fontSize: 11, marginTop: 12, background: '#f9fafb', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
            {error.message || String(error)}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, background: '#2563eb', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
