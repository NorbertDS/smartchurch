import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initDatePicker } from './utils/datePicker';

const analyticsId = (import.meta as any)?.env?.VITE_ANALYTICS_ID;
if (typeof document !== 'undefined' && analyticsId) {
  const s = document.createElement('link');
  s.rel = 'preconnect';
  s.href = 'https://www.googletagmanager.com';
  document.head.appendChild(s);
  const gtag = document.createElement('script');
  gtag.async = true;
  gtag.src = `https://www.googletagmanager.com/gtag/js?id=${analyticsId}`;
  document.head.appendChild(gtag);
  const inline = document.createElement('script');
  inline.innerHTML = `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config', '${analyticsId}', { anonymize_ip: true });`;
  document.head.appendChild(inline);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Initialize global date picker after initial render
setTimeout(() => initDatePicker({ format: 'DD/MM/YYYY' }), 0);
