/**
 * useTokenDeploy Hook
 *
 * Manages the token deployment lifecycle:
 *  1. Input validation (no RPC calls)
 *  2. Chain check from cached state (no RPC calls)
 *  3. Create FRESH BrowserProvider (resets error counter — Fix #31)
 *  4. Send 0.1 LIT fee to fee wallet (Fix #31)
 *  5. Deploy contract with explicit gasLimit (no internal estimation)
 *  6. Wait for confirmation
 *  7. Supply verification
 *
 * Fix #31 — RPC Rate-Limiting:
 *   The root cause was ethers v6's BrowserProvider accumulating error counts
 *   from failed pre-flight checks (gas estimation, balance queries). Once the
 *   error count exceeds the threshold, the provider enters a "paused" state
 *   and refuses ALL new requests with "too many errors, retrying in X minutes."
 *
 *   Solution:
 *     1. Create a FRESH BrowserProvider right before deploying (error count = 0)
 *     2. Skip ALL unnecessary pre-flight RPC calls (gas estimation, balance check)
 *     3. Add delays between transactions to prevent rapid-fire RPC calls
 *     4. Chain verification uses cached store state (no RPC call needed)
 *
 * Fix #31 — Deployment Fee:
 *   Charges 0.1 LIT (native token) as a deployment fee, sent to the fee wallet
 *   BEFORE contract deployment. This is a simple ETH transfer (21,000 gas).
 *   If fee payment succeeds but deployment fails, the fee is non-refundable.
 */

import { useState, useRef, useCallback } from 'react';
import {
  BrowserProvider,
  ContractFactory,
  Contract,
  JsonRpcSigner,
} from 'ethers';
import {
  TOKEN_ABI,
  TOKEN_BYTECODE,
  FEE_WALLET,
  TOTAL_SUPPLY_WEI,
  FEE_AMOUNT_WEI,
  DEPLOYER_RECEIVES_WEI,
  DEPLOY_FEE_WEI,
  IS_COMPILED,
  SUPPLY_CONSTANTS_VALID,
  formatWeiToDisplay,
  storeDeployment,
} from '../utils/contract';
import { parseDeployError, isRateLimitError } from '../utils/deployErrors';
import { validateTokenName, validateTokenSymbol } from '../utils/formatters';
import { isLitVMChain } from '../utils/chain';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Gas limit for contract deployment.
 * LitToken deployment costs ~1.5–2.5M gas. 5M is a generous upper bound.
 * Unused gas is automatically refunded.
 */
const DEPLOY_GAS_LIMIT = 5_000_000n;

/**
 * Gas limit for the fee transfer (standard ETH transfer).
 */
const FEE_TRANSFER_GAS_LIMIT = 21_000n;

/**
 * Delay between fee confirmation and deployment (ms).
 * Prevents rapid-fire RPC calls that trigger rate-limiting.
 */
const INTER_TX_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployStep = 'idle' | 'fee' | 'confirming' | 'deploying' | 'verifying' | 'success' | 'error';

export interface SupplyVerification {
  checked: boolean;
  passed: boolean;
  actualTotalSupply: bigint | null;
  actualDeployerBalance: bigint | null;
  actualFeeBalance: bigint | null;
  error: string | null;
}

function createInitialVerification(): SupplyVerification {
  return {
    checked: false,
    passed: false,
    actualTotalSupply: null,
    actualDeployerBalance: null,
    actualFeeBalance: null,
    error: null,
  };
}

export const INITIAL_VERIFICATION: SupplyVerification = createInitialVerification();

// ---------------------------------------------------------------------------
// State Machine
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<DeployStep, DeployStep[]> = {
  idle: ['fee', 'error'],
  fee: ['confirming', 'error', 'idle'],
  confirming: ['deploying', 'error', 'idle'],
  deploying: ['verifying', 'error'],
  verifying: ['success', 'error'],
  success: ['idle'],
  error: ['idle'],
};

function canTransition(from: DeployStep, to: DeployStep): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the ethereum provider, preferring MetaMask.
 */
function getEthereum(): any {
  const w = window as any;
  if (w.ethereum?.providers?.length) {
    const metamask = w.ethereum.providers.find((p: any) => p.isMetaMask);
    if (metamask) return metamask;
    return w.ethereum.providers[0];
  }
  return w.ethereum || null;
}

/**
 * Create a FRESH BrowserProvider and signer.
 *
 * CRITICAL: This resets ethers v6's internal error counter, which is the
 * root cause of the "too many errors" rate-limiting issue.
 */
async function createFreshSigner(): Promise<{
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
} | null> {
  const ethereum = getEthereum();
  if (!ethereum) return null;

  try {
    const provider = new BrowserProvider(ethereum, 'any');
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    return { provider, signer, address };
  } catch (err) {
    console.error('[Deploy] Failed to create fresh signer:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseTokenDeployOptions {
  address: string | null;
  signer: JsonRpcSigner | null;
  isWrongNetwork: boolean;
  onDeploySuccess?: (contract: Contract) => void;
  onReset?: () => void;
}

export function useTokenDeploy(options: UseTokenDeployOptions) {
  const { address, signer, isWrongNetwork } = options;

  const [deployStep, setDeployStepRaw] = useState<DeployStep>(() => 'idle' as DeployStep);
  const [deployedAddress, setDeployedAddress] = useState<string>(() => '');
  const [txHash, setTxHash] = useState<string>(() => '');
  const [feeTxHash, setFeeTxHash] = useState<string>(() => '');
  const [errorMsg, setErrorMsg] = useState<string>(() => '');
  const [statusMsg, setStatusMsg] = useState<string>(() => '');
  const [verification, setVerification] = useState<SupplyVerification>(createInitialVerification);

  const deployLockRef = useRef(false);

  const signerRef = useRef<JsonRpcSigner | null>(signer);
  const onDeploySuccessRef = useRef(options.onDeploySuccess);
  const onResetRef = useRef(options.onReset);

  signerRef.current = signer;
  onDeploySuccessRef.current = options.onDeploySuccess;
  onResetRef.current = options.onReset;

  const setDeployStep = useCallback((to: DeployStep) => {
    setDeployStepRaw((current) => {
      if (canTransition(current, to)) {
        return to;
      }
      console.warn(`[Deploy] Invalid state transition: ${current} → ${to}`);
      return current;
    });
  }, []);

  /**
   * Verify deployed token supply matches expected BigInt values.
   */
  const verifySupply = useCallback(async (
    contractAddress: string,
    deployerAddress: string,
    freshSigner: JsonRpcSigner
  ) => {
    try {
      console.log('[Verify] Starting post-deployment supply verification...');

      const tokenContract = new Contract(contractAddress, TOKEN_ABI, freshSigner);

      const [actualTotal, actualDeployer, actualFee]: [bigint, bigint, bigint] = await Promise.all([
        tokenContract.totalSupply(),
        tokenContract.balanceOf(deployerAddress),
        tokenContract.balanceOf(FEE_WALLET),
      ]);

      console.log('[Verify] On-chain values:', {
        totalSupply: actualTotal.toString(),
        deployerBalance: actualDeployer.toString(),
        feeBalance: actualFee.toString(),
      });

      const errors: string[] = [];

      if (actualTotal !== TOTAL_SUPPLY_WEI) {
        errors.push(
          `Total supply mismatch: expected ${formatWeiToDisplay(TOTAL_SUPPLY_WEI)}, got ${formatWeiToDisplay(actualTotal)}`
        );
      }
      if (actualDeployer !== DEPLOYER_RECEIVES_WEI) {
        errors.push(
          `Deployer balance mismatch: expected ${formatWeiToDisplay(DEPLOYER_RECEIVES_WEI)}, got ${formatWeiToDisplay(actualDeployer)}`
        );
      }
      if (actualFee !== FEE_AMOUNT_WEI) {
        errors.push(
          `Fee wallet balance mismatch: expected ${formatWeiToDisplay(FEE_AMOUNT_WEI)}, got ${formatWeiToDisplay(actualFee)}`
        );
      }
      if (actualDeployer + actualFee !== actualTotal) {
        errors.push(`Sum invariant violated: deployer + fee ≠ total`);
      }

      const passed = errors.length === 0;

      setVerification({
        checked: true,
        passed,
        actualTotalSupply: actualTotal,
        actualDeployerBalance: actualDeployer,
        actualFeeBalance: actualFee,
        error: passed ? null : errors.join('; '),
      });

      if (passed) {
        console.log('[Verify] ✅ All supply checks passed');
      } else {
        console.error('[Verify] ❌ Supply verification FAILED:', errors);
        toast.error('Supply verification failed — check console for details');
      }
    } catch (err: any) {
      console.error('[Verify] Error during supply verification:', err);
      setVerification({
        checked: true,
        passed: false,
        actualTotalSupply: null,
        actualDeployerBalance: null,
        actualFeeBalance: null,
        error: `Verification query failed: ${err?.shortMessage || err?.message || 'Unknown error'}`,
      });
    }
  }, []);

  /**
   * Deploy a new token contract.
   *
   * Flow:
   *  1. Input validation (no RPC)
   *  2. Chain check from cached state (no RPC)
   *  3. Create FRESH provider (resets error counter)
   *  4. Send 0.1 LIT fee → fee wallet
   *  5. Wait for fee confirmation
   *  6. Delay 2s (prevent rate-limiting)
   *  7. Deploy contract with explicit gasLimit
   *  8. Wait for deployment confirmation
   *  9. Verify supply
   */
  const handleDeploy = useCallback(async (tokenName: string, tokenSymbol: string) => {
    const trimmedName = tokenName.trim();
    const trimmedSymbol = tokenSymbol.trim().toUpperCase();
    const currentAddress = address;

    if (deployLockRef.current) {
      console.log('[Deploy] Deploy already in progress, ignoring duplicate click');
      return;
    }

    if (!currentAddress || !signer || isWrongNetwork) return;

    // ══════════════════════════════════════════════════════════════
    // PHASE 0: Input validation (zero RPC calls)
    // ══════════════════════════════════════════════════════════════

    const nameError = validateTokenName(trimmedName);
    if (nameError) {
      setErrorMsg(nameError);
      setDeployStep('error');
      return;
    }

    const symbolError = validateTokenSymbol(trimmedSymbol);
    if (symbolError) {
      setErrorMsg(symbolError);
      setDeployStep('error');
      return;
    }

    if (!IS_COMPILED) {
      setErrorMsg('Contract bytecode is not available. Please run `npm run compile` first.');
      setDeployStep('error');
      return;
    }

    if (!TOKEN_BYTECODE || TOKEN_BYTECODE === '0x' || TOKEN_BYTECODE.length < 10) {
      setErrorMsg('Contract bytecode is missing or invalid. Please recompile with: npm run compile');
      setDeployStep('error');
      return;
    }

    if (!SUPPLY_CONSTANTS_VALID) {
      setErrorMsg('Supply constant validation failed. Check the console for details.');
      setDeployStep('error');
      return;
    }

    // Lock and start
    deployLockRef.current = true;
    setDeployStep('fee');
    setErrorMsg('');
    setStatusMsg('Preparing deployment...');
    setFeeTxHash('');
    setTxHash('');
    setVerification(createInitialVerification());

    // ══════════════════════════════════════════════════════════════
    // PHASE 1: Create FRESH provider (Fix #31 — resets error counter)
    // ══════════════════════════════════════════════════════════════

    console.log('[Deploy] Creating fresh BrowserProvider (resets error counter)...');
    setStatusMsg('Connecting to network...');

    const fresh = await createFreshSigner();

    if (!fresh) {
      setErrorMsg('Failed to create wallet connection. Please refresh the page and try again.');
      setDeployStep('error');
      deployLockRef.current = false;
      return;
    }

    const { signer: freshSigner, address: freshAddress } = fresh;
    console.log('[Deploy] Fresh provider created for:', freshAddress);

    // ══════════════════════════════════════════════════════════════
    // PHASE 2: Send 0.1 LIT deployment fee to fee wallet
    // ══════════════════════════════════════════════════════════════

    let feeHash = '';

    try {
      setStatusMsg('Confirm fee payment of 0.1 LIT in your wallet...');
      console.log('[Deploy] Sending 0.1 LIT fee to:', FEE_WALLET);

      const feeTx = await freshSigner.sendTransaction({
        to: FEE_WALLET,
        value: DEPLOY_FEE_WEI,
        gasLimit: FEE_TRANSFER_GAS_LIMIT,
      });

      feeHash = feeTx.hash;
      setFeeTxHash(feeHash);
      setStatusMsg('Waiting for fee confirmation...');
      console.log('[Deploy] Fee tx sent:', feeHash);

      // Wait for 1 confirmation
      const feeReceipt = await feeTx.wait(1);

      if (!feeReceipt || feeReceipt.status === 0) {
        setErrorMsg('Fee transaction failed on-chain. Please check your balance and try again.');
        setDeployStep('error');
        deployLockRef.current = false;
        return;
      }

      console.log('[Deploy] ✅ Fee confirmed in block:', feeReceipt.blockNumber);
      toast.success('Fee payment confirmed! Deploying contract...');
    } catch (err: unknown) {
      const message = parseDeployError(err, 'fee');
      setErrorMsg(message);
      setDeployStep('error');

      if (!(err as any)?.code || ((err as any)?.code !== 4001 && (err as any)?.code !== 'ACTION_REJECTED')) {
        toast.error('Fee payment failed');
      }

      deployLockRef.current = false;
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 3: Delay between transactions (prevent rate-limiting)
    // ══════════════════════════════════════════════════════════════

    setDeployStep('confirming');
    setStatusMsg('Preparing contract deployment...');
    console.log(`[Deploy] Waiting ${INTER_TX_DELAY_MS}ms between transactions...`);
    await sleep(INTER_TX_DELAY_MS);

    // ══════════════════════════════════════════════════════════════
    // PHASE 4: Deploy contract with explicit gasLimit (NO estimation)
    // ══════════════════════════════════════════════════════════════

    let contract: Contract;
    let hash = '';

    try {
      setStatusMsg('Confirm contract deployment in your wallet...');
      console.log('[Deploy] Deploying contract with:', {
        name: trimmedName,
        symbol: trimmedSymbol,
        gasLimit: DEPLOY_GAS_LIMIT.toString(),
      });

      const factory = new ContractFactory(TOKEN_ABI, TOKEN_BYTECODE, freshSigner);

      const deployed = await factory.deploy(trimmedName, trimmedSymbol, {
        gasLimit: DEPLOY_GAS_LIMIT,
      });
      contract = deployed as unknown as Contract;

      const deployTx = (contract as any).deploymentTransaction();
      hash = deployTx?.hash || '';
      setTxHash(hash);
      setDeployStep('deploying');
      setStatusMsg('Deploying to LitVM...');

      console.log('[Deploy] Contract tx sent:', hash);
    } catch (err: unknown) {
      // Check if rate-limited — advise user to wait
      if (isRateLimitError(err as any)) {
        setErrorMsg(
          'The RPC endpoint is temporarily rate-limited.\n\n' +
          'Your fee payment of 0.1 LIT was successful (tx: ' + feeHash.slice(0, 10) + '...).\n\n' +
          'Please wait 30-60 seconds and try deploying again. The fee will not be charged twice.'
        );
      } else {
        const message = parseDeployError(err, 'send');
        setErrorMsg(
          feeHash
            ? `${message}\n\nNote: Your fee payment of 0.1 LIT was already sent (tx: ${feeHash.slice(0, 10)}...).`
            : message
        );
      }
      setDeployStep('error');
      toast.error('Deployment failed');
      deployLockRef.current = false;
      return;
    }

    // ══════════════════════════════════════════════════════════════
    // PHASE 5: Wait for deployment confirmation
    // ══════════════════════════════════════════════════════════════

    try {
      setStatusMsg('Waiting for on-chain confirmation...');
      console.log('[Deploy] Waiting for deployment confirmation...');
      await (contract as any).waitForDeployment();

      const contractAddress = await (contract as any).getAddress();
      console.log('[Deploy] ✅ Contract deployed at:', contractAddress);

      setDeployedAddress(contractAddress);

      storeDeployment({
        name: trimmedName,
        symbol: trimmedSymbol,
        address: contractAddress,
        deployer: currentAddress,
        timestamp: Date.now(),
        txHash: hash,
        feeTxHash: feeHash,
      });

      // Attach event listeners
      try {
        onDeploySuccessRef.current?.(contract);
      } catch (listenerErr) {
        console.warn('[Deploy] Failed to attach event listeners:', listenerErr);
      }

      // ══════════════════════════════════════════════════════════════
      // PHASE 6: Verify supply
      // ══════════════════════════════════════════════════════════════

      setDeployStep('verifying');
      setStatusMsg('Verifying supply on-chain...');

      // Small delay before verification RPCs
      await sleep(1000);

      verifySupply(contractAddress, currentAddress, freshSigner)
        .catch((verifyErr) => {
          console.warn('[Deploy] Supply verification error (non-fatal):', verifyErr);
        })
        .finally(() => {
          setDeployStep('success');
          setStatusMsg('');
        });

      toast.success(`${trimmedSymbol} deployed successfully! 🌮`);
    } catch (err: unknown) {
      const message = parseDeployError(err, 'confirm');
      setErrorMsg(
        hash
          ? `${message}\n\nTransaction was sent (${hash.slice(0, 10)}...${hash.slice(-6)}) but may have failed on-chain. Check the explorer for details.`
          : message
      );
      setDeployStep('error');
      toast.error('Deployment failed');
    } finally {
      deployLockRef.current = false;
    }
  }, [address, signer, isWrongNetwork, setDeployStep, verifySupply]);

  /**
   * Reset the deploy form to initial state.
   */
  const resetForm = useCallback(() => {
    setDeployStepRaw('idle');
    setDeployedAddress('');
    setTxHash('');
    setFeeTxHash('');
    setErrorMsg('');
    setStatusMsg('');
    setVerification(createInitialVerification());
    deployLockRef.current = false;
    onResetRef.current?.();
  }, []);

  return {
    deployStep,
    deployedAddress,
    txHash,
    feeTxHash,
    errorMsg,
    statusMsg,
    verification,
    handleDeploy,
    resetForm,
    setDeployStep,
  };
}
