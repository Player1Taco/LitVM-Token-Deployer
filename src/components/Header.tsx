import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Wallet, ChevronDown, LogOut, Zap, AlertTriangle } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';

const Header: React.FC = () => {
  const { address, isConnecting, isWrongNetwork, connect, disconnect, switchToLitVM } = useWallet();
  const [showDropdown, setShowDropdown] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-4 mt-4">
        <div className="glass-strong rounded-2xl px-6 py-3 flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary via-purple-500 to-accent flex items-center justify-center">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-surface animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">
                <span className="text-gradient">LitVM</span>
              </h1>
              <p className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">Token Deployer</p>
            </div>
          </div>

          {/* Center — LitVM Only Badge */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/10">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-gray-400">ERC-20</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/5 border border-accent/10">
              <span className="text-xs text-gray-400">🌮 LitVM Only</span>
            </div>
          </div>

          {/* Wallet Button */}
          <div className="relative" ref={dropdownRef}>
            {address ? (
              <div>
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl glass transition-all duration-300 group ${
                    isWrongNetwork ? 'border-warning/40 hover:border-warning/60' : 'hover:border-primary/30'
                  }`}
                >
                  {isWrongNetwork ? (
                    <AlertTriangle className="w-4 h-4 text-warning animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  )}
                  <div className="text-left hidden sm:block">
                    <p className={`text-xs ${isWrongNetwork ? 'text-warning' : 'text-gray-400'}`}>
                      {isWrongNetwork ? 'Wrong Network' : 'LitVM'}
                    </p>
                    <p className="text-sm font-mono font-medium text-white">{formatAddress(address)}</p>
                  </div>
                  <p className="text-sm font-mono font-medium text-white sm:hidden">{formatAddress(address)}</p>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                </button>

                <AnimatePresence>
                  {showDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 glass-strong rounded-xl overflow-hidden shadow-2xl"
                    >
                      {isWrongNetwork && (
                        <button
                          onClick={() => {
                            switchToLitVM();
                            setShowDropdown(false);
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-warning hover:bg-warning/10 transition-colors flex items-center gap-2 border-b border-border/50"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          Switch to LitVM
                        </button>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(address);
                          setShowDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                      >
                        <Wallet className="w-4 h-4" />
                        Copy Address
                      </button>
                      <button
                        onClick={() => {
                          disconnect();
                          setShowDropdown(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-error hover:bg-error/10 transition-colors flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Disconnect
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={connect}
                disabled={isConnecting}
                className="relative px-6 py-2.5 rounded-xl font-semibold text-sm overflow-hidden group disabled:opacity-60"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent" />
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-accent opacity-0 group-hover:opacity-100 blur-xl transition-opacity" />
                <div className="relative flex items-center gap-2 text-white">
                  <Wallet className="w-4 h-4" />
                  {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                </div>
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default Header;
