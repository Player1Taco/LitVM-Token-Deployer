import React from 'react';
import { Toaster } from 'react-hot-toast';
import Header from './components/Header';
import BackgroundEffects from './components/BackgroundEffects';
import TokenDeployer from './components/TokenDeployer';
import DeploymentHistory from './components/DeploymentHistory';
import { useWallet } from './hooks/useWallet';

/**
 * App Root
 *
 * Fix #28: "Made by" credit moved into Header (top banner).
 *          Footer is now minimal — just a status indicator.
 */
const App: React.FC = () => {
  const { error } = useWallet();

  return (
    <div className="min-h-screen relative">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#262626',
            color: '#fff',
            border: '1px solid #2F2F2F',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' },
          },
        }}
      />

      <BackgroundEffects />
      <Header />

      {/* pt-32 accounts for header (h-16) + top banner (h-8) + spacing */}
      <main className="relative z-10 pt-32 pb-20 px-4">
        {/* Wallet Error Banner */}
        {error && (
          <div className="max-w-2xl mx-auto mb-6">
            <div className="glass rounded-xl p-4 border border-error/20 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-error flex-shrink-0" />
              <p className="text-sm text-error">{error}</p>
            </div>
          </div>
        )}

        <TokenDeployer />
        <DeploymentHistory />

        {/* Minimal Footer */}
        <footer className="mt-20 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-gray-500">Powered by LitVM • Chain 4693</span>
            <span className="text-sm">🌮</span>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
