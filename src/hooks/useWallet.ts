/**
 * useWallet Hook
 *
 * Thin wrapper around the zustand wallet store.
 * Provides a clean API for components to access wallet state.
 *
 * Fixes issue #3: useWallet hook was missing.
 */

import { useWalletStore } from '../stores/walletStore';

export function useWallet() {
  const address = useWalletStore((s) => s.address);
  const signer = useWalletStore((s) => s.signer);
  const isConnecting = useWalletStore((s) => s.isConnecting);
  const isWrongNetwork = useWalletStore((s) => s.isWrongNetwork);
  const error = useWalletStore((s) => s.error);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const switchToLitVM = useWalletStore((s) => s.switchToLitVM);

  return {
    address,
    signer,
    isConnecting,
    isWrongNetwork,
    error,
    connect,
    disconnect,
    switchToLitVM,
  };
}
