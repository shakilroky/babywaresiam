import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const Admin = React.lazy(() => import('./admin').then(({ Admin }) => ({ default: Admin })));

const path = window.location.pathname.toLowerCase();
const isAdmin = path.startsWith('/admin') || path.startsWith('/wp-admin');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? (
      <Suspense fallback={<main className="sa-loading" role="status">Loading admin…</main>}>
        <Admin />
      </Suspense>
    ) : <App />}
  </React.StrictMode>
);
