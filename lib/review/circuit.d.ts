/**
 * Review circuit breaker.
 *
 * Defaults are DERIVED, not vibes: window 6-of-10 is reachable only because a
 * turn allows at most 10 real AI verdicts — a stricter window could never fire
 * first, a looser one would not protect the human chain.
 */
import type { RandomSource } from '../kernel/ledger.js';
export interface CircuitConfig {
    consecutiveDenials: number;
    windowSize: number;
    windowDenials: number;
    action: 'delegate' | 'reject' | 'abort-turn';
}
export declare const CIRCUIT_DEFAULTS: CircuitConfig;
export interface CircuitState {
    tripped: boolean;
    action: CircuitConfig['action'];
}
export declare class ReviewCircuit {
    readonly config: CircuitConfig;
    private readonly rng?;
    private readonly now;
    private consecutive;
    /** Denial outcomes within the sliding window (true = denial). */
    private window;
    constructor(config?: CircuitConfig, rng?: RandomSource | undefined, now?: () => number);
    record(decision: 'allow' | 'deny', escalatedToDenial?: boolean): void;
    get state(): CircuitState;
    isTripped(): boolean;
    /** Reset after human intervention or an explicit cool-off. */
    reset(): void;
    snapshotToken(): string;
}
