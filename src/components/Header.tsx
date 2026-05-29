/**
 * Header Component
 *
 * Top navigation bar with wallet connection button.
 * Handles all wallet states: disconnected, connecting, connected, wrong network.
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  ChevronDown,
  LogOut,
  ExternalLink,
  Copy,
  Check,
  Zap,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { getExplorerAddressUrl } from '../utils/chain';
import toast from 'react-hot-toast';

const Header: React.FC = () => {
  const {
    address,
    isConnecting,
    isConnected,
    isWrongNetwork,
    chainId,
    connect,
    disconnect,
    switchToLitVM,
  } = useWallet();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const truncatedAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success('Address copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConnect = async () => {
    try {
      await connect();
    } catch (err) {
      console.error('[Header] Connect failed:', err);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="glass-strong border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-accent flex items-center justify-center shadow-lg shadow-primary/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-bold text-white leading-tight">
                LitVM <span className="text-primary">Deployer</span>
              </h1>
              <p className="text-[10px] text-gray-500 leading-tight">Token Factory</p>
            </div>
          </motion.div>

          {/* Right Side: Network Indicator + Wallet Button */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            {/* Network Indicator (only when connected) */}
            <AnimatePresence>
              {isConnected && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    isWrongNetwork
                      ? 'border-warning/30 bg-warning/10 text-warning'
                      : 'border-success/20 bg-success/5 text-success'
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isWrongNetwork ? 'bg-warning animate-pulse' : 'bg-success'
                    }`}
                  />
                  {isWrongNetwork ? (
                    <button
                      onClick={switchToLitVM}
                      className="hover:underline underline-offset-2"
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <span>LitVM</span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Wallet Button / Dropdown */}
            {!isConnected ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConnect}
                disabled={isConnecting}
                className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {/* Button gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent" />
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />

                <span className="relative flex items-center gap-2">
                  {isConnecting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" />
                      <span>Connect</span>
                    </>
                  )}
                </span>
              </motion.button>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl glass border transition-all duration-200 ${
                    dropdownOpen
                      ? 'border-primary/40 bg-primary/5'
                      : isWrongNetwork
                      ? 'border-warning/30 hover:border-warning/50'
                      : 'border-border hover:border-primary/30'
                  }`}
                >
                  {/* Status dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      isWrongNetwork ? 'bg-warning animate-pulse' : 'bg-success'
                    }`}
                  />

                  {/* Address */}
                  <span className="text-sm font-mono font-medium text-white">
                    {truncatedAddress}
                  </span>

                  {/* Chevron */}
                  <ChevronDown
                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                      dropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </motion.button>

                {/* Dropdown */}
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-72 glass-strong rounded-xl border border-border/60 shadow-2xl shadow-black/40 overflow-hidden"
                    >
                      {/* Account Info */}
                      <div className="p-4 border-b border-border/40">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                          Connected Account
                        </p>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/20 flex items-center justify-center">
                            <Wallet className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono text-white truncate">{address}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {isWrongNetwork ? (
                                <span className="text-warning">Wrong network (Chain {chainId})</span>
                              ) : (
                                <span className="text-success">LitVM Network</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Wrong network action */}
                      {isWrongNetwork && (
                        <div className="px-4 py-3 border-b border-border/40">
                          <button
                            onClick={() => {
                              switchToLitVM();
                              setDropdownOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Switch to LitVM Network
                          </button>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="p-2">
                        <button
                          onClick={() => {
                            copyAddress();
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-sm text-gray-300"
                        >
                          {copied ? (
                            <Check className="w-4 h-4 text-success" />
                          ) : (
                            <Copy className="w-4 h-4 text-gray-500" />
                          )}
                          {copied ? 'Copied!' : 'Copy Address'}
                        </button>

                        <a
                          href={getExplorerAddressUrl(address!)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setDropdownOpen(false)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-sm text-gray-300"
                        >
                          <ExternalLink className="w-4 h-4 text-gray-500" />
                          View on Explorer
                        </a>

                        <div className="my-1 border-t border-border/30" />

                        <button
                          onClick={() => {
                            disconnect();
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-error/10 transition-colors text-sm text-error/80 hover:text-error"
                        >
                          <LogOut className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </header>
  );
};

export default Header;
