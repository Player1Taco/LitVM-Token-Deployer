/**
 * Deploy Error Parser
 *
 * Parses ethers v6 errors into user-friendly messages.
 * Handles all known error codes and edge cases including:
 *  - "could not coalesce error" (gas estimation failure / RPC parse failure)
 *  - User rejection (code 4001 / ACTION_REJECTED)
 *  - Insufficient funds (INSUFFICIENT_FUNDS)
 *  - Nonce issues (NONCE_EXPIRED, REPLACEMENT_UNDERPRICED)
 *  - Network errors (NETWORK_ERROR, SERVER_ERROR, TIMEOUT)
 *  - Contract revert reasons
 */

/**
 * Extract the most useful error message from an ethers v6 error object.
 *
 * ethers v6 wraps errors in complex structures. This function walks the
 * error chain to find the most relevant message.
 */
function extractDeepMessage(err: any): string {
  // ethers v6 often nests errors: err.info?.error?.message or err.error?.message
  const candidates: string[] = [];

  if (typeof err === 'string') return err;

  if (err?.shortMessage) candidates.push(err.shortMessage);
  if (err?.reason) candidates.push(err.reason);
  if (err?.message) candidates.push(err.message);
  if (err?.info?.error?.message) candidates.push(err.info.error.message);
  if (err?.error?.message) candidates.push(err.error.message);
  if (err?.data?.message) candidates.push(err.data.message);

  // Return the shortest non-generic message (most specific)
  const filtered = candidates.filter(
    (m) => m && !m.includes('could not coalesce error')
  );

  return filtered[0] || candidates[0] || 'Unknown error';
}

/**
 * Extract ethers v6 error code from the error object.
 */
function extractErrorCode(err: any): string | null {
  return err?.code || err?.error?.code || err?.info?.error?.code || null;
}

/**
 * Detect if the error is related to insufficient gas/funds.
 */
function isInsufficientFundsError(err: any): boolean {
  const code = extractErrorCode(err);
  const msg = extractDeepMessage(err).toLowerCase();

  return (
    code === 'INSUFFICIENT_FUNDS' ||
    msg.includes('insufficient funds') ||
    msg.includes('insufficient balance') ||
    msg.includes('gas required exceeds allowance') ||
    msg.includes("sender doesn't have enough funds") ||
    msg.includes('out of gas') ||
    msg.includes('exceeds balance')
  );
}

/**
 * Detect if the error is a user rejection.
 */
function isUserRejection(err: any): boolean {
  const code = extractErrorCode(err);
  const numCode = err?.code || err?.error?.code;
  const msg = extractDeepMessage(err).toLowerCase();

  return (
    code === 'ACTION_REJECTED' ||
    numCode === 4001 ||
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('user cancelled') ||
    msg.includes('rejected the request')
  );
}

/**
 * Detect if the error is a "could not coalesce" error from ethers v6.
 *
 * This happens when ethers fails to parse the RPC's error response,
 * typically during gas estimation. Common causes:
 *  - Not enough native tokens to pay for gas
 *  - RPC returns non-standard error format (common on custom chains)
 *  - Contract deployment would revert but the revert reason can't be decoded
 */
function isCoalesceError(err: any): boolean {
  const msg = extractDeepMessage(err).toLowerCase();
  return msg.includes('could not coalesce error') || msg.includes('coalesce');
}

/**
 * Detect if the error is a nonce conflict.
 */
function isNonceError(err: any): boolean {
  const code = extractErrorCode(err);
  const msg = extractDeepMessage(err).toLowerCase();

  return (
    code === 'NONCE_EXPIRED' ||
    code === 'REPLACEMENT_UNDERPRICED' ||
    msg.includes('nonce') ||
    msg.includes('replacement transaction underpriced')
  );
}

/**
 * Detect network/RPC errors.
 */
function isNetworkError(err: any): boolean {
  const code = extractErrorCode(err);
  const msg = extractDeepMessage(err).toLowerCase();

  return (
    code === 'NETWORK_ERROR' ||
    code === 'SERVER_ERROR' ||
    code === 'TIMEOUT' ||
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset')
  );
}

/**
 * Parse a deployment error into a user-friendly message.
 *
 * @param err - The raw error from ethers / MetaMask
 * @param phase - Which phase the error occurred in: 'send' (creating tx) or 'confirm' (waiting for confirmation)
 * @returns A human-readable error message
 */
export function parseDeployError(err: unknown, phase: 'send' | 'confirm'): string {
  if (!err) return 'An unknown error occurred during deployment.';

  const error = err as any;

  // --- User Rejection ---
  if (isUserRejection(error)) {
    return 'Transaction was rejected in your wallet. No tokens were deployed and no gas was spent.';
  }

  // --- "Could not coalesce error" (ethers v6 specific) ---
  if (isCoalesceError(error)) {
    // Try to find a more specific cause
    if (isInsufficientFundsError(error)) {
      return (
        'Insufficient LIT balance to cover gas fees.\n\n' +
        'Contract deployment requires native LIT tokens to pay for gas. ' +
        'Please add LIT to your wallet and try again.'
      );
    }

    return (
      'The deployment transaction failed during gas estimation.\n\n' +
      'This usually means one of:\n' +
      '• Your wallet doesn\'t have enough LIT for gas fees\n' +
      '• The LitVM RPC returned an unexpected response\n' +
      '• The contract constructor would revert\n\n' +
      'Try: Check your LIT balance, refresh the page, or switch to a different RPC endpoint.'
    );
  }

  // --- Insufficient Funds ---
  if (isInsufficientFundsError(error)) {
    return (
      'Insufficient LIT balance to cover gas fees.\n\n' +
      'Deploying a contract requires native LIT tokens for gas. ' +
      'Please ensure your wallet has enough LIT and try again.'
    );
  }

  // --- Nonce Errors ---
  if (isNonceError(error)) {
    return (
      'Transaction nonce conflict detected.\n\n' +
      'This can happen if you have pending transactions. ' +
      'Try resetting your wallet\'s transaction history (MetaMask → Settings → Advanced → Clear activity tab data) or wait for pending transactions to complete.'
    );
  }

  // --- Network Errors ---
  if (isNetworkError(error)) {
    return (
      'Network connection error.\n\n' +
      'Could not reach the LitVM RPC endpoint. Please check your internet connection and try again. ' +
      'If the issue persists, the RPC may be temporarily unavailable.'
    );
  }

  // --- Pending Request ---
  if (error?.code === -32002) {
    return (
      'A wallet request is already pending.\n\n' +
      'Check your wallet extension — there may be a pending confirmation dialog. ' +
      'Dismiss it and try again.'
    );
  }

  // --- Contract Revert ---
  if (
    extractErrorCode(error) === 'CALL_EXCEPTION' ||
    extractDeepMessage(error).toLowerCase().includes('revert')
  ) {
    const reason = error?.reason || error?.data?.message || '';
    const prefix = phase === 'confirm'
      ? 'The contract deployment was reverted on-chain.'
      : 'The contract deployment would revert.';

    return reason
      ? `${prefix}\n\nReason: ${reason}`
      : `${prefix}\n\nNo revert reason was provided. This may indicate a constructor error.`;
  }

  // --- Unpredictable Gas Limit ---
  if (extractErrorCode(error) === 'UNPREDICTABLE_GAS_LIMIT') {
    return (
      'Could not estimate gas for deployment.\n\n' +
      'The contract deployment may fail on-chain. Common causes:\n' +
      '• Insufficient LIT balance for gas\n' +
      '• Constructor would revert with the given parameters\n' +
      '• RPC endpoint issues'
    );
  }

  // --- Generic Fallback ---
  const deepMsg = extractDeepMessage(error);
  const phaseName = phase === 'send' ? 'sending' : 'confirming';

  return (
    `Error ${phaseName} the deployment transaction.\n\n` +
    `Details: ${deepMsg.slice(0, 200)}`
  );
}
