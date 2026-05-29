/**
 * TokenDeployer Component
 *
 * Main orchestrator for the token deployment flow.
 *
 * FIX (queue error): All callbacks passed to useTokenDeploy are now
 * memoized with useCallback so they have stable references across renders.
 * This prevents useCallback dependency churn inside useTokenDeploy which
 * was contributing to React fiber state corruption during HMR reloads.
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Coins,
  Tag,
  Hash,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Sparkles,
  Shield,
  Users,
  Wallet,
  AlertTriangle,
  Activity,
  Send,
  ShieldCheck,
  Radio,
  BadgeCheck,
  XCircle,
} from 'lucide-react';
import { Contract } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { useTokenDeploy, DeployStep } from '../hooks/useTokenDeploy';
import { useTokenEvents, TokenEvent } from '../hooks/useTokenEvents';
import {
  FEE_WALLET,
  TOTAL_SUPPLY,
  FEE_AMOUNT,
  DEPLOYER_RECEIVES,
  TOTAL_SUPPLY_WEI,
  FEE_AMOUNT_WEI,
  DEPLOYER_RECEIVES_WEI,
  formatWeiToDisplay,
  IS_COMPILED,
} from '../utils/contract';
import { getExplorerTxUrl, getExplorerAddressUrl } from '../utils/chain';
import { formatTokenAmount, timeAgo, truncateAddress } from '../utils/formatters';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TokenDeployer: React.FC = () => {
  const { address, signer, connect, isConnecting, isWrongNetwork, switchToLitVM } = useWallet();
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');

  // Extracted hooks
  const {
    tokenEvents,
    isListening,
    attachEventListeners,
    cleanupListeners,
    clearEvents,
  } = useTokenEvents();

  /**
   * FIX: Memoize callbacks with useCallback so useTokenDeploy receives
   * stable references. Previously these were inline anonymous functions
   * that created new references every render, destabilizing the hook.
   */
  const handleDeploySuccess = useCallback((contract: Contract) => {
    attachEventListeners(contract);
  }, [attachEventListeners]);

  const handleReset = useCallback(() => {
    cleanupListeners();
    clearEvents();
  }, [cleanupListeners, clearEvents]);

  const {
    deployStep,
    deployedAddress,
    txHash,
    errorMsg,
    verification,
    handleDeploy,
    resetForm: resetDeployState,
    setDeployStep,
  } = useTokenDeploy({
    address,
    signer,
    isWrongNetwork,
    onDeploySuccess: handleDeploySuccess,
    onReset: handleReset,
  });

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      cleanupListeners();
    };
  }, [cleanupListeners]);

  // Memoize derived values
  const trimmedName = useMemo(() => tokenName.trim(), [tokenName]);
  const trimmedSymbol = useMemo(() => tokenSymbol.trim().toUpperCase(), [tokenSymbol]);

  const canDeploy = useMemo(
    () =>
      trimmedName.length > 0 &&
      trimmedSymbol.length > 0 &&
      !!address &&
      !!signer &&
      !isWrongNetwork &&
      IS_COMPILED,
    [trimmedName, trimmedSymbol, address, signer, isWrongNetwork]
  );

  const onDeploy = useCallback(() => {
    cleanupListeners();
    clearEvents();
    handleDeploy(tokenName, tokenSymbol);
  }, [cleanupListeners, clearEvents, handleDeploy, tokenName, tokenSymbol]);

  const resetForm = useCallback(() => {
    setTokenName('');
    setTokenSymbol('');
    resetDeployState();
  }, [resetDeployState]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Hero Title */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center mb-10"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-primary/20 mb-6"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-medium text-primary">LitVM Network</span>
          <span className="text-sm">🌮</span>
        </motion.div>

        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black mb-4 leading-tight">
          <span className="text-white">Deploy Your</span>
          <br />
          <span className="text-gradient">Token Instantly</span>
        </h2>
        <p className="text-gray-400 text-base sm:text-lg max-w-md mx-auto leading-relaxed">
          Name it. Deploy it. Own it. Launch your ERC-20 token on LitVM in seconds.
        </p>
      </motion.div>

      {/* Compilation Warning */}
      {!IS_COMPILED && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-6"
        >
          <div className="glass rounded-xl p-4 border border-warning/30 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning">Contract Not Compiled</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Run <code className="text-primary font-mono">npm run compile</code> to generate bytecode before deploying.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="grid grid-cols-3 gap-3 mb-8"
      >
        {[
          { icon: Coins, label: 'Total Supply', value: '1B', color: 'text-primary' },
          { icon: Users, label: 'You Receive', value: '999.99M', color: 'text-secondary' },
          { icon: Shield, label: 'Fee Allocation', value: '10K', color: 'text-accent' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
            className="glass rounded-xl p-4 text-center hover:border-primary/20 transition-all duration-300"
          >
            <stat.icon className={`w-5 h-5 ${stat.color} mx-auto mb-2`} />
            <p className="text-lg font-bold text-white font-mono">{stat.value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{stat.label}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Wrong Network Banner */}
      <AnimatePresence>
        {address && isWrongNetwork && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <div className="glass rounded-xl p-4 border border-warning/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-warning">Wrong Network</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    This deployer only works on the LitVM chain.
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={switchToLitVM}
                className="px-4 py-2 rounded-lg bg-warning/20 border border-warning/30 text-warning text-xs font-semibold hover:bg-warning/30 transition-all flex-shrink-0"
              >
                Switch to LitVM
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deployer Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="deployer-card glass-strong rounded-2xl p-6 sm:p-8 relative"
      >
        <AnimatePresence mode="wait">
          {deployStep === 'success' || deployStep === 'verifying' ? (
            <SuccessView
              key="success"
              deployStep={deployStep}
              trimmedSymbol={trimmedSymbol}
              deployedAddress={deployedAddress}
              txHash={txHash}
              verification={verification}
              tokenEvents={tokenEvents}
              isListening={isListening}
              copyToClipboard={copyToClipboard}
              clearEvents={clearEvents}
              resetForm={resetForm}
            />
          ) : deployStep === 'error' ? (
            <ErrorView
              key="error"
              errorMsg={errorMsg}
              txHash={txHash}
              copyToClipboard={copyToClipboard}
              onRetry={() => {
                setDeployStep('idle');
              }}
            />
          ) : (
            <FormView
              key="form"
              tokenName={tokenName}
              tokenSymbol={tokenSymbol}
              trimmedName={trimmedName}
              trimmedSymbol={trimmedSymbol}
              deployStep={deployStep}
              txHash={txHash}
              canDeploy={canDeploy}
              address={address}
              isConnecting={isConnecting}
              isWrongNetwork={isWrongNetwork}
              connect={connect}
              switchToLitVM={switchToLitVM}
              onNameChange={setTokenName}
              onSymbolChange={setTokenSymbol}
              onDeploy={onDeploy}
            />
          )}
        </AnimatePresence>
      </motion.div>

      {/* Token Preview Card */}
      <AnimatePresence>
        {trimmedName && trimmedSymbol && deployStep === 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-6"
          >
            <div className="glass rounded-xl p-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/10 to-transparent rounded-bl-full" />
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Preview</p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-purple-500 to-accent flex items-center justify-center text-white font-bold text-xl shadow-lg glow-primary">
                  {trimmedSymbol.slice(0, 2)}
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">{trimmedName}</h4>
                  <p className="text-sm font-mono text-primary">${trimmedSymbol}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-gray-500">Supply</p>
                  <p className="text-sm font-mono font-bold text-white">{TOTAL_SUPPLY}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SuccessViewProps {
  deployStep: DeployStep;
  trimmedSymbol: string;
  deployedAddress: string;
  txHash: string;
  verification: ReturnType<typeof import('../hooks/useTokenDeploy').useTokenDeploy>['verification'];
  tokenEvents: TokenEvent[];
  isListening: boolean;
  copyToClipboard: (text: string) => void;
  clearEvents: () => void;
  resetForm: () => void;
}

const SuccessView: React.FC<SuccessViewProps> = ({
  deployStep,
  trimmedSymbol,
  deployedAddress,
  txHash,
  verification,
  tokenEvents,
  isListening,
  copyToClipboard,
  clearEvents,
  resetForm,
}) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
    className="text-center py-6"
  >
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
      className="w-20 h-20 rounded-full bg-success/10 border border-success/30 flex items-center justify-center mx-auto mb-6 glow-success"
    >
      <CheckCircle2 className="w-10 h-10 text-success" />
    </motion.div>

    <h3 className="text-2xl font-bold text-white mb-2">Token Deployed! 🌮🎉</h3>
    <p className="text-gray-400 mb-6">
      Your <span className="text-primary font-semibold">{trimmedSymbol}</span> token is live on LitVM
    </p>

    {/* Contract Address */}
    <div className="glass rounded-xl p-4 mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Contract Address</p>
      <div className="flex items-center gap-2 justify-center">
        <a
          href={getExplorerAddressUrl(deployedAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-mono text-secondary break-all hover:underline"
        >
          {deployedAddress}
        </a>
        <button
          onClick={() => copyToClipboard(deployedAddress)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
        >
          <Copy className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </div>

    {/* TX Hash */}
    {txHash && (
      <div className="glass rounded-xl p-4 mb-6">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Transaction Hash</p>
        <div className="flex items-center gap-2 justify-center">
          <a
            href={getExplorerTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-gray-300 break-all hover:text-primary hover:underline transition-colors"
          >
            {txHash}
          </a>
          <button
            onClick={() => copyToClipboard(txHash)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <Copy className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    )}

    {/* Distribution Summary */}
    <div className="glass rounded-xl p-4 mb-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Distribution</p>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Your Wallet</span>
          <span className="text-sm font-mono text-success">{DEPLOYER_RECEIVES} tokens</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Fee Wallet</span>
          <span className="text-sm font-mono text-accent">{FEE_AMOUNT} tokens</span>
        </div>
        <div className="border-t border-border pt-2 mt-2 flex justify-between items-center">
          <span className="text-sm font-medium text-white">Total</span>
          <span className="text-sm font-mono font-bold text-primary">{TOTAL_SUPPLY} tokens</span>
        </div>
      </div>
    </div>

    {/* Verification Panel */}
    <VerificationPanel verification={verification} deployStep={deployStep} />

    {/* Event Feed */}
    <EventFeed
      tokenEvents={tokenEvents}
      isListening={isListening}
      copyToClipboard={copyToClipboard}
      clearEvents={clearEvents}
    />

    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={resetForm}
      className="px-8 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-white font-semibold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all"
    >
      Deploy Another Token 🌮
    </motion.button>
  </motion.div>
);

// ---------------------------------------------------------------------------
// Verification Panel
// ---------------------------------------------------------------------------

interface VerificationPanelProps {
  verification: ReturnType<typeof import('../hooks/useTokenDeploy').useTokenDeploy>['verification'];
  deployStep: DeployStep;
}

const VerificationPanel: React.FC<VerificationPanelProps> = ({ verification, deployStep }) => (
  <>
    <AnimatePresence>
      {verification.checked && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-4"
        >
          <div
            className={`glass rounded-xl p-4 border ${
              verification.passed ? 'border-success/20' : 'border-error/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              {verification.passed ? (
                <BadgeCheck className="w-4 h-4 text-success flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-error flex-shrink-0" />
              )}
              <p className="text-xs uppercase tracking-wider font-medium text-left">
                <span className={verification.passed ? 'text-success' : 'text-error'}>
                  {verification.passed ? 'Supply Verified On-Chain' : 'Supply Verification Failed'}
                </span>
              </p>
            </div>

            {verification.passed ? (
              <div className="space-y-1.5 text-left">
                {[
                  { label: 'Total Supply', value: verification.actualTotalSupply },
                  { label: 'Your Balance', value: verification.actualDeployerBalance },
                  { label: 'Fee Wallet', value: verification.actualFeeBalance },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
                    <span className="text-[11px] text-gray-400">{item.label}:</span>
                    <span className="text-[11px] font-mono text-success">
                      {item.value !== null ? formatWeiToDisplay(item.value) : '—'}
                    </span>
                  </div>
                ))}
                <div className="pt-1.5 mt-1.5 border-t border-border/30">
                  <p className="text-[9px] text-gray-600 text-left">
                    ✓ All values verified using BigInt comparison (18 decimals, exact match)
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-left">
                <p className="text-[11px] text-error/80 mb-1">{verification.error}</p>
                {verification.actualTotalSupply !== null && (
                  <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Actual Supply:</span>
                      <span className="font-mono text-gray-400">
                        {formatWeiToDisplay(verification.actualTotalSupply)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Expected Supply:</span>
                      <span className="font-mono text-gray-400">
                        {formatWeiToDisplay(TOTAL_SUPPLY_WEI)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Verification Loading State */}
    <AnimatePresence>
      {!verification.checked && (deployStep === 'success' || deployStep === 'verifying') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mb-4"
        >
          <div className="glass rounded-xl p-3 border border-primary/10">
            <div className="flex items-center gap-2 justify-center">
              <Loader2 className="w-3 h-3 text-primary animate-spin" />
              <span className="text-[11px] text-gray-400">
                Verifying supply on-chain...
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </>
);

// ---------------------------------------------------------------------------
// Event Feed
// ---------------------------------------------------------------------------

interface EventFeedProps {
  tokenEvents: TokenEvent[];
  isListening: boolean;
  copyToClipboard: (text: string) => void;
  clearEvents: () => void;
}

const EventFeed: React.FC<EventFeedProps> = ({
  tokenEvents,
  isListening,
  copyToClipboard,
  clearEvents,
}) => (
  <div className="glass rounded-xl p-4 mb-6 text-left">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Live Activity</p>
      </div>
      <div className="flex items-center gap-1.5">
        {isListening ? (
          <>
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="w-2 h-2 rounded-full bg-success"
            />
            <span className="text-[10px] text-success font-medium">Listening</span>
          </>
        ) : (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-600" />
            <span className="text-[10px] text-gray-500 font-medium">Inactive</span>
          </>
        )}
      </div>
    </div>

    {tokenEvents.length > 0 ? (
      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
        <AnimatePresence initial={false}>
          {tokenEvents.map((evt) => (
            <motion.div
              key={evt.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 20, height: 0 }}
              transition={{ duration: 0.3 }}
              className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                evt.type === 'Transfer'
                  ? 'bg-success/5 border border-success/10 hover:border-success/20'
                  : 'bg-primary/5 border border-primary/10 hover:border-primary/20'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  evt.type === 'Transfer' ? 'bg-success/10' : 'bg-primary/10'
                }`}
              >
                {evt.type === 'Transfer' ? (
                  <Send className="w-3.5 h-3.5 text-success" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      evt.type === 'Transfer' ? 'text-success' : 'text-primary'
                    }`}
                  >
                    {evt.type}
                  </span>
                  <span className="text-[10px] text-gray-600">•</span>
                  <span className="text-[10px] text-gray-500">{timeAgo(evt.timestamp)}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
                  <span
                    className="hover:text-white transition-colors cursor-pointer"
                    title={evt.from}
                    onClick={() => copyToClipboard(evt.from)}
                  >
                    {truncateAddress(evt.from)}
                  </span>
                  <ArrowRight className="w-3 h-3 text-gray-600 flex-shrink-0" />
                  <span
                    className="hover:text-white transition-colors cursor-pointer"
                    title={evt.to}
                    onClick={() => copyToClipboard(evt.to)}
                  >
                    {truncateAddress(evt.to)}
                  </span>
                </div>
              </div>

              <div className="text-right flex-shrink-0">
                <p
                  className={`text-xs font-mono font-bold ${
                    evt.type === 'Transfer' ? 'text-success' : 'text-primary'
                  }`}
                >
                  {formatTokenAmount(evt.value)}
                </p>
                <p className="text-[9px] text-gray-600 uppercase">tokens</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-6">
        <motion.div
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        >
          <Radio className="w-8 h-8 text-gray-600 mb-3" />
        </motion.div>
        <p className="text-xs text-gray-500 text-center">
          Listening for token activity...
        </p>
        <p className="text-[10px] text-gray-600 text-center mt-1">
          Transfer or approve tokens to see events here
        </p>
      </div>
    )}

    {tokenEvents.length > 0 && (
      <div className="mt-3 pt-2 border-t border-border/50 flex items-center justify-between">
        <span className="text-[10px] text-gray-600">
          {tokenEvents.length} event{tokenEvents.length !== 1 ? 's' : ''} captured
        </span>
        <button
          onClick={clearEvents}
          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Clear
        </button>
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Error View
// ---------------------------------------------------------------------------

interface ErrorViewProps {
  errorMsg: string;
  txHash: string;
  copyToClipboard: (text: string) => void;
  onRetry: () => void;
}

const ErrorView: React.FC<ErrorViewProps> = ({ errorMsg, txHash, copyToClipboard, onRetry }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.9 }}
    className="text-center py-6"
  >
    <div className="w-20 h-20 rounded-full bg-error/10 border border-error/30 flex items-center justify-center mx-auto mb-6">
      <AlertCircle className="w-10 h-10 text-error" />
    </div>
    <h3 className="text-2xl font-bold text-white mb-2">Deployment Failed</h3>
    <div className="text-gray-400 mb-4 text-sm max-w-sm mx-auto space-y-2">
      {errorMsg
        .split('\n')
        .filter(Boolean)
        .map((line, i) => (
          <p key={i}>{line}</p>
        ))}
    </div>

    {txHash && (
      <div className="glass rounded-lg p-3 mb-4 max-w-sm mx-auto">
        <div className="flex items-center justify-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">TX:</span>
          <a
            href={getExplorerTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-primary hover:underline truncate"
          >
            {txHash.slice(0, 18)}...{txHash.slice(-8)}
          </a>
          <button
            onClick={() => copyToClipboard(txHash)}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <Copy className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      </div>
    )}

    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onRetry}
      className="px-8 py-3 rounded-xl glass border border-error/30 text-error font-semibold text-sm hover:bg-error/10 transition-all"
    >
      Try Again
    </motion.button>
  </motion.div>
);

// ---------------------------------------------------------------------------
// Form View
// ---------------------------------------------------------------------------

interface FormViewProps {
  tokenName: string;
  tokenSymbol: string;
  trimmedName: string;
  trimmedSymbol: string;
  deployStep: DeployStep;
  txHash: string;
  canDeploy: boolean;
  address: string | null;
  isConnecting: boolean;
  isWrongNetwork: boolean;
  connect: () => void;
  switchToLitVM: () => void;
  onNameChange: (value: string) => void;
  onSymbolChange: (value: string) => void;
  onDeploy: () => void;
}

const FormView: React.FC<FormViewProps> = ({
  tokenName,
  tokenSymbol,
  trimmedName,
  trimmedSymbol,
  deployStep,
  txHash,
  canDeploy,
  address,
  isConnecting,
  isWrongNetwork,
  connect,
  switchToLitVM,
  onNameChange,
  onSymbolChange,
  onDeploy,
}) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    {/* Form Header */}
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center">
        <Rocket className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-white">Create Token</h3>
        <p className="text-xs text-gray-500">
          Fill in details to deploy your ERC-20 on LitVM
        </p>
      </div>
    </div>

    {/* Token Name Input */}
    <div className="mb-4">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
        <Tag className="w-4 h-4 text-primary" />
        Token Name
      </label>
      <div className="relative">
        <input
          type="text"
          value={tokenName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. LitVM Token"
          disabled={deployStep !== 'idle'}
          maxLength={64}
          className="w-full px-4 py-3.5 rounded-xl bg-background/80 border border-border text-white placeholder-gray-600 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all duration-300 text-sm font-medium"
        />
        {trimmedName && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <CheckCircle2 className="w-4 h-4 text-success" />
          </motion.div>
        )}
      </div>
    </div>

    {/* Token Symbol Input */}
    <div className="mb-6">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
        <Hash className="w-4 h-4 text-secondary" />
        Token Symbol
      </label>
      <div className="relative">
        <input
          type="text"
          value={tokenSymbol}
          onChange={(e) => onSymbolChange(e.target.value.toUpperCase().slice(0, 10))}
          placeholder="e.g. LIT"
          disabled={deployStep !== 'idle'}
          maxLength={10}
          className="w-full px-4 py-3.5 rounded-xl bg-background/80 border border-border text-white placeholder-gray-600 focus:border-secondary/50 focus:ring-1 focus:ring-secondary/20 transition-all duration-300 text-sm font-mono font-medium uppercase"
        />
        {trimmedSymbol && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <CheckCircle2 className="w-4 h-4 text-success" />
          </motion.div>
        )}
      </div>
    </div>

    {/* Token Distribution Preview */}
    <div className="glass rounded-xl p-4 mb-6 space-y-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Token Distribution</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-sm text-gray-300">Your Wallet</span>
        </div>
        <span className="text-sm font-mono text-success font-medium">{DEPLOYER_RECEIVES}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-accent" />
          <span className="text-sm text-gray-300">Fee Wallet</span>
        </div>
        <span className="text-sm font-mono text-accent font-medium">{FEE_AMOUNT}</span>
      </div>

      <div className="w-full h-2 bg-background/80 rounded-full overflow-hidden">
        <div className="flex h-full w-full">
          <div
            className="bg-success h-full rounded-l-full"
            style={{ width: 'calc(100% - 4px)' }}
          />
          <div
            className="bg-accent h-full rounded-r-full"
            style={{ width: '4px', flexShrink: 0 }}
          />
        </div>
      </div>

      <div className="pt-2 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Shield className="w-3 h-3" />
          <span>Fee wallet:</span>
          <code className="font-mono text-gray-400 text-[10px]">
            {FEE_WALLET.slice(0, 8)}...{FEE_WALLET.slice(-6)}
          </code>
        </div>
      </div>
    </div>

    {/* Deploy / Connect / Switch Buttons */}
    {!address ? (
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={connect}
        disabled={isConnecting}
        className="w-full relative py-4 rounded-xl font-bold text-sm overflow-hidden group disabled:opacity-60"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
        <span className="relative flex items-center justify-center gap-2 text-white">
          <Wallet className="w-5 h-5" />
          {isConnecting ? 'Connecting...' : 'Connect Wallet to Deploy'}
        </span>
      </motion.button>
    ) : isWrongNetwork ? (
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={switchToLitVM}
        className="w-full relative py-4 rounded-xl font-bold text-sm overflow-hidden group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-warning/80 to-orange-500/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-warning to-orange-500 blur-xl opacity-40 group-hover:opacity-60 transition-opacity" />
        <span className="relative flex items-center justify-center gap-2 text-white">
          <AlertTriangle className="w-5 h-5" />
          Switch to LitVM Network
        </span>
      </motion.button>
    ) : (
      <motion.button
        whileHover={canDeploy ? { scale: 1.01 } : {}}
        whileTap={canDeploy ? { scale: 0.99 } : {}}
        onClick={onDeploy}
        disabled={!canDeploy || deployStep !== 'idle'}
        className={`w-full relative py-4 rounded-xl font-bold text-sm overflow-hidden group transition-all duration-300 ${
          !canDeploy ? 'opacity-40 cursor-not-allowed' : ''
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent" />
        {canDeploy && (
          <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
        )}
        <span className="relative flex items-center justify-center gap-2 text-white">
          {deployStep === 'confirming' || deployStep === 'deploying' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {deployStep === 'confirming' ? 'Confirm in Wallet...' : 'Deploying Contract...'}
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              Deploy Token
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </span>
      </motion.button>
    )}

    {/* Loading States */}
    <AnimatePresence>
      {(deployStep === 'confirming' || deployStep === 'deploying' || deployStep === 'verifying') && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-4"
        >
          <div className="glass rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {deployStep === 'confirming'
                    ? 'Waiting for wallet confirmation...'
                    : deployStep === 'deploying'
                    ? 'Deploying to LitVM...'
                    : 'Verifying supply on-chain...'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {deployStep === 'confirming'
                    ? 'Please confirm the transaction in your wallet'
                    : deployStep === 'deploying'
                    ? 'This may take a moment depending on network congestion'
                    : 'Checking supply distribution matches expected values'}
                </p>
              </div>
            </div>

            {deployStep === 'deploying' && txHash && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wider">TX:</span>
                  <a
                    href={getExplorerTxUrl(txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-mono text-primary hover:underline truncate"
                  >
                    {txHash.slice(0, 18)}...{txHash.slice(-8)}
                  </a>
                </div>
              </div>
            )}

            {/* 4-step progress bar */}
            <div className="flex items-center gap-2 mt-4">
              <div
                className={`flex-1 h-1 rounded-full ${
                  deployStep === 'confirming' ? 'bg-primary animate-pulse' : 'bg-success'
                }`}
              />
              <div
                className={`flex-1 h-1 rounded-full ${
                  deployStep === 'deploying'
                    ? 'bg-primary animate-pulse'
                    : deployStep === 'verifying'
                    ? 'bg-success'
                    : 'bg-border'
                }`}
              />
              <div
                className={`flex-1 h-1 rounded-full ${
                  deployStep === 'verifying' ? 'bg-primary animate-pulse' : 'bg-border'
                }`}
              />
              <div className="flex-1 h-1 rounded-full bg-border" />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-gray-500">Confirm</span>
              <span className="text-[10px] text-gray-500">Deploy</span>
              <span className="text-[10px] text-gray-500">Verify</span>
              <span className="text-[10px] text-gray-500">Complete</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </motion.div>
);

export default TokenDeployer;
