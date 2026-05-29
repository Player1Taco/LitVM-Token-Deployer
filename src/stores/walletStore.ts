/**
 * Zustand Wallet Store
 *
 * Manages wallet connection state for the LitVM Token Deployer.
 * Supports MetaMask and EVM-compatible wallets via window.ethereum.
 *
 * Fixes issue #11: zustand v5 was declared but no store was visible.
 */

import { create } from 'zustand';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import {
  LITVM_CHAIN_ID,
  LITVM_CHAIN_ID_HEX,
  LITVM_CHAIN_CONFIG,
} from '../utils/chain';

interface WalletState {
  /** Connected wallet address (checksummed) or null */
  address: string | null;
  /** ethers.js v6 signer for signing transactions */
  signer: JsonRpcSigner | null;
  /** Whether a connection request is in progress */
  isConnecting: boolean;
  /** Whether wallet is connected to the wrong network */
  isWrongNetwork: boolean;
  /** Error message from last connection attempt */
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToLitVM: () => Promise<void>;
  /** Internal: update chain state after network change */
  _handleChainChanged: (chainIdHex: string) => void;
  /** Internal: update address state after account change */
  _handleAccountsChanged: (accounts: string[]) => void;
}

/** Guard against concurrent connection requests */
let isConnectingLock = false;

export const useWalletStore = create<WalletState>((set, get) => ({
  address: null,
  signer: null,
  isConnecting: false,
  isWrongNetwork: false,
  error: null,

  connect: async () => {
    // Guard: prevent concurrent connection requests
    if (isConnectingLock) {
      console.log('[Wallet] Connection already in progress, ignoring duplicate request');
      return;
    }

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      set({ error: 'No Ethereum wallet found. Please install MetaMask.' });
      return;
    }

    isConnectingLock = true;
    set({ isConnecting: true, error: null });

    try {
      // Request account access
      const accounts: string[] = await ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        set({ isConnecting: false, error: 'No accounts returned from wallet.' });
        return;
      }

      const provider = new BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      set({
        address,
        signer,
        isWrongNetwork: chainId !== LITVM_CHAIN_ID,
        isConnecting: false,
        error: null,
      });

      console.log('[Wallet] Connected:', address, 'Chain:', chainId);

      // Set up event listeners (remove old ones first)
      ethereum.removeListener('chainChanged', get()._handleChainChanged);
      ethereum.removeListener('accountsChanged', get()._handleAccountsChanged);
      ethereum.on('chainChanged', get()._handleChainChanged);
      ethereum.on('accountsChanged', get()._handleAccountsChanged);
    } catch (err: any) {
      console.error('[Wallet] Connection error:', err);

      let errorMsg = 'Failed to connect wallet.';
      if (err?.code === 4001 || err?.code === 'ACTION_REJECTED') {
        errorMsg = 'Connection request was rejected.';
      } else if (err?.code === -32002) {
        errorMsg = 'A connection request is already pending in your wallet.';
      }

      set({ isConnecting: false, error: errorMsg });
    } finally {
      isConnectingLock = false;
    }
  },

  disconnect: () => {
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      const state = get();
      ethereum.removeListener('chainChanged', state._handleChainChanged);
      ethereum.removeListener('accountsChanged', state._handleAccountsChanged);
    }
    set({
      address: null,
      signer: null,
      isConnecting: false,
      isWrongNetwork: false,
      error: null,
    });
    console.log('[Wallet] Disconnected');
  },

  switchToLitVM: async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) return;

    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: LITVM_CHAIN_ID_HEX }],
      });
    } catch (switchErr: any) {
      // Chain not added to wallet — add it
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
      } else {
        console.error('[Wallet] Failed to switch to LitVM:', switchErr);
        set({ error: 'Failed to switch to LitVM network.' });
      }
    }
  },

  _handleChainChanged: (chainIdHex: string) => {
    const chainId = parseInt(chainIdHex, 16);
    console.log('[Wallet] Chain changed to:', chainId);
    set({ isWrongNetwork: chainId !== LITVM_CHAIN_ID });

    // Re-establish signer on chain change
    const ethereum = (window as any).ethereum;
    if (ethereum && get().address) {
      const provider = new BrowserProvider(ethereum);
      provider.getSigner().then((signer) => {
        set({ signer });
      }).catch((err) => {
        console.warn('[Wallet] Failed to update signer after chain change:', err);
      });
    }
  },

  _handleAccountsChanged: (accounts: string[]) => {
    if (accounts.length === 0) {
      console.log('[Wallet] Account disconnected');
      get().disconnect();
    } else {
      const newAddress = accounts[0];
      console.log('[Wallet] Account changed to:', newAddress);

      const ethereum = (window as any).ethereum;
      if (ethereum) {
        const provider = new BrowserProvider(ethereum);
        provider.getSigner().then((signer) => {
          signer.getAddress().then((address) => {
            set({ address, signer });
          });
        }).catch((err) => {
          console.warn('[Wallet] Failed to update signer after account change:', err);
        });
      }
    }
  },
}));
