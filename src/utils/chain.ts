/**
 * LitVM Chain Configuration
 *
 * All chain-related constants for the LitVM network.
 *
 * Chain ID: 4693 = 0x1255 in hex
 *   0x1255 = 1*4096 + 2*256 + 5*16 + 5 = 4693 ✓
 *
 * Fix #29: Added isLitVMChain() helper for production guard checks.
 * Fix #29: Added validateChainConnection() for pre-deploy verification.
 */

export const LITVM_CHAIN_ID = 4693;
export const LITVM_CHAIN_ID_HEX = '0x1255';

export const LITVM_RPC_URL = 'https://rpc-mainnet.litprotocol.com';
export const LITVM_EXPLORER_URL = 'https://explorer.litprotocol.com';

/**
 * EIP-3085 chain configuration for wallet_addEthereumChain.
 */
export const LITVM_CHAIN_CONFIG = {
  chainId: LITVM_CHAIN_ID_HEX,
  chainName: 'LitVM',
  nativeCurrency: {
    name: 'LIT',
    symbol: 'LIT',
    decimals: 18,
  },
  rpcUrls: [LITVM_RPC_URL],
  blockExplorerUrls: [LITVM_EXPLORER_URL],
};

/**
 * Check if a given chain ID matches LitVM.
 *
 * Accepts both decimal and hex formats.
 */
export function isLitVMChain(chainId: number | string | null | undefined): boolean {
  if (chainId === null || chainId === undefined) return false;

  if (typeof chainId === 'string') {
    // Handle hex strings
    if (chainId.startsWith('0x') || chainId.startsWith('0X')) {
      return parseInt(chainId, 16) === LITVM_CHAIN_ID;
    }
    return parseInt(chainId, 10) === LITVM_CHAIN_ID;
  }

  return chainId === LITVM_CHAIN_ID;
}

/**
 * Pre-deploy chain validation.
 *
 * Queries the wallet's current chain ID and verifies it matches LitVM.
 * Returns an object with the validation result and current chain ID.
 *
 * Fix #29: Used by useTokenDeploy as an additional pre-flight check
 * to catch race conditions where the chain changes between the UI
 * check and the actual deploy call.
 */
export async function validateChainConnection(ethereum: any): Promise<{
  valid: boolean;
  chainId: number;
  error: string | null;
}> {
  if (!ethereum) {
    return { valid: false, chainId: 0, error: 'No wallet provider detected.' };
  }

  try {
    const chainIdHex: string = await ethereum.request({ method: 'eth_chainId' });
    const chainId = parseInt(chainIdHex, 16);

    if (chainId !== LITVM_CHAIN_ID) {
      return {
        valid: false,
        chainId,
        error: `Wrong network: connected to chain ${chainId}, expected LitVM (${LITVM_CHAIN_ID}). Please switch networks.`,
      };
    }

    return { valid: true, chainId, error: null };
  } catch (err: any) {
    return {
      valid: false,
      chainId: 0,
      error: `Failed to verify chain: ${err?.message || 'Unknown error'}`,
    };
  }
}

export function getExplorerTxUrl(hash: string): string {
  return `${LITVM_EXPLORER_URL}/tx/${hash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${LITVM_EXPLORER_URL}/address/${address}`;
}
