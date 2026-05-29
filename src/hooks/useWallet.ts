/**
 * useWallet Hook
 *
 * Thin wrapper around the zustand wallet store.
 * Provides a clean API plus derived `isConnected` flag.
 */

import { useWalletStore } from '../stores/walletStore';

export function useWallet() {
  const address = useWalletStore((s) => s.address);
  const signer = useWalletStore((s) => s.signer);
  const provider = useWalletStore((s) => s.provider);
  const isConnecting = useWalletStore((s) => s.isConnecting);
  const isWrongNetwork = useWalletStore((s) => s.isWrongNetwork);
  const chainId = useWalletStore((s) => s.chainId);
  const error = useWalletStore((s) => s.error);
  const connect = useWalletStore((s) => s.connect);
  const disconnect = useWalletStore((s) => s.disconnect);
  const switchToLitVM = useWalletStore((s) => s.switchToLitVM);

  // Derived: wallet is connected when we have both address and signer
  const isConnected = Boolean(address && signer);

  return {
    address,
    signer,
    provider,
    isConnecting,
    isConnected,
    isWrongNetwork,
    chainId,
    error,
    connect,
    disconnect,
    switchToLitVM,
  };
}
