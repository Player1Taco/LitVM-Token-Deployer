import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Copy, ExternalLink, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { getStoredDeployments, type DeployedToken } from '../utils/contract';
import toast from 'react-hot-toast';

const DeploymentHistory: React.FC = () => {
  const [deployments, setDeployments] = useState<DeployedToken[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const load = () => setDeployments(getStoredDeployments());
    load();

    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const clearHistory = () => {
    localStorage.removeItem('litvm-deployments');
    setDeployments([]);
    toast.success('History cleared');
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (deployments.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.6 }}
      className="w-full max-w-2xl mx-auto mt-8"
    >
      <div className="glass-strong rounded-2xl overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-white">Deployment History</h3>
              <p className="text-xs text-gray-500">{deployments.length} token{deployments.length > 1 ? 's' : ''} deployed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearHistory();
              }}
              className="p-1.5 rounded-lg hover:bg-error/10 transition-colors"
              title="Clear history"
            >
              <Trash2 className="w-3.5 h-3.5 text-gray-500 hover:text-error" />
            </button>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </button>

        {/* List */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/50 p-4 space-y-3 max-h-80 overflow-y-auto">
                {deployments.map((token, index) => (
                  <motion.div
                    key={token.address + token.timestamp}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="glass rounded-xl p-4 hover:border-primary/20 transition-all duration-300"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {token.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{token.name}</h4>
                        <p className="text-xs font-mono text-primary">${token.symbol}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-gray-500">{formatTime(token.timestamp)}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-background/50 rounded-lg px-3 py-2">
                      <code className="text-[11px] font-mono text-gray-300 flex-1 truncate">{token.address}</code>
                      <button
                        onClick={() => copyToClipboard(token.address)}
                        className="p-1 rounded hover:bg-white/10 transition-colors flex-shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5 text-gray-500 hover:text-primary" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default DeploymentHistory;
