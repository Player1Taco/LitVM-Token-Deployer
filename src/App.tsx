import React from 'react';
import { Toaster } from 'react-hot-toast';
import Header from './components/Header';
import BackgroundEffects from './components/BackgroundEffects';
import TokenDeployer from './components/TokenDeployer';
import DeploymentHistory from './components/DeploymentHistory';
import { useWallet } from './hooks/useWallet';

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

      <main className="relative z-10 pt-28 pb-20 px-4">
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

        {/* Footer */}
        <footer className="mt-20 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-xs text-gray-500">Powered by LitVM • LitVM Chain Only</span>
            <span className="text-sm">🌮</span>
          </div>

          {/* Branding */}
          <div className="flex items-center justify-center gap-1.5 text-sm text-gray-500">
            <span>made by</span>
            <a
              href="https://x.com/Player1Taco"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:text-primary/80 transition-colors underline underline-offset-2 decoration-primary/30 hover:decoration-primary/60"
            >
              Player1Taco
            </a>
            <span>on</span>
            <a
              href="https://dappit.io"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-secondary hover:text-secondary/80 transition-colors underline underline-offset-2 decoration-secondary/30 hover:decoration-secondary/60"
            >
              Dappit.io
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default App;
