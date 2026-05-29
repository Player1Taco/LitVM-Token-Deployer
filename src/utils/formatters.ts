/**
 * Formatting Helpers
 *
 * Extracted from TokenDeployer to reduce component size (fix #26).
 * Fixes issues #16 (formatTokenAmount edge cases), #17 (timeAgo future timestamps).
 */

/**
 * Formats a token amount string to a human-readable abbreviated form.
 *
 * Fix #16: Handles negative values, NaN, very small fractions.
 *
 * @param value - String representation of a token amount (e.g. "999990000.0")
 */
export function formatTokenAmount(value: string): string {
  const num = parseFloat(value);

  // Handle NaN and non-numeric strings
  if (isNaN(num) || !isFinite(num)) return value;

  // Handle negative values (shouldn't happen for token amounts, but guard)
  if (num < 0) return '-' + formatTokenAmount(String(Math.abs(num)));

  // Handle zero
  if (num === 0) return '0';

  // Handle very small fractions (< 0.0001)
  if (num > 0 && num < 0.0001) {
    return '<0.0001';
  }

  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
  }
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(2).replace(/\.?0+$/, '') + 'K';
  }
  return num.toLocaleString('en-US', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  });
}

/**
 * Formats a timestamp into a human-readable "time ago" string.
 *
 * Fix #17: Handles future timestamps gracefully by returning "just now"
 * instead of negative values.
 *
 * @param timestamp - Unix timestamp in milliseconds
 */
export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  // Fix #17: Guard against future timestamps (clock skew)
  if (seconds < 0) return 'just now';

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Truncates an Ethereum address for display.
 * e.g. "0x1234...abcd"
 */
export function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Regex for allowed token name characters.
 * Allows alphanumeric, spaces, hyphens, underscores, and periods.
 * Blocks emojis, control characters, zero-width chars, HTML entities.
 *
 * Fix #15: Input sanitization for special characters.
 */
const VALID_TOKEN_NAME_REGEX = /^[a-zA-Z0-9 \-_.()]+$/;

/**
 * Regex for allowed token symbol characters.
 * Allows uppercase alphanumeric only.
 */
const VALID_TOKEN_SYMBOL_REGEX = /^[A-Z0-9]+$/;

/**
 * Validates a token name string.
 * Returns an error message string if invalid, or null if valid.
 *
 * Fix #15: Sanitizes against special characters, emojis, control chars.
 */
export function validateTokenName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Token name cannot be empty.';
  if (trimmed.length > 64) return 'Token name must be 64 characters or less.';
  if (!VALID_TOKEN_NAME_REGEX.test(trimmed)) {
    return 'Token name can only contain letters, numbers, spaces, hyphens, underscores, periods, and parentheses.';
  }
  return null;
}

/**
 * Validates a token symbol string.
 * Returns an error message string if invalid, or null if valid.
 *
 * Fix #15: Sanitizes against special characters.
 */
export function validateTokenSymbol(symbol: string): string | null {
  const trimmed = symbol.trim().toUpperCase();
  if (trimmed.length === 0) return 'Token symbol cannot be empty.';
  if (trimmed.length > 10) return 'Token symbol must be 10 characters or less.';
  if (!VALID_TOKEN_SYMBOL_REGEX.test(trimmed)) {
    return 'Token symbol can only contain uppercase letters and numbers.';
  }
  return null;
}
