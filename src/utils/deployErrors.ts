/**
 * Deploy Error Parser
 *
 * Parses ethers v6 errors into user-friendly messages.
 *
 * Fix #31: Added rate-limiting / "too many errors" detection.
 */

function extractDeepMessage(err: any): string {
  const candidates: string[] = [];

  if (typeof err === 'string') return err;

  if (err?.shortMessage) candidates.push(err.shortMessage);
  if (err?.reason) candidates.push(err.reason);
  if (err?.message) candidates.push(err.message);
  if (err?.info?.error?.message) candidates.push(err.info.error.message);
  if (err?.error?.message) candidates.push(err.error.message);
  if (err?.data?.message) candidates.push(err.data.message);

  const filtered = candidates.filter(
    (m) => m && !m.includes('could not coalesce error')
  );

  return filtered[0] || candidates[0] || 'Unknown error';
}

function extractErrorCode(err: any): string | null {
  return err?.code || err?.error?.code || err?.info?.error?.code || null;
}

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

function isCoalesceError(err: any): boolean {
  const msg = extractDeepMessage(err).toLowerCase();
  return msg.includes('could not coalesce error') || msg.includes('coalesce');
}

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
 * Fix #31: Detect ethers v6 rate-limiting / "too many errors" state.
 *
 * ethers v6 tracks RPC errors per-provider. When the error count exceeds
 * a threshold, the provider enters a "paused" state and refuses new requests,
 * returning: "RPC endpoint returned too many errors, retrying in X minutes."
 */
export function isRateLimitError(err: any): boolean {
  const msg = extractDeepMessage(err).toLowerCase();

  return (
    msg.includes('too many errors') ||
    msg.includes('too many request') ||
    msg.includes('rate limit') ||
    msg.includes('retrying in') ||
    msg.includes('429') ||
    msg.includes('throttl')
  );
}

/**
 * Parse a deployment error into a user-friendly message.
 */
export function parseDeployError(err: unknown, phase: 'send' | 'confirm' | 'fee'): string {
  if (!err) return 'An unknown error occurred during deployment.';

  const error = err as any;

  // --- User Rejection ---
  if (isUserRejection(error)) {
    if (phase === 'fee') {
      return 'Fee payment was rejected in your wallet. No tokens were deployed and no fees were charged.';
    }
    return 'Transaction was rejected in your wallet. No tokens were deployed and no gas was spent.';
  }

  // --- Rate Limiting (Fix #31) ---
  if (isRateLimitError(error)) {
    return (
      'The RPC endpoint is temporarily rate-limited.\n\n' +
      'This happens when too many requests are sent in quick succession. ' +
      'Please wait 30-60 seconds and try again. The deployment will use a fresh connection on retry.'
    );
  }

  // --- "Could not coalesce error" ---
  if (isCoalesceError(error)) {
    if (isInsufficientFundsError(error)) {
      return (
        'Insufficient LIT balance to cover gas fees.\n\n' +
        'Contract deployment requires native LIT tokens to pay for gas. ' +
        'Please add LIT to your wallet and try again.'
      );
    }

    return (
      'The RPC returned an unexpected response.\n\n' +
      'This usually means one of:\n' +
      '• Your wallet doesn\'t have enough LIT for gas fees\n' +
      '• The LitVM RPC is temporarily overloaded\n' +
      '• The contract constructor would revert\n\n' +
      'Try: Wait a moment, then try again. The deployer will use a fresh connection.'
    );
  }

  // --- Insufficient Funds ---
  if (isInsufficientFundsError(error)) {
    if (phase === 'fee') {
      return (
        'Insufficient LIT balance to pay the 0.1 LIT deployment fee.\n\n' +
        'Please ensure your wallet has at least 0.1 LIT plus gas fees and try again.'
      );
    }
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
  const phaseNames: Record<string, string> = {
    send: 'sending the deployment transaction',
    confirm: 'confirming the deployment',
    fee: 'sending the deployment fee',
  };
  const phaseName = phaseNames[phase] || 'deploying';

  return (
    `Error ${phaseName}.\n\n` +
    `Details: ${deepMsg.slice(0, 200)}`
  );
}
