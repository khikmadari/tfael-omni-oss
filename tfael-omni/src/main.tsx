// ═══════════════════════════════════════════════════════════════════════
// TFAEL-OMNI — Entry Point
// Provider stack: Auth → App → Toast → App component
// ═══════════════════════════════════════════════════════════════════════

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/context/AuthContext';
import { AppProvider } from '@/context/AppContext';
import { ToastProvider } from '@/hooks/useToast';
import App from './App';
import '@/styles/globals.css';
import '@/styles/tokens.css';

// Service worker: prasyarat agar aplikasi bisa dipasang ke layar utama di Android.
// Tidak menyimpan cache apa pun (lihat public/sw.js), jadi data selalu diambil dari server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* pemasangan opsional; aplikasi tetap berjalan */ });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </AuthProvider>
  </StrictMode>
);
