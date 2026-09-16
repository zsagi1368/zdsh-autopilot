/**
 * AutomationCoordinator — the single subscription point and cross-module
 * referee.
 *
 * Invariants enforced here (modules never re-implement them):
 *  1. A session with a pending approval defers auto-resume (deferred, not
 *     dropped — the module reschedules).
 *  2. An open review circuit suppresses auto-resume (skipped: circuit-open).
 *  3. Global pause stops all modules.
 *  4. One approval callId is dispositioned exactly once (first claim wins).
 */
import type { ModuleId, SkipReason } from './types.js';
export type CoordinationEvent = {
    kind: 'turn-ended';
    sessionId: string;
    reason: string;
} | {
    kind: 'approval-pending';
    sessionId: string;
    callId: string;
    toolName: string;
} | {
    kind: 'approval-resolved';
    sessionId: string;
    callId: string;
} | {
    kind: 'resume-request';
    sessionId: string;
} | {
    kind: 'circuit-change';
    open: boolean;
} | {
    kind: 'pause-change';
    paused: boolean;
};
export type DispatchStatus = 'dispatched' | 'suppressed' | 'deferred' | 'duplicate';
export interface DispatchOutcome {
    status: DispatchStatus;
    /** Populated when status is suppressed/deferred. */
    reason?: SkipReason;
}
/** Read-only view of coordinator state handed to module handlers. */
export interface CoordinationView {
    readonly paused: boolean;
    readonly circuitOpen: boolean;
    hasPendingApproval(sessionId: string): boolean;
    /** Claim a call for disposition. First caller wins; losers get false. */
    claimCall(callId: string): boolean;
}
export type CoordinationHandler = (event: CoordinationEvent, view: CoordinationView) => void;
export declare class AutomationCoordinator {
    private handlers;
    private pendingBySession;
    private claimedCalls;
    /** Internal mutable twin of the readonly view handed to modules. */
    private readonly view;
    registerModule(moduleId: ModuleId, handler: CoordinationHandler): void;
    setModuleEnabled(moduleId: ModuleId, enabled: boolean): void;
    setPaused(paused: boolean): void;
    setCircuitOpen(open: boolean): void;
    get paused(): boolean;
    get circuitOpen(): boolean;
    dispatch(event: CoordinationEvent): DispatchOutcome[];
}
