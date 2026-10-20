import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Admin } from './admin';
import './styles.css';

const path = window.location.pathname.toLowerCase();
const isAdmin = path.startsWith('/admin') || path.startsWith('/wp-admin');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdmin ? <Admin /> : <App />}
  </React.StrictMode>
);
