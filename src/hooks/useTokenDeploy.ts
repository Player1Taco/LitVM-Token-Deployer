/**
 * useTokenDeploy Hook
 *
 * Manages the token deployment lifecycle: validation, transaction send,
 * confirmation, supply verification, and event listener attachment.
 *
 * Fix #6: contractRef typed as Contract | null.
 * Fix #7: Proper null checks instead of non-null assertions.
 * Fix #8: Deploy lock ref prevents double-click / rapid-fire.
 * Fix #13: Signer ref prevents stale closure issues.
 * Fix #15: Input sanitization via validateTokenName/validateTokenSymbol.
 * Fix #20: State machine transition guards.
 * Fix #26: Extracted from TokenDeployer for decomposition.
 */

import { useState, useRef, useCallback } from 'react';
import { ContractFactory, Contract, formatUnits, JsonRpcSigner } from 'ethers';
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

export const INITIAL_VERIFICATION: SupplyVerification = {
  checked: false,
  passed: false,
  actualTotalSupply: null,
  actualDeployerBalance: null,
  actualFeeBalance: null,
  error: null,
};

// ---------------------------------------------------------------------------
// State Machine Transition Guards (fix #20)
// ---------------------------------------------------------------------------

/** Valid state transitions for the deploy state machine. */
const VALID_TRANSITIONS: Record<DeployStep, DeployStep[]> = {
  idle: ['confirming', 'error'],
  confirming: ['deploying', 'error', 'idle'],
  deploying: ['verifying', 'error'],
  verifying: ['success', 'error'],
  success: ['idle'], // Reset form
  error: ['idle'],   // Try again
};

/**
 * Checks if a state transition is valid.
 */
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
  const { address, signer, isWrongNetwork, onDeploySuccess, onReset } = options;

  const [deployStep, setDeployStepRaw] = useState<DeployStep>('idle');
  const [deployedAddress, setDeployedAddress] = useState('');
  const [txHash, setTxHash] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [verification, setVerification] = useState<SupplyVerification>(INITIAL_VERIFICATION);

  // Fix #8: Deploy lock ref for immediate double-click prevention
  const deployLockRef = useRef(false);

  // Fix #13: Signer ref to prevent stale closure
  const signerRef = useRef<JsonRpcSigner | null>(signer);
  signerRef.current = signer;

  /**
   * Guarded state transition (fix #20).
   * Only updates state if the transition is valid.
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
   *
   * Fix #7: Accepts explicit addresses instead of using non-null assertions.
   * Fix #13: Uses signerRef to avoid stale closure.
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
        errors.push(
          `Sum invariant violated: deployer + fee ≠ total`
        );
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
  }, []); // Fix #13: no signer in deps — uses signerRef

  /**
   * Deploy a new token contract.
   *
   * Fix #7: Proper null checks for address.
   * Fix #8: Uses deployLockRef for immediate double-click prevention.
   * Fix #15: Uses validateTokenName/validateTokenSymbol for input sanitization.
   */
  const handleDeploy = useCallback(async (tokenName: string, tokenSymbol: string) => {
    const trimmedName = tokenName.trim();
    const trimmedSymbol = tokenSymbol.trim().toUpperCase();
    const currentSigner = signerRef.current;
    const currentAddress = address;

    // Fix #8: Immediate lock before any async work
    if (deployLockRef.current) {
      console.log('[Deploy] Deploy already in progress, ignoring duplicate click');
      return;
    }

    if (!currentAddress || !currentSigner || isWrongNetwork) return;

    // ---------- Pre-deploy validation (fix #15: input sanitization) ----------
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

    // Check compilation status (fix #1)
    if (!IS_COMPILED) {
      setErrorMsg(
        'Contract bytecode is not available. Please run `npm run compile` to compile the contract first.'
      );
      setDeployStep('error');
      return;
    }

    if (!TOKEN_BYTECODE || TOKEN_BYTECODE === '0x' || TOKEN_BYTECODE.length < 10) {
      setErrorMsg(
        'Contract bytecode is missing or invalid. Please recompile the contract with: npm run compile'
      );
      setDeployStep('error');
      return;
    }

    // Check supply constants (fix #12)
    if (!SUPPLY_CONSTANTS_VALID) {
      setErrorMsg(
        'Supply constant validation failed. Check the console for details.'
      );
      setDeployStep('error');
      return;
    }

    // Fix #8: Set lock immediately
    deployLockRef.current = true;

    setDeployStep('confirming');
    setErrorMsg('');
    setVerification(INITIAL_VERIFICATION);

    // ---------- Phase 1: Send deployment transaction ----------
    let contract: Contract;
    let hash = '';

    try {
      const factory = new ContractFactory(TOKEN_ABI, TOKEN_BYTECODE, currentSigner);

      console.log('[Deploy] Creating contract with:', {
        name: trimmedName,
        symbol: trimmedSymbol,
      });

      contract = (await factory.deploy(trimmedName, trimmedSymbol)) as unknown as Contract;

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
      deployLockRef.current = false; // Fix #8: Release lock on error
      return;
    }

    // ---------- Phase 2: Wait for deployment confirmation ----------
    try {
      console.log('[Deploy] Waiting for confirmation...');
      await (contract as any).waitForDeployment();

      const contractAddress = await (contract as any).getAddress();
      console.log('[Deploy] Contract deployed at:', contractAddress);

      setDeployedAddress(contractAddress);

      // Store deployment in local history
      // Fix #7: currentAddress is guaranteed non-null by the check above
      storeDeployment({
        name: trimmedName,
        symbol: trimmedSymbol,
        address: contractAddress,
        deployer: currentAddress,
        timestamp: Date.now(),
        txHash: hash,
      });

      // ---------- Phase 3: Attach event listeners ----------
      try {
        onDeploySuccess?.(contract);
        console.log('[Deploy] Event listeners attached for', contractAddress);
      } catch (listenerErr) {
        console.warn('[Deploy] Failed to attach event listeners:', listenerErr);
      }

      // ---------- Phase 4: Verify supply (fix #19: explicit verifying step) ----------
      setDeployStep('verifying');

      // Fix #7: Both addresses are verified non-null
      verifySupply(contractAddress, currentAddress).catch((verifyErr) => {
        console.warn('[Deploy] Supply verification error (non-fatal):', verifyErr);
      }).finally(() => {
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
      deployLockRef.current = false; // Fix #8: Always release lock
    }
  }, [address, isWrongNetwork, setDeployStep, verifySupply, onDeploySuccess]);

  /**
   * Reset the deploy form to initial state.
   */
  const resetForm = useCallback(() => {
    setDeployStepRaw('idle');
    setDeployedAddress('');
    setTxHash('');
    setErrorMsg('');
    setVerification(INITIAL_VERIFICATION);
    deployLockRef.current = false;
    onReset?.();
  }, [onReset]);

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
