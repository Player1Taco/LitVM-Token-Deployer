/**
 * useTokenDeploy Hook
 *
 * Manages the token deployment lifecycle with pre-flight checks:
 *  1. Input validation
 *  2. Balance check (native LIT for gas)
 *  3. Gas estimation (catches errors before tx is sent)
 *  4. Transaction send
 *  5. Confirmation wait
 *  6. Supply verification
 *
 * KEY FIX (queue error): useState initial values use factory functions,
 * not shared module-level object references, to survive HMR reloads.
 */

import { useState, useRef, useCallback } from 'react';
import { ContractFactory, Contract, JsonRpcSigner, formatEther } from 'ethers';
import {
  TOKEN_ABI,
  TOKEN_BYTECODE,
  FEE_WALLET,
  TOTAL_SUPPLY_WEI,
  FEE_AMOUNT_WEI,
  DEPLOYER_RECEIVES_WEI,
  IS_COMPILED,
  SUPPLY_CONSTANTS_VALID,
  formatWeiToDisplay,
  storeDeployment,
} from '../utils/contract';
import { parseDeployError } from '../utils/deployErrors';
import { validateTokenName, validateTokenSymbol } from '../utils/formatters';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployStep = 'idle' | 'confirming' | 'deploying' | 'verifying' | 'success' | 'error';

export interface SupplyVerification {
  checked: boolean;
  passed: boolean;
  actualTotalSupply: bigint | null;
  actualDeployerBalance: bigint | null;
  actualFeeBalance: bigint | null;
  error: string | null;
}

/**
 * Factory function for initial verification state.
 *
 * FIX: Returns a new object each time instead of referencing a shared
 * module-level constant. This prevents React fiber corruption during HMR
 * because each component instance gets its own state object reference.
 */
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

// Export for external use (e.g., type checks)
export const INITIAL_VERIFICATION: SupplyVerification = createInitialVerification();

// ---------------------------------------------------------------------------
// State Machine Transition Guards
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<DeployStep, DeployStep[]> = {
  idle: ['confirming', 'error'],
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

  /**
   * FIX: Use factory functions (lazy initializers) for useState.
   * React calls these only on the initial mount, ensuring each fiber
   * gets a unique object reference that survives HMR reloads.
   */
  const [deployStep, setDeployStepRaw] = useState<DeployStep>(() => 'idle' as DeployStep);
  const [deployedAddress, setDeployedAddress] = useState<string>(() => '');
  const [txHash, setTxHash] = useState<string>(() => '');
  const [errorMsg, setErrorMsg] = useState<string>(() => '');
  const [verification, setVerification] = useState<SupplyVerification>(createInitialVerification);

  const deployLockRef = useRef(false);

  /**
   * FIX: Store callbacks in refs instead of reading from options directly
   * inside useCallback dependencies. This prevents the callbacks from
   * changing on every render (which caused excessive re-creation of
   * memoized functions and contributed to HMR fiber corruption).
   */
  const signerRef = useRef<JsonRpcSigner | null>(signer);
  const onDeploySuccessRef = useRef(options.onDeploySuccess);
  const onResetRef = useRef(options.onReset);

  // Keep refs current on every render
  signerRef.current = signer;
  onDeploySuccessRef.current = options.onDeploySuccess;
  onResetRef.current = options.onReset;

  /**
   * Guarded state transition.
   */
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
    deployerAddress: string
  ) => {
    try {
      const currentSigner = signerRef.current;
      if (!currentSigner) {
        console.warn('[Verify] No signer available for supply verification');
        return;
      }

      console.log('[Verify] Starting post-deployment supply verification...');

      const tokenContract = new Contract(contractAddress, TOKEN_ABI, currentSigner);

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
   * FIX: Dependency array no longer includes onDeploySuccess (uses ref instead).
   * This keeps handleDeploy stable across renders.
   */
  const handleDeploy = useCallback(async (tokenName: string, tokenSymbol: string) => {
    const trimmedName = tokenName.trim();
    const trimmedSymbol = tokenSymbol.trim().toUpperCase();
    const currentSigner = signerRef.current;
    const currentAddress = address;

    if (deployLockRef.current) {
      console.log('[Deploy] Deploy already in progress, ignoring duplicate click');
      return;
    }

    if (!currentAddress || !currentSigner || isWrongNetwork) return;

    // ---------- Input Validation ----------
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
      setErrorMsg('Contract bytecode is not available. Please run `npm run compile` to compile the contract first.');
      setDeployStep('error');
      return;
    }

    if (!TOKEN_BYTECODE || TOKEN_BYTECODE === '0x' || TOKEN_BYTECODE.length < 10) {
      setErrorMsg('Contract bytecode is missing or invalid. Please recompile the contract with: npm run compile');
      setDeployStep('error');
      return;
    }

    if (!SUPPLY_CONSTANTS_VALID) {
      setErrorMsg('Supply constant validation failed. Check the console for details.');
      setDeployStep('error');
      return;
    }

    // Set lock immediately
    deployLockRef.current = true;
    setDeployStep('confirming');
    setErrorMsg('');
    setVerification(createInitialVerification());

    // ---------- Phase 0: Pre-flight checks ----------
    let factory: ContractFactory;

    try {
      factory = new ContractFactory(TOKEN_ABI, TOKEN_BYTECODE, currentSigner);
    } catch (err: any) {
      console.error('[Deploy] ContractFactory creation failed:', err);
      setErrorMsg(
        'Failed to initialize the contract factory.\n\n' +
        `Details: ${err?.shortMessage || err?.message || 'Unknown error'}\n\n` +
        'This may indicate an ABI/bytecode mismatch. Try recompiling with: npm run compile'
      );
      setDeployStep('error');
      deployLockRef.current = false;
      return;
    }

    // Check native balance for gas
    try {
      const provider = currentSigner.provider;
      if (provider) {
        const balance = await provider.getBalance(currentAddress);
        console.log('[Deploy] Native balance:', formatEther(balance), 'LIT');

        if (balance === 0n) {
          setErrorMsg(
            'Your wallet has 0 LIT balance.\n\n' +
            'Contract deployment requires native LIT tokens to pay for gas. ' +
            'Please add LIT to your wallet before deploying.'
          );
          setDeployStep('error');
          deployLockRef.current = false;
          return;
        }

        // Warn if balance seems very low (< 0.001 LIT)
        if (balance < 1_000_000_000_000_000n) {
          console.warn('[Deploy] Very low native balance:', formatEther(balance), 'LIT');
        }
      }
    } catch (balErr) {
      console.warn('[Deploy] Could not check native balance (non-fatal):', balErr);
    }

    // ---------- Phase 0.5: Gas estimation pre-check ----------
    let estimatedGas: bigint | undefined;

    try {
      console.log('[Deploy] Pre-estimating gas...');
      const deployTx = await factory.getDeployTransaction(trimmedName, trimmedSymbol);

      const provider = currentSigner.provider;
      if (provider) {
        estimatedGas = await provider.estimateGas({
          ...deployTx,
          from: currentAddress,
        });
        console.log('[Deploy] Estimated gas:', estimatedGas.toString());
      }
    } catch (gasErr: any) {
      console.error('[Deploy] Gas estimation failed:', gasErr);
      const message = parseDeployError(gasErr, 'send');
      setErrorMsg(message);
      setDeployStep('error');
      deployLockRef.current = false;
      return;
    }

    // ---------- Phase 1: Send deployment transaction ----------
    let contract: Contract;
    let hash = '';

    try {
      console.log('[Deploy] Creating contract with:', {
        name: trimmedName,
        symbol: trimmedSymbol,
        estimatedGas: estimatedGas?.toString(),
      });

      const deployOptions: Record<string, any> = {};
      if (estimatedGas) {
        deployOptions.gasLimit = (estimatedGas * 120n) / 100n;
        console.log('[Deploy] Using gas limit:', deployOptions.gasLimit.toString());
      }

      const deployed = await factory.deploy(trimmedName, trimmedSymbol, deployOptions);
      contract = deployed as unknown as Contract;

      const deployTx = (contract as any).deploymentTransaction();
      hash = deployTx?.hash || '';
      setTxHash(hash);
      setDeployStep('deploying');

      console.log('[Deploy] Transaction sent:', hash);
    } catch (err: unknown) {
      const message = parseDeployError(err, 'send');
      setErrorMsg(message);
      setDeployStep('error');
      toast.error('Deployment failed');
      deployLockRef.current = false;
      return;
    }

    // ---------- Phase 2: Wait for deployment confirmation ----------
    try {
      console.log('[Deploy] Waiting for confirmation...');
      await (contract as any).waitForDeployment();

      const contractAddress = await (contract as any).getAddress();
      console.log('[Deploy] Contract deployed at:', contractAddress);

      setDeployedAddress(contractAddress);

      storeDeployment({
        name: trimmedName,
        symbol: trimmedSymbol,
        address: contractAddress,
        deployer: currentAddress,
        timestamp: Date.now(),
        txHash: hash,
      });

      // ---------- Phase 3: Attach event listeners (via ref) ----------
      try {
        onDeploySuccessRef.current?.(contract);
        console.log('[Deploy] Event listeners attached for', contractAddress);
      } catch (listenerErr) {
        console.warn('[Deploy] Failed to attach event listeners:', listenerErr);
      }

      // ---------- Phase 4: Verify supply ----------
      setDeployStep('verifying');

      verifySupply(contractAddress, currentAddress)
        .catch((verifyErr) => {
          console.warn('[Deploy] Supply verification error (non-fatal):', verifyErr);
        })
        .finally(() => {
          setDeployStep('success');
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
  }, [address, isWrongNetwork, setDeployStep, verifySupply]);

  /**
   * Reset the deploy form to initial state.
   *
   * FIX: Uses onResetRef instead of onReset in dependency array.
   */
  const resetForm = useCallback(() => {
    setDeployStepRaw('idle');
    setDeployedAddress('');
    setTxHash('');
    setErrorMsg('');
    setVerification(createInitialVerification());
    deployLockRef.current = false;
    onResetRef.current?.();
  }, []);

  return {
    deployStep,
    deployedAddress,
    txHash,
    errorMsg,
    verification,
    handleDeploy,
    resetForm,
    setDeployStep,
  };
}
