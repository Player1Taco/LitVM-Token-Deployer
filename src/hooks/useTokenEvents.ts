/**
 * useTokenEvents Hook
 *
 * Manages contract event listeners (Transfer, Approval) and the event feed state.
 *
 * Fix #9: Event listener callbacks wrapped in try-catch.
 * Fix #10: rawValue stored as string (not bigint) for JSON serialization safety.
 * Fix #18: Event counter uses useRef instead of module-level mutable state.
 * Fix #26: Extracted from TokenDeployer for component decomposition.
 */

import { useState, useRef, useCallback } from 'react';
import { Contract, formatUnits } from 'ethers';
import { TOKEN_DECIMALS } from '../utils/contract';
import { formatTokenAmount } from '../utils/formatters';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenEvent {
  /** Unique identifier for React key */
  id: string;
  /** Event type emitted by the contract */
  type: 'Transfer' | 'Approval';
  /** Sender / Owner address */
  from: string;
  /** Recipient / Spender address */
  to: string;
  /** Formatted token amount (human-readable, 18 decimals applied) */
  value: string;
  /**
   * Raw value as a string (NOT bigint).
   * Fix #10: Stored as string so events can be safely JSON.stringify()'d
   * without throwing "Do not know how to serialize a BigInt".
   * Convert back to BigInt with BigInt(rawValue) when needed for comparison.
   */
  rawValue: string;
  /** Client-side timestamp when event was received */
  timestamp: number;
}

/** Maximum number of events to keep in state */
const MAX_EVENTS = 50;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTokenEvents() {
  const [tokenEvents, setTokenEvents] = useState<TokenEvent[]>([]);
  const [isListening, setIsListening] = useState(false);
  const contractRef = useRef<Contract | null>(null); // Fix #6: proper typing
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventCounterRef = useRef(0); // Fix #18: useRef instead of module-level

  // Force re-render for time-ago labels
  const [, setTick] = useState(0);

  /** Generate a unique event ID (fix #18: uses ref, not module-level) */
  const nextEventId = useCallback((): string => {
    eventCounterRef.current += 1;
    return `evt-${Date.now()}-${eventCounterRef.current}`;
  }, []);

  /**
   * Remove all event listeners and clean up resources.
   */
  const cleanupListeners = useCallback(() => {
    if (contractRef.current) {
      try {
        console.log('[Events] Removing all contract event listeners');
        contractRef.current.removeAllListeners();
      } catch (err) {
        console.warn('[Events] Error removing listeners:', err);
      }
      contractRef.current = null;
    }
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    setIsListening(false);
  }, []);

  /**
   * Attach Transfer and Approval event listeners to a deployed contract.
   *
   * Fix #9: Callbacks wrapped in try-catch so listener errors don't silently disappear.
   */
  const attachEventListeners = useCallback((deployedContract: Contract) => {
    if (!deployedContract) {
      console.warn('[Events] Cannot attach listeners: contract is null');
      return;
    }

    contractRef.current = deployedContract;
    console.log('[Events] Attaching Transfer and Approval event listeners');

    // ---- Transfer Event Listener (fix #9: try-catch) ----
    deployedContract.on(
      'Transfer',
      (from: string, to: string, value: bigint) => {
        try {
          const formattedValue = formatUnits(value, TOKEN_DECIMALS);

          console.log('[Event] Transfer:', {
            from,
            to,
            value: formattedValue,
            rawValue: value.toString(),
          });

          const event: TokenEvent = {
            id: nextEventId(),
            type: 'Transfer',
            from,
            to,
            value: formattedValue,
            rawValue: value.toString(), // Fix #10: string, not bigint
            timestamp: Date.now(),
          };

          setTokenEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));

          toast(`Transfer: ${formatTokenAmount(formattedValue)} tokens`, {
            icon: '📤',
            style: {
              background: '#1E293B',
              color: '#fff',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            },
          });
        } catch (err) {
          console.error('[Events] Error in Transfer listener callback:', err);
        }
      }
    );

    // ---- Approval Event Listener (fix #9: try-catch) ----
    deployedContract.on(
      'Approval',
      (owner: string, spender: string, value: bigint) => {
        try {
          const formattedValue = formatUnits(value, TOKEN_DECIMALS);

          console.log('[Event] Approval:', {
            owner,
            spender,
            value: formattedValue,
            rawValue: value.toString(),
          });

          const event: TokenEvent = {
            id: nextEventId(),
            type: 'Approval',
            from: owner,
            to: spender,
            value: formattedValue,
            rawValue: value.toString(), // Fix #10: string, not bigint
            timestamp: Date.now(),
          };

          setTokenEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));

          toast(`Approval: ${formatTokenAmount(formattedValue)} tokens`, {
            icon: '✅',
            style: {
              background: '#1E293B',
              color: '#fff',
              border: '1px solid rgba(139, 92, 246, 0.3)',
            },
          });
        } catch (err) {
          console.error('[Events] Error in Approval listener callback:', err);
        }
      }
    );

    setIsListening(true);

    // Ticker to refresh time-ago labels
    tickerRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 10_000);

    console.log('[Events] Listeners attached successfully — monitoring Transfer & Approval');
  }, [nextEventId]);

  /**
   * Clear all captured events from the feed.
   */
  const clearEvents = useCallback(() => {
    setTokenEvents([]);
  }, []);

  return {
    tokenEvents,
    isListening,
    attachEventListeners,
    cleanupListeners,
    clearEvents,
  };
}
