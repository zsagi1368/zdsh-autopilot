/**
 * ContinueScheduler — per-session state machine for auto-resume.
 *
 * Two-gate discipline: conditions are checked when the grace timer is armed
 * AND again when it fires (config and pause state may change inside the
 * window). Cross-module gates (pause / pending approval / circuit) live in the
 * coordinator and are consulted through `requestResume`, which returns the
 * dispatch outcome so a DEFERRED result reschedules instead of dropping.
 *
 * The scheduler never sends by itself: `adapters.sendFollowup` performs the
 * side effect after `beginAttempt` has booked the attempt.
 */
import type { DispatchOutcome } from '../kernel/coordinator.js';
import type { Clock, RandomSource } from '../kernel/ledger.js';
import type { BackoffParams } from '../kernel/ledger.js';
import type { ApResumedPayload, ApSkippedPayload } from '../kernel/types.js';
import type { LoopGuard } from './loopguard.js';
export interface SchedulerAdapters {
    /** Ask the kernel coordinator to gate and route this resume request. */
    requestResume(sessionId: string): DispatchOutcome[];
    /** Perform the actual followup send. Returns false when no live agent exists. */
    sendFollowup(sessionId: string, text: string, template: 'continue' | 'continue-max-tokens' | 'loop'): boolean;
    setTimeoutMs(fn: () => void, ms: number): () => void;
    auditResumed(payload: ApResumedPayload): void;
    auditSkipped(payload: ApSkippedPayload): void;
}
export declare class ContinueScheduler {
    private readonly adapters;
    private readonly clock;
    private readonly rng;
    private readonly ledgerHub;
    private readonly backoff;
    private readonly limits;
    private sessions;
    constructor(adapters: SchedulerAdapters, clock: Clock, rng: RandomSource, ledgerHub: {
        session(id: string, backoff: BackoffParams): {
            beginAttempt(now: number): number;
            inCooldown(now: number): boolean;
            consecutive: number;
            noteRecovery(): void;
            noteUserMessage(): void;
        };
    }, backoff: BackoffParams, limits: {
        graceMs: number;
        maxConsecutive: number;
    });
    beginTurn(sessionId: string): void;
    noteUserMessage(sessionId: string): void;
    pauseSession(sessionId: string, durationMs: number): void;
    resumeSession(sessionId: string): void;
    /** Explicit human action — bypasses every gate except "agent exists". */
    resumeNow(sessionId: string, text: string): boolean;
    cancelPending(sessionId: string): void;
    closeSession(sessionId: string): void;
    /**
     * Called after the detector decided a turn is resume-worthy.
     * Returns true when a grace timer was armed.
     */
    schedule(sessionId: string, template: 'continue' | 'continue-max-tokens', buildText: () => string): boolean;
    private fire;
    /** Recovery bookkeeping after an assistant turn completes successfully. */
    noteRecoveredTurn(sessionId: string): void;
    nextReadyIn(sessionId: string, loopGuard: LoopGuard): number;
    makeAttemptId(): string;
    private stateFor;
    private gateLocal;
    private localSkipReason;
}
