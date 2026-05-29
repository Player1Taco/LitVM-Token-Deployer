/**
 * Formatting Utilities
 *
 * Fix #16: formatTokenAmount handles NaN, negative, and very small fractions
 * Fix #17: timeAgo handles future timestamps gracefully
 */

import { formatUnits } from 'ethers';

/**
 * Format a token amount (string in token units) for display.
 *
 * Fix #16: Handles NaN, negative, very small fractions, and very large values.
 *
 * @param value - Token amount as a string (e.g., "999990000.0" or wei BigInt)
 * @returns Formatted string like "999.99M", "10K", "1.5", etc.
 */
export function formatTokenAmount(value: string | bigint): string {
  let numStr: string;

  if (typeof value === 'bigint') {
    numStr = formatUnits(value, 18);
  } else {
    numStr = value;
  }

  const num = parseFloat(numStr);

  if (isNaN(num)) return '0';
  if (num < 0) return `-${formatTokenAmount(Math.abs(num).toString())}`;
  if (num === 0) return '0';

  // Very small fractions
  if (num > 0 && num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

  // Billions
  if (num >= 1_000_000_000) {
    const b = num / 1_000_000_000;
    return `${b % 1 === 0 ? b.toFixed(0) : b.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}B`;
  }

  // Millions
  if (num >= 1_000_000) {
    const m = num / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }

  // Thousands
  if (num >= 1_000) {
    const k = num / 1_000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}K`;
  }

  // Under 1000
  if (num % 1 === 0) return num.toFixed(0);
  return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Convert a timestamp to a relative time string.
 *
 * Fix #17: Handles future timestamps gracefully.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns String like "2s ago", "5m ago", "just now", "in 3s" (for future)
 */
export function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  // Future timestamp (Fix #17)
  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 5000) return 'just now';
    if (absDiff < 60_000) return `in ${Math.floor(absDiff / 1000)}s`;
    return 'in the future';
  }

  if (diff < 5000) return 'just now';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Truncate an Ethereum address for display.
 *
 * @param address - Full address string
 * @param startLen - Number of characters to show at start (default 6)
 * @param endLen - Number of characters to show at end (default 4)
 * @returns Truncated address like "0x1234...abcd"
 */
export function truncateAddress(address: string, startLen = 6, endLen = 4): string {
  if (!address || address.length <= startLen + endLen) return address;
  return `${address.slice(0, startLen)}...${address.slice(-endLen)}`;
}

/**
 * Validate a token name for deployment.
 *
 * Fix #15: Input sanitization.
 *
 * @param name - The trimmed token name
 * @returns Error message string, or null if valid
 */
export function validateTokenName(name: string): string | null {
  if (!name || name.length === 0) {
    return 'Token name is required.';
  }
  if (name.length < 2) {
    return 'Token name must be at least 2 characters.';
  }
  if (name.length > 64) {
    return 'Token name must be 64 characters or fewer.';
  }
  // Allow letters, numbers, spaces, hyphens, underscores, dots
  if (!/^[a-zA-Z0-9\s\-_.]+$/.test(name)) {
    return 'Token name contains invalid characters. Use letters, numbers, spaces, hyphens, underscores, or dots.';
  }
  return null;
}

/**
 * Validate a token symbol for deployment.
 *
 * Fix #15: Input sanitization.
 *
 * @param symbol - The trimmed, uppercased token symbol
 * @returns Error message string, or null if valid
 */
export function validateTokenSymbol(symbol: string): string | null {
  if (!symbol || symbol.length === 0) {
    return 'Token symbol is required.';
  }
  if (symbol.length < 2) {
    return 'Token symbol must be at least 2 characters.';
  }
  if (symbol.length > 10) {
    return 'Token symbol must be 10 characters or fewer.';
  }
  // Only uppercase letters and numbers
  if (!/^[A-Z0-9]+$/.test(symbol)) {
    return 'Token symbol must contain only uppercase letters and numbers.';
  }
  return null;
}
