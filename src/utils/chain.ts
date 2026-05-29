/**
 * LitVM Chain Configuration
 *
 * All chain-related constants for the LitVM network.
 */

export const LITVM_CHAIN_ID = 4693;
export const LITVM_CHAIN_ID_HEX = '0x1255';

export const LITVM_RPC_URL = 'https://rpc-mainnet.litprotocol.com';
export const LITVM_EXPLORER_URL = 'https://explorer.litprotocol.com';

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

export function getExplorerTxUrl(hash: string): string {
  return `${LITVM_EXPLORER_URL}/tx/${hash}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${LITVM_EXPLORER_URL}/address/${address}`;
}
