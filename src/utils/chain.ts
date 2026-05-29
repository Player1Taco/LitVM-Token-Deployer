/**
 * LitVM Chain Configuration
 *
 * Centralizes all chain-specific constants and helpers.
 * Used by useWallet for network switching and by UI for explorer links.
 */

export const LITVM_CHAIN_ID = 4337;
export const LITVM_CHAIN_ID_HEX = '0x10F1';
export const LITVM_RPC_URL = 'https://rpc.litvm.io';
export const LITVM_EXPLORER_URL = 'https://explorer.litvm.io';
export const LITVM_CHAIN_NAME = 'LitVM';
export const LITVM_CURRENCY_SYMBOL = 'LIT';
export const LITVM_CURRENCY_DECIMALS = 18;

/**
 * Chain configuration for wallet_addEthereumChain RPC call.
 * Used when the user needs to add LitVM to their wallet.
 */
export const LITVM_CHAIN_CONFIG = {
  chainId: LITVM_CHAIN_ID_HEX,
  chainName: LITVM_CHAIN_NAME,
  nativeCurrency: {
    name: LITVM_CURRENCY_SYMBOL,
    symbol: LITVM_CURRENCY_SYMBOL,
    decimals: LITVM_CURRENCY_DECIMALS,
  },
  rpcUrls: [LITVM_RPC_URL],
  blockExplorerUrls: [LITVM_EXPLORER_URL],
};

/**
 * Returns the explorer URL for a transaction hash.
 * @param txHash - The transaction hash
 */
export function getExplorerTxUrl(txHash: string): string {
  return `${LITVM_EXPLORER_URL}/tx/${txHash}`;
}

/**
 * Returns the explorer URL for a contract/wallet address.
 * @param address - The address
 */
export function getExplorerAddressUrl(address: string): string {
  return `${LITVM_EXPLORER_URL}/address/${address}`;
}

/**
 * Checks if a given chain ID matches LitVM.
 * Accepts both decimal and hex representations.
 */
export function isLitVMChain(chainId: number | string): boolean {
  if (typeof chainId === 'string') {
    const parsed = chainId.startsWith('0x')
      ? parseInt(chainId, 16)
      : parseInt(chainId, 10);
    return parsed === LITVM_CHAIN_ID;
  }
  return chainId === LITVM_CHAIN_ID;
}
