/**
 * Zustand Wallet Store
 *
 * Manages wallet connection state for the LitVM Token Deployer.
 * Supports MetaMask and EVM-compatible wallets via window.ethereum.
 *
 * Fixes:
 *  - BrowserProvider race condition: use provider.getSigner() directly
 *  - Event listener deduplication via stable refs
 *  - Ensure state is always consistent on success/failure
 *  - Handle edge cases: no accounts, provider errors, chain detection
 */

import { create } from 'zustand';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import {
  LITVM_CHAIN_ID,
  LITVM_CHAIN_ID_HEX,
  LITVM_CHAIN_CONFIG,
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

/**
 * Remove all MetaMask event listeners safely.
 */
function removeAllListeners() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) return;

  if (boundChainChanged) {
    try { ethereum.removeListener('chainChanged', boundChainChanged); } catch {}
    boundChainChanged = null;
  }
  if (boundAccountsChanged) {
    try { ethereum.removeListener('accountsChanged', boundAccountsChanged); } catch {}
    boundAccountsChanged = null;
  }
}

/**
 * Attach MetaMask event listeners with stable references.
 */
function attachListeners() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) return;

  // Always remove first to prevent duplicates
  removeAllListeners();

  boundChainChanged = (chainIdHex: string) => {
    const chainId = parseInt(chainIdHex, 16);
    console.log('[Wallet] Chain changed to:', chainId);

    const store = useWalletStore.getState();
    useWalletStore.setState({ 
      isWrongNetwork: chainId !== LITVM_CHAIN_ID,
      chainId,
    });

    // Re-establish signer on chain change
    if (store.address) {
      refreshSigner().catch((err) => {
        console.warn('[Wallet] Failed to update signer after chain change:', err);
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
        console.warn('[Wallet] Failed to update signer after account change:', err);
      });
    }
  };

  ethereum.on('chainChanged', boundChainChanged);
  ethereum.on('accountsChanged', boundAccountsChanged);
  console.log('[Wallet] Event listeners attached');
}

/**
 * Re-create the BrowserProvider and signer after a chain/account change.
 */
async function refreshSigner() {
  const ethereum = (window as any).ethereum;
  if (!ethereum) return;

  try {
    const provider = new BrowserProvider(ethereum, 'any');
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    useWalletStore.setState({
      provider,
      signer,
      address,
      chainId,
      isWrongNetwork: chainId !== LITVM_CHAIN_ID,
    });

    console.log('[Wallet] Signer refreshed:', address, 'Chain:', chainId);
  } catch (err) {
    console.warn('[Wallet] refreshSigner failed:', err);
  }
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

  connect: async () => {
    // Guard: prevent concurrent connection requests
    if (isConnectingLock) {
      console.log('[Wallet] Connection already in progress, ignoring');
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      set({ error: 'No Ethereum wallet detected. Please install MetaMask or a compatible wallet.' });
      return;
    }

    isConnectingLock = true;
    set({ isConnecting: true, error: null });

    try {
      // Step 1: Create provider with 'any' network to prevent network mismatch errors
      console.log('[Wallet] Creating BrowserProvider...');
      const provider = new BrowserProvider(ethereum, 'any');

      // Step 2: Request accounts through the provider's internal mechanism
      // This calls eth_requestAccounts internally and is the ethers v6 recommended approach
      console.log('[Wallet] Requesting signer (triggers wallet popup if needed)...');
      let signer: JsonRpcSigner;
      try {
        signer = await provider.getSigner();
      } catch (signerErr: any) {
        // If getSigner fails, try explicit account request first
        console.log('[Wallet] getSigner failed, trying eth_requestAccounts explicitly...');
        
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) {
          set({ isConnecting: false, error: 'No accounts returned from wallet.' });
          return;
        }

        // Recreate provider after explicit account request
        const freshProvider = new BrowserProvider(ethereum, 'any');
        signer = await freshProvider.getSigner();
        
        // Use the fresh provider
        set({ provider: freshProvider });
      }

      // Step 3: Get address and chain info
      const address = await signer.getAddress();
      console.log('[Wallet] Got address:', address);

      let chainId: number;
      try {
        const network = await provider.getNetwork();
        chainId = Number(network.chainId);
      } catch (networkErr) {
        // Fallback: get chain ID directly from MetaMask
        console.warn('[Wallet] provider.getNetwork() failed, using eth_chainId fallback');
        const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
        chainId = parseInt(chainIdHex, 16);
      }

      console.log('[Wallet] Connected successfully:', { address, chainId });

      // Step 4: Update state
      set({
        address,
        signer,
        provider,
        chainId,
        isWrongNetwork: chainId !== LITVM_CHAIN_ID,
        isConnecting: false,
        error: null,
      });

      // Step 5: Attach event listeners for future changes
      attachListeners();

    } catch (err: any) {
      console.error('[Wallet] Connection error:', err);

      let errorMsg = 'Failed to connect wallet.';

      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
        errorMsg = 'Connection request was rejected by user.';
      } else if (err?.code === -32002) {
        errorMsg = 'A connection request is already pending. Check your wallet.';
      } else if (err?.code === -32603) {
        errorMsg = 'Internal wallet error. Try refreshing the page.';
      } else if (err?.message?.includes('user rejected')) {
        errorMsg = 'Connection request was rejected by user.';
      } else if (err?.message) {
        errorMsg = `Wallet error: ${err.message.slice(0, 120)}`;
      }

      set({ 
        isConnecting: false, 
        error: errorMsg,
        address: null,
        signer: null,
        provider: null,
      });
    } finally {
      isConnectingLock = false;
    }
  },

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

  switchToLitVM: async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      set({ error: 'No wallet detected.' });
      return;
    }

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: LITVM_CHAIN_ID_HEX }],
      });
    } catch (switchErr: any) {
      // Chain not added — add it
      if (switchErr?.code === 4902) {
        try {
          await ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [LITVM_CHAIN_CONFIG],
          });
        } catch (addErr: any) {
          console.error('[Wallet] Failed to add LitVM chain:', addErr);
          set({ error: 'Failed to add LitVM network to wallet.' });
        }
      } else if (switchErr?.code === 4001) {
        set({ error: 'Network switch was rejected by user.' });
      } else {
        console.error('[Wallet] Failed to switch to LitVM:', switchErr);
        set({ error: 'Failed to switch to LitVM network.' });
      }
    }
  },
}));
