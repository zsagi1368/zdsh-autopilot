/**
 * One-shot escalation capabilities.
 *
 * A grant is bound to five elements (session, tool, callId, level,
 * justification digest), consumable EXACTLY once, unconditionally reclaimed
 * at tool settlement — even if the permission preset changed mid-flight.
 */
import type { RandomSource } from '../kernel/ledger.js';
export interface GrantSpec {
    sessionId: string;
    toolName: string;
    callId: string;
    level: string;
    justification: string;
}
export type GrantDecision = 'allowed-once' | undefined;
export declare class EscalationGrants {
    private readonly rng;
    private readonly now;
    private readonly ttlMs;
    private readonly grants;
    constructor(rng: RandomSource, now?: () => number, ttlMs?: number);
    issue(spec: GrantSpec): string;
    /** Exact-match answer for the official approval seam. Consume on success. */
    decide(callId: string, toolName: string): GrantDecision;
    /** Unconditional reclamation at settlement — consumed or not. */
    settle(callId: string): void;
    get size(): number;
    private sweep;
}
