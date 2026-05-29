/**
 * Contract Configuration
 *
 * Loads ABI and bytecode from the compiled contract output (compiled.json).
 * Uses the compiled JSON ABI as the source of truth to prevent ABI drift (fix #2).
 * Validates supply constants at startup with graceful error handling (fix #12).
 *
 * Fix #1: Graceful handling when compiled.json is a placeholder.
 * Fix #2: Uses compiled ABI directly — no hand-written ABI that can drift.
 * Fix #12: validateSupplyConstants logs errors instead of crashing the app.
 * Fix #22: formatWeiToDisplay uses BigInt-based formatting for large values.
 */

import { getAddress, parseUnits, formatUnits, InterfaceAbi } from 'ethers';
import compiledContract from './compiled.json';

// ---------- ABI & Bytecode from compiled LitToken.sol ----------

/**
 * Whether the compiled contract has valid bytecode.
 * False when compiled.json is a placeholder (before running `npm run compile`).
 */
export const IS_COMPILED: boolean =
  compiledContract.bytecode !== '0x' &&
  compiledContract.bytecode.length > 10 &&
  compiledContract.compiler !== 'placeholder';

/**
 * Token ABI from the solc compilation output.
 *
 * Fix #2: This is the compiled JSON ABI — the single source of truth.
 * No separate hand-written ABI that could drift out of sync.
 *
 * When compiled.json is a placeholder, falls back to a minimal human-readable
 * ABI so TypeScript compilation doesn't break (deployment will still be blocked
 * by the IS_COMPILED check).
 */
export const TOKEN_ABI: InterfaceAbi = IS_COMPILED
  ? (compiledContract.abi as InterfaceAbi)
  : [
      // Fallback human-readable ABI for dev mode before compilation
      'constructor(string _name, string _symbol)',
      'function name() view returns (string)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)',
      'function totalSupply() view returns (uint256)',
      'function balanceOf(address account) view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
      'function increaseAllowance(address spender, uint256 addedValue) returns (bool)',
      'function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)',
      'function owner() view returns (address)',
      'function transferOwnership(address newOwner)',
      'function renounceOwnership()',
      'function feeWallet() pure returns (address)',
      'function feeAmount() pure returns (uint256)',
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      'event Approval(address indexed owner, address indexed spender, uint256 value)',
      'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
    ];

/**
 * Contract bytecode from solc compilation.
 * Will be "0x" when compiled.json is a placeholder.
 */
export const TOKEN_BYTECODE: string = compiledContract.bytecode;

if (!IS_COMPILED) {
  console.warn(
    '[Contract] ⚠️  compiled.json is a placeholder. Run `npm run compile` to generate bytecode.\n' +
    '  Deployment will be blocked until bytecode is available.'
  );
}

// ---------- Fee Wallet (environment-driven) ----------

const DEFAULT_FEE_WALLET = '0x896C20Da40c2A4df9B7C98B16a8D5A95129161a5';

/**
 * Resolves and validates the fee wallet address from environment configuration.
 *
 * NOTE: This address MUST match the hardcoded FEE_WALLET constant in LitToken.sol.
 * The Solidity constant is compiled into bytecode and cannot be changed. This
 * environment variable exists only for frontend display and verification purposes.
 * Changing VITE_FEE_WALLET without recompiling the contract will cause a mismatch
 * between the on-chain fee destination and the frontend display.
 */
function resolveFeeWallet(): string {
  const raw = import.meta.env.VITE_FEE_WALLET?.trim() || DEFAULT_FEE_WALLET;

  try {
    const validated = getAddress(raw);

    if (validated === '0x0000000000000000000000000000000000000000') {
      throw new Error('Fee wallet cannot be the zero address (0x0000...0000).');
    }

    if (import.meta.env.VITE_FEE_WALLET) {
      console.log('[Config] Fee wallet loaded from environment:', validated);
    } else {
      console.log('[Config] Fee wallet using default:', validated);
    }

    return validated;
  } catch (err: any) {
    console.error(
      `[Config] Invalid fee wallet address: "${raw}"`,
      err?.message || err
    );

    throw new Error(
      `Invalid VITE_FEE_WALLET environment variable: "${raw}". ` +
      `Expected a valid Ethereum address (0x + 40 hex characters). ` +
      `Please check your .env file. Error: ${err?.shortMessage || err?.message || 'Unknown'}`
    );
  }
}

export const FEE_WALLET: string = resolveFeeWallet();

// ---------- Token Supply Constants (BigInt — 18 decimals) ----------

export const TOKEN_DECIMALS = 18;

export const TOTAL_SUPPLY_WEI: bigint = parseUnits('1000000000', TOKEN_DECIMALS);
export const FEE_AMOUNT_WEI: bigint = parseUnits('10000', TOKEN_DECIMALS);
export const DEPLOYER_RECEIVES_WEI: bigint = TOTAL_SUPPLY_WEI - FEE_AMOUNT_WEI;

// ---------- Supply Math Validation (Graceful — fix #12) ----------

/**
 * Validates supply constants at startup.
 *
 * Fix #12: Logs errors to console instead of throwing, so the app doesn't
 * become completely unloadable during development if constants are tweaked.
 * Sets a flag that can be checked before deployment.
 */
export let SUPPLY_CONSTANTS_VALID = true;

(function validateSupplyConstants() {
  const errors: string[] = [];

  const expectedDeployerWei = parseUnits('999990000', TOKEN_DECIMALS);
  if (DEPLOYER_RECEIVES_WEI !== expectedDeployerWei) {
    errors.push(
      `DEPLOYER_RECEIVES_WEI (${DEPLOYER_RECEIVES_WEI}) does not match expected (${expectedDeployerWei})`
    );
  }

  if (DEPLOYER_RECEIVES_WEI + FEE_AMOUNT_WEI !== TOTAL_SUPPLY_WEI) {
    errors.push(
      `Sum invariant violated: ${DEPLOYER_RECEIVES_WEI} + ${FEE_AMOUNT_WEI} !== ${TOTAL_SUPPLY_WEI}`
    );
  }

  if (TOTAL_SUPPLY_WEI <= 0n || FEE_AMOUNT_WEI <= 0n || DEPLOYER_RECEIVES_WEI <= 0n) {
    errors.push('All supply constants must be positive values.');
  }

  if (errors.length > 0) {
    SUPPLY_CONSTANTS_VALID = false;
    console.error('[Config] ❌ Supply constant validation FAILED:');
    errors.forEach((e) => console.error(`  - ${e}`));
  } else {
    console.log('[Config] ✅ Supply constants validated:', {
      totalSupply: formatUnits(TOTAL_SUPPLY_WEI, TOKEN_DECIMALS) + ' tokens',
      feeAmount: formatUnits(FEE_AMOUNT_WEI, TOKEN_DECIMALS) + ' tokens',
      deployerReceives: formatUnits(DEPLOYER_RECEIVES_WEI, TOKEN_DECIMALS) + ' tokens',
    });
  }
})();

// ---------- Display Constants ----------

export const TOTAL_SUPPLY = '1,000,000,000';
export const FEE_AMOUNT = '10,000';
export const DEPLOYER_RECEIVES = '999,990,000';

// ---------- Helper: Format BigInt to Display ----------

/**
 * Formats a BigInt wei value to a human-readable token amount string.
 *
 * Fix #22: Uses BigInt division for large values to avoid parseFloat precision loss.
 * For values > Number.MAX_SAFE_INTEGER, we use BigInt arithmetic directly.
 *
 * @param wei - The BigInt value in wei (18 decimals)
 * @returns Formatted string like "1,000,000,000" or "10,000"
 */
export function formatWeiToDisplay(wei: bigint): string {
  const raw = formatUnits(wei, TOKEN_DECIMALS);

  // Split on decimal point to handle integer and fractional parts separately
  const [integerPart, fractionalPart] = raw.split('.');

  // For large integers, format with locale (BigInt-safe: we're only formatting the string)
  const intNum = BigInt(integerPart);

  // Check if there's a meaningful fractional part
  const hasFraction = fractionalPart && parseInt(fractionalPart) > 0;

  if (!hasFraction) {
    // Pure integer — format with commas using string manipulation (BigInt safe)
    return formatBigIntWithCommas(intNum);
  }

  // Has fractional part — trim trailing zeros and limit to 4 decimals
  const trimmedFraction = fractionalPart.slice(0, 4).replace(/0+$/, '');
  if (trimmedFraction.length === 0) {
    return formatBigIntWithCommas(intNum);
  }

  return `${formatBigIntWithCommas(intNum)}.${trimmedFraction}`;
}

/**
 * Formats a BigInt with comma separators.
 * Avoids parseFloat precision loss for values > Number.MAX_SAFE_INTEGER.
 */
function formatBigIntWithCommas(value: bigint): string {
  const str = value.toString();
  const isNegative = str.startsWith('-');
  const abs = isNegative ? str.slice(1) : str;

  // Add commas every 3 digits from the right
  let result = '';
  for (let i = 0; i < abs.length; i++) {
    if (i > 0 && (abs.length - i) % 3 === 0) {
      result += ',';
    }
    result += abs[i];
  }

  return isNegative ? `-${result}` : result;
}

// ---------- Deployment History ----------

export interface DeployedToken {
  name: string;
  symbol: string;
  address: string;
  deployer: string;
  timestamp: number;
  txHash: string;
}

export function getStoredDeployments(): DeployedToken[] {
  try {
    const stored = localStorage.getItem('litvm-deployments');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function storeDeployment(token: DeployedToken): void {
  const deployments = getStoredDeployments();
  deployments.unshift(token);
  localStorage.setItem('litvm-deployments', JSON.stringify(deployments.slice(0, 50)));
}
