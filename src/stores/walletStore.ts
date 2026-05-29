/**
 * Zustand Wallet Store
 *
 * Manages wallet connection state for the LitVM Token Deployer.
 * Supports MetaMask and EVM-compatible wallets via window.ethereum.
 *
 * PRODUCTION FIXES (Fix #29):
 *  1. Always call eth_requestAccounts EXPLICITLY before creating BrowserProvider.
 *  2. Fixed provider variable shadowing in fallback path.
 *  3. refreshSigner handles errors gracefully and always sets consistent state.
 *  4. switchToLitVM refreshes the signer after successful chain switch.
 *  5. Auto-reconnect on page load if accounts are already authorized.
 *  6. Added chain ID validation after every connection/switch.
 *  7. Added disconnect event handler from EIP-1193 (MetaMask 'disconnect').
 *  8. Improved error recovery with auto-retry on transient failures.
 */

import { create } from 'zustand';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import {
  LITVM_CHAIN_ID,
  LITVM_CHAIN_ID_HEX,
  LITVM_CHAIN_CONFIG,
  isLitVMChain,
} from '../utils/chain';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WalletState {
  /** Connected wallet address (checksummed) or null */
  address: string | null;
  /** ethers.js v6 signer for signing transactions */
  signer: JsonRpcSigner | null;
  /** Active BrowserProvider instance */
  provider: BrowserProvider | null;
  /** Whether a connection request is in progress */
  isConnecting: boolean;
  /** Whether wallet is connected to the wrong network */
  isWrongNetwork: boolean;
  /** Current chain ID (decimal) */
  chainId: number | null;
  /** Error message from last connection attempt */
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToLitVM: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Module-level state for event listeners (stable references)
// ---------------------------------------------------------------------------

let isConnectingLock = false;
let boundChainChanged: ((chainIdHex: string) => void) | null = null;
let boundAccountsChanged: ((accounts: string[]) => void) | null = null;
let boundDisconnect: ((error: any) => void) | null = null;

/**
 * Remove all MetaMask event listeners safely.
 */
function removeAllListeners() {
  const ethereum = getEthereum();
  if (!ethereum) return;

  if (boundChainChanged) {
    try { ethereum.removeListener('chainChanged', boundChainChanged); } catch {}
    boundChainChanged = null;
  }
  if (boundAccountsChanged) {
    try { ethereum.removeListener('accountsChanged', boundAccountsChanged); } catch {}
    boundAccountsChanged = null;
  }
  if (boundDisconnect) {
    try { ethereum.removeListener('disconnect', boundDisconnect); } catch {}
    boundDisconnect = null;
  }
}

/**
 * Safely get the ethereum provider from window.
 * Handles the case where multiple providers are injected (EIP-6963 style).
 */
function getEthereum(): any {
  const w = window as any;

  // Prefer MetaMask if multiple providers are injected
  if (w.ethereum?.providers?.length) {
    const metamask = w.ethereum.providers.find((p: any) => p.isMetaMask);
    if (metamask) return metamask;
    return w.ethereum.providers[0];
  }

  return w.ethereum || null;
}

/**
 * Get the current chain ID from the wallet provider.
 * Returns decimal number.
 */
async function getChainId(ethereum: any): Promise<number> {
  try {
    const chainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
    return parseInt(chainIdHex, 16);
  } catch (err) {
    console.warn('[Wallet] eth_chainId failed:', err);
    return 0;
  }
}

/**
 * Create a fresh BrowserProvider + Signer from the current ethereum provider.
 * Returns null if creation fails.
 */
async function createProviderAndSigner(ethereum: any): Promise<{
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
} | null> {
  try {
    // Create provider with 'any' to support any network
    const provider = new BrowserProvider(ethereum, 'any');
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const chainId = await getChainId(ethereum);

    return { provider, signer, address, chainId };
  } catch (err) {
    console.error('[Wallet] createProviderAndSigner failed:', err);
    return null;
  }
}

/**
 * Attach MetaMask event listeners with stable references.
 *
 * Fix #29: Also listens for EIP-1193 'disconnect' event.
 */
function attachListeners() {
  const ethereum = getEthereum();
  if (!ethereum) return;

  // Always remove first to prevent duplicates
  removeAllListeners();

  boundChainChanged = (chainIdHex: string) => {
    const chainId = parseInt(chainIdHex, 16);
    console.log('[Wallet] Chain changed to:', chainId, `(${chainIdHex})`);

    // Update chain state immediately
    useWalletStore.setState({
      isWrongNetwork: !isLitVMChain(chainId),
      chainId,
    });

    // Re-establish signer on chain change (if connected)
    const state = useWalletStore.getState();
    if (state.address) {
      refreshSigner().catch((err) => {
        console.warn('[Wallet] Failed to refresh signer after chain change:', err);
      });
    }
  };

  boundAccountsChanged = (accounts: string[]) => {
    if (!accounts || accounts.length === 0) {
      console.log('[Wallet] Accounts disconnected by wallet');
      useWalletStore.getState().disconnect();
    } else {
      console.log('[Wallet] Account changed to:', accounts[0]);
      refreshSigner().catch((err) => {
        console.warn('[Wallet] Failed to refresh signer after account change:', err);
      });
    }
  };

  // Fix #29: EIP-1193 disconnect (fires when wallet loses connection to RPC)
  boundDisconnect = (error: any) => {
    console.warn('[Wallet] EIP-1193 disconnect event:', error);
    // Don't fully disconnect — this fires on RPC drops, not user-initiated disconnects.
    // Just log it. The user's account is still authorized.
    useWalletStore.setState({
      error: 'Wallet lost connection to the network. Attempting to reconnect...',
    });

    // Auto-retry after a short delay
    setTimeout(() => {
      refreshSigner()
        .then(() => {
          useWalletStore.setState({ error: null });
          console.log('[Wallet] Reconnected after disconnect event');
        })
        .catch(() => {
          console.warn('[Wallet] Failed to auto-reconnect');
        });
    }, 2000);
  };

  ethereum.on('chainChanged', boundChainChanged);
  ethereum.on('accountsChanged', boundAccountsChanged);
  ethereum.on('disconnect', boundDisconnect);
  console.log('[Wallet] Event listeners attached (chain, accounts, disconnect)');
}

/**
 * Re-create the BrowserProvider and signer after a chain/account change.
 */
async function refreshSigner() {
  const ethereum = getEthereum();
  if (!ethereum) return;

  const result = await createProviderAndSigner(ethereum);
  if (!result) return;

  const { provider, signer, address, chainId } = result;

  useWalletStore.setState({
    provider,
    signer,
    address,
    chainId,
    isWrongNetwork: !isLitVMChain(chainId),
    error: null,
  });

  console.log(
    '[Wallet] Signer refreshed:', address,
    'Chain:', chainId,
    'IsLitVM:', isLitVMChain(chainId)
  );
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  signer: null,
  provider: null,
  isConnecting: false,
  isWrongNetwork: false,
  chainId: null,
  error: null,

  /**
   * Connect to the user's wallet.
   */
  connect: async () => {
    // Guard: prevent concurrent connection requests
    if (isConnectingLock) {
      console.log('[Wallet] Connection already in progress, ignoring');
      return;
    }

    const ethereum = getEthereum();
    if (!ethereum) {
      set({
        error: 'No Ethereum wallet detected. Please install MetaMask or a compatible wallet.',
      });
      console.error('[Wallet] No ethereum provider found on window');
      return;
    }

    isConnectingLock = true;
    set({ isConnecting: true, error: null });

    try {
      // Step 1: EXPLICITLY request accounts (triggers popup)
      console.log('[Wallet] Requesting accounts via eth_requestAccounts...');

      let accounts: string[];
      try {
        accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      } catch (reqErr: any) {
        console.error('[Wallet] eth_requestAccounts failed:', reqErr);

        if (reqErr?.code === 4001 || reqErr?.message?.includes('user rejected')) {
          set({ isConnecting: false, error: 'Connection request was rejected.' });
          return;
        }
        if (reqErr?.code === -32002) {
          set({
            isConnecting: false,
            error: 'A connection request is already pending. Check your wallet extension.',
          });
          return;
        }

        throw reqErr;
      }

      if (!accounts || accounts.length === 0) {
        set({ isConnecting: false, error: 'No accounts returned from wallet.' });
        return;
      }

      console.log('[Wallet] Accounts received:', accounts[0]);

      // Step 2: Create BrowserProvider and Signer
      console.log('[Wallet] Creating BrowserProvider and Signer...');

      const result = await createProviderAndSigner(ethereum);

      if (!result) {
        set({
          isConnecting: false,
          error: 'Failed to create wallet provider. Please try again.',
        });
        return;
      }

      const { provider, signer, address, chainId } = result;
      const isWrongNetwork = !isLitVMChain(chainId);

      console.log('[Wallet] Connected successfully:', {
        address,
        chainId,
        isLitVM: !isWrongNetwork,
        expectedChainId: LITVM_CHAIN_ID,
      });

      // Step 3: Update state atomically
      set({
        address,
        signer,
        provider,
        chainId,
        isWrongNetwork,
        isConnecting: false,
        error: null,
      });

      // Step 4: Attach event listeners
      attachListeners();

    } catch (err: any) {
      console.error('[Wallet] Connection error:', err);

      let errorMsg = 'Failed to connect wallet.';

      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
        errorMsg = 'Connection request was rejected.';
      } else if (err?.code === -32002) {
        errorMsg = 'A connection request is already pending. Check your wallet extension.';
      } else if (err?.code === -32603) {
        errorMsg = 'Internal wallet error. Try refreshing the page.';
      } else if (err?.message?.includes('user rejected')) {
        errorMsg = 'Connection request was rejected.';
      } else if (err?.message) {
        errorMsg = `Wallet error: ${err.message.slice(0, 150)}`;
      }

      set({
        isConnecting: false,
        error: errorMsg,
        address: null,
        signer: null,
        provider: null,
        chainId: null,
        isWrongNetwork: false,
      });
    } finally {
      isConnectingLock = false;
    }
  },

  /**
   * Disconnect the wallet and reset all state.
   */
  disconnect: () => {
    removeAllListeners();
    set({
      address: null,
      signer: null,
      provider: null,
      isConnecting: false,
      isWrongNetwork: false,
      chainId: null,
      error: null,
    });
    console.log('[Wallet] Disconnected');
  },

  /**
   * Switch the wallet to the LitVM network.
   *
   * Fix #29: Validates chain ID after switch to confirm it worked.
   */
  switchToLitVM: async () => {
    const ethereum = getEthereum();
    if (!ethereum) {
      set({ error: 'No wallet detected.' });
      return;
    }

    console.log('[Wallet] Attempting to switch to LitVM (chainId:', LITVM_CHAIN_ID_HEX, ')...');

    try {
      // Try switching to the chain
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: LITVM_CHAIN_ID_HEX }],
      });

      console.log('[Wallet] Chain switch request accepted');

      // Give the wallet a moment to process the switch
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Verify the switch worked
      const currentChainId = await getChainId(ethereum);
      console.log('[Wallet] Post-switch chain ID:', currentChainId);

      if (isLitVMChain(currentChainId)) {
        await refreshSigner();
        console.log('[Wallet] Successfully switched to LitVM');
      } else {
        console.warn('[Wallet] Chain switch accepted but chainId mismatch:', currentChainId, '!==', LITVM_CHAIN_ID);
        // The chainChanged event handler will pick this up
      }

    } catch (switchErr: any) {
      console.error('[Wallet] Switch error:', switchErr);

      // Error code 4902: Chain not added to wallet — add it
      if (switchErr?.code === 4902) {
        console.log('[Wallet] Chain not found, attempting to add LitVM...');
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [LITVM_CHAIN_CONFIG],
          });

          console.log('[Wallet] LitVM chain added successfully');

          // After adding, wait and refresh
          await new Promise((resolve) => setTimeout(resolve, 500));
          await refreshSigner();

        } catch (addErr: any) {
          console.error('[Wallet] Failed to add LitVM chain:', addErr);
          if (addErr?.code === 4001) {
            set({ error: 'Network addition was rejected.' });
          } else {
            set({ error: 'Failed to add LitVM network to wallet.' });
          }
        }
      } else if (switchErr?.code === 4001) {
        set({ error: 'Network switch was rejected.' });
      } else {
        set({ error: `Failed to switch to LitVM: ${switchErr?.message?.slice(0, 100) || 'Unknown error'}` });
      }
    }
  },
}));

// ---------------------------------------------------------------------------
// Auto-reconnect on page load
// ---------------------------------------------------------------------------

async function autoReconnect() {
  const ethereum = getEthereum();
  if (!ethereum) return;

  try {
    // eth_accounts returns authorized accounts without prompting
    const accounts: string[] = await ethereum.request({ method: 'eth_accounts' });

    if (accounts && accounts.length > 0) {
      console.log('[Wallet] Auto-reconnecting with existing authorization:', accounts[0]);

      const result = await createProviderAndSigner(ethereum);
      if (!result) return;

      const { provider, signer, address, chainId } = result;

      useWalletStore.setState({
        address,
        signer,
        provider,
        chainId,
        isWrongNetwork: !isLitVMChain(chainId),
        isConnecting: false,
        error: null,
      });

      attachListeners();
      console.log('[Wallet] Auto-reconnected:', address, 'Chain:', chainId);
    } else {
      console.log('[Wallet] No previously authorized accounts');
    }
  } catch (err) {
    console.warn('[Wallet] Auto-reconnect failed (non-fatal):', err);
  }
}

// Run auto-reconnect after a short delay
setTimeout(autoReconnect, 300);
