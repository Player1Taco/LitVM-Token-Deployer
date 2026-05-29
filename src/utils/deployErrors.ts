/**
 * Deploy Error Parsing
 *
 * Extracted from TokenDeployer to reduce component size (fix #26).
 * Handles contract revert reason extraction, user-friendly error mapping,
 * and deployment error classification.
 */

// ---------------------------------------------------------------------------
// Contract revert reason → user-friendly message map
// These match the require() strings in LitToken.sol
// ---------------------------------------------------------------------------
const CONTRACT_REVERT_MAP: Record<string, string> = {
  // Constructor reverts
  'LitToken: name cannot be empty':
    'Token name cannot be empty. Please enter a valid name.',
  'LitToken: symbol cannot be empty':
    'Token symbol cannot be empty. Please enter a valid symbol.',

  // Transfer reverts
  'LitToken: transfer to zero address':
    'Cannot transfer to the zero address.',
  'LitToken: transfer from zero address':
    'Cannot transfer from the zero address.',
  'LitToken: self-transfer not allowed':
    'Self-transfers are not allowed.',
  'LitToken: amount must be greater than zero':
    'Transfer amount must be greater than zero.',
  'LitToken: insufficient balance':
    'Insufficient token balance for this transfer.',
  'LitToken: insufficient allowance':
    'Insufficient allowance for this transfer.',

  // Approval reverts
  'LitToken: approve to zero address':
    'Cannot approve the zero address as spender.',
  'LitToken: added value must be greater than zero':
    'Allowance increase must be greater than zero.',
  'LitToken: subtracted value must be greater than zero':
    'Allowance decrease must be greater than zero.',
  'LitToken: decreased allowance below zero':
    'Cannot decrease allowance below zero.',

  // Ownership reverts
  'LitToken: caller is not the owner':
    'Only the contract owner can perform this action.',
  'LitToken: new owner is zero address':
    'New owner cannot be the zero address.',
};

/**
 * Extracts a human-readable revert reason from an ethers.js v6 error object.
 * Checks 7 different locations in nested error structures.
 */
export function extractRevertReason(err: unknown): string | null {
  const e = err as any;
  if (!e) return null;

  // Location 1: err.reason
  if (typeof e.reason === 'string' && e.reason.length > 0) {
    return e.reason;
  }

  // Location 2: err.revert.args[0]
  if (e.revert?.args?.[0] && typeof e.revert.args[0] === 'string') {
    return e.revert.args[0];
  }

  // Location 3: err.error (recursive)
  if (e.error) {
    const nested = extractRevertReason(e.error);
    if (nested) return nested;
  }

  // Location 4: err.info.error (recursive)
  if (e.info?.error) {
    const infoReason = extractRevertReason(e.info.error);
    if (infoReason) return infoReason;
  }

  // Location 5: err.shortMessage regex
  if (typeof e.shortMessage === 'string') {
    const match = e.shortMessage.match(
      /reverted with reason string ['"](.+?)['"]/
    );
    if (match?.[1]) return match[1];
    const match2 = e.shortMessage.match(/execution reverted:\s*(.+)/i);
    if (match2?.[1]) return match2[1].trim().replace(/^['"]|['"]$/g, '');
  }

  // Location 6: err.message regex
  if (typeof e.message === 'string') {
    const match = e.message.match(
      /reverted with reason string ['"](.+?)['"]/
    );
    if (match?.[1]) return match[1];
    const match2 = e.message.match(/execution reverted:\s*(.+?)(?:\s*\(|$)/i);
    if (match2?.[1]) return match2[1].trim().replace(/^['"]|['"]$/g, '');
  }

  // Location 7: err.data ABI-encoded Error(string)
  if (typeof e.data === 'string' && e.data.startsWith('0x08c379a2')) {
    try {
      const hex = e.data.slice(10);
      const offset = parseInt(hex.slice(0, 64), 16);
      const dataStart = offset * 2;
      const length = parseInt(hex.slice(dataStart, dataStart + 64), 16);
      const strHex = hex.slice(dataStart + 64, dataStart + 64 + length * 2);
      let str = '';
      for (let i = 0; i < strHex.length; i += 2) {
        str += String.fromCharCode(parseInt(strHex.slice(i, i + 2), 16));
      }
      if (str.length > 0) return str;
    } catch {
      // Failed to decode — fall through
    }
  }

  return null;
}

/**
 * Maps a revert reason to a user-friendly error message.
 */
export function getRevertErrorMessage(reason: string): string {
  if (CONTRACT_REVERT_MAP[reason]) {
    return CONTRACT_REVERT_MAP[reason];
  }
  for (const [key, message] of Object.entries(CONTRACT_REVERT_MAP)) {
    if (reason.includes(key)) {
      return message;
    }
  }
  if (reason.startsWith('LitToken:')) {
    const stripped = reason.replace('LitToken: ', '');
    return stripped.charAt(0).toUpperCase() + stripped.slice(1) + '.';
  }
  return `Contract reverted: ${reason}`;
}

/**
 * Parses a deployment error into a user-friendly message.
 *
 * @param err   - The error object from ethers.js
 * @param phase - Whether the error occurred during 'send' or 'confirm'
 */
export function parseDeployError(err: unknown, phase: 'send' | 'confirm'): string {
  const e = err as any;
  console.error(`[Deploy] Error during ${phase}:`, e);

  if (e?.code === 'ACTION_REJECTED' || e?.code === 4001) {
    return 'Transaction was rejected in your wallet.';
  }
  if (e?.code === 'INSUFFICIENT_FUNDS') {
    return 'Insufficient LIT balance to cover gas fees. Please add LIT to your wallet.';
  }
  if (
    e?.code === 'NONCE_EXPIRED' ||
    (typeof e?.message === 'string' && e.message.toLowerCase().includes('nonce'))
  ) {
    return 'Transaction nonce conflict. You may have a pending transaction — try resetting your wallet nonce or wait for pending transactions to confirm.';
  }
  if (
    e?.code === 'NETWORK_ERROR' ||
    e?.code === 'TIMEOUT' ||
    e?.code === 'SERVER_ERROR'
  ) {
    return 'Network error connecting to LitVM. Please check your internet connection and try again.';
  }

  const revertReason = extractRevertReason(e);
  if (revertReason) {
    console.log(`[Deploy] Extracted revert reason: "${revertReason}"`);
    return getRevertErrorMessage(revertReason);
  }

  if (e?.code === 'CALL_EXCEPTION') {
    if (phase === 'send') {
      return 'Contract constructor reverted during gas estimation. This usually means invalid inputs were provided. Please verify your token name and symbol.';
    }
    return 'Contract deployment was reverted by the network. The transaction was mined but the contract constructor failed.';
  }
  if (e?.code === 'UNPREDICTABLE_GAS_LIMIT') {
    const nestedReason = extractRevertReason(e?.error || e?.info?.error);
    if (nestedReason) {
      return getRevertErrorMessage(nestedReason);
    }
    return 'Gas estimation failed. The contract constructor may be reverting — please verify your token name and symbol are valid (non-empty).';
  }
  if (e?.code === 'TRANSACTION_REPLACED') {
    if (e?.cancelled) {
      return 'Transaction was cancelled in your wallet.';
    }
    return 'Transaction was replaced (speed-up). Please check your wallet for the updated transaction.';
  }

  if (typeof e?.shortMessage === 'string' && e.shortMessage.length > 0) {
    return e.shortMessage;
  }
  if (typeof e?.reason === 'string' && e.reason.length > 0) {
    return e.reason;
  }
  if (typeof e?.message === 'string' && e.message.length > 0) {
    const msg = e.message;
    return msg.length > 250 ? msg.slice(0, 250) + '...' : msg;
  }

  return phase === 'send'
    ? 'Failed to send deployment transaction. Please try again.'
    : 'Deployment transaction failed after being sent. Please check the explorer for details.';
}
