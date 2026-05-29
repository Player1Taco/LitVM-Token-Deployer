/**
 * useTokenEvents Hook
 *
 * Manages on-chain event listeners for deployed token contracts.
 *
 * Fix #9:  Event listener errors are caught and logged
 * Fix #10: rawValue stored as string to avoid BigInt serialization issues
 * Fix #18: eventCounter uses useRef for stable incrementing
 */

import { useState, useRef, useCallback } from 'react';
import { Contract, formatUnits } from 'ethers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenEvent {
  id: number;
  type: 'Transfer' | 'Approval';
  from: string;
  to: string;
  value: string; // Fix #10: stored as formatted string, not BigInt
  rawValue: string; // Fix #10: raw wei value as string
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTokenEvents() {
  const [tokenEvents, setTokenEvents] = useState<TokenEvent[]>([]);
  const [isListening, setIsListening] = useState(false);

  // Fix #18: Stable counter ref
  const eventCounterRef = useRef(0);

  // Fix #6: contractRef typed as Contract | null
  const contractRef = useRef<Contract | null>(null);

  /**
   * Attach Transfer and Approval event listeners to a deployed contract.
   *
   * Fix #9: All listener attachment and event processing is wrapped in try/catch.
   */
  const attachEventListeners = useCallback((contract: Contract) => {
    // Cleanup previous listeners if any
    if (contractRef.current) {
      try {
        contractRef.current.removeAllListeners();
      } catch (err) {
        console.warn('[Events] Failed to remove previous listeners:', err);
      }
    }

    contractRef.current = contract;

    try {
      // Transfer events
      contract.on('Transfer', (from: string, to: string, value: bigint) => {
        try {
          const id = ++eventCounterRef.current;
          const formatted = formatUnits(value, 18);
          const newEvent: TokenEvent = {
            id,
            type: 'Transfer',
            from,
            to,
            value: formatted,
            rawValue: value.toString(),
            timestamp: Date.now(),
          };

          setTokenEvents((prev) => [newEvent, ...prev].slice(0, 100));
          console.log('[Events] Transfer:', from, '→', to, formatted);
        } catch (err) {
          console.warn('[Events] Error processing Transfer event:', err);
        }
      });

      // Approval events
      contract.on('Approval', (owner: string, spender: string, value: bigint) => {
        try {
          const id = ++eventCounterRef.current;
          const formatted = formatUnits(value, 18);
          const newEvent: TokenEvent = {
            id,
            type: 'Approval',
            from: owner,
            to: spender,
            value: formatted,
            rawValue: value.toString(),
            timestamp: Date.now(),
          };

          setTokenEvents((prev) => [newEvent, ...prev].slice(0, 100));
          console.log('[Events] Approval:', owner, '→', spender, formatted);
        } catch (err) {
          console.warn('[Events] Error processing Approval event:', err);
        }
      });

      setIsListening(true);
      console.log('[Events] Listeners attached successfully');
    } catch (err) {
      console.error('[Events] Failed to attach event listeners:', err);
      setIsListening(false);
    }
  }, []);

  /**
   * Remove all event listeners from the current contract.
   */
  const cleanupListeners = useCallback(() => {
    if (contractRef.current) {
      try {
        contractRef.current.removeAllListeners();
        console.log('[Events] Listeners removed');
      } catch (err) {
        console.warn('[Events] Error removing listeners:', err);
      }
      contractRef.current = null;
    }
    setIsListening(false);
  }, []);

  /**
   * Clear the event log.
   */
  const clearEvents = useCallback(() => {
    setTokenEvents([]);
    eventCounterRef.current = 0;
  }, []);

  return {
    tokenEvents,
    isListening,
    attachEventListeners,
    cleanupListeners,
    clearEvents,
  };
}
