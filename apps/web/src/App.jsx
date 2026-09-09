const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export default function App() {
  return (
    <main className="page-shell">
      <section className="welcome-card" aria-labelledby="page-title">
        <p className="eyebrow">Phase 1 foundation</p>
        <h1 id="page-title">Marketplace Platform</h1>
        <p>
          The React, FastAPI, and PostgreSQL development stack is ready. Marketplace
          features will be introduced in later phases.
        </p>
        <a href={`${apiBaseUrl}/health`} target="_blank" rel="noreferrer">
          Check API health
        </a>
      </section>
    </main>
  );
}
