import type { FailureKind, ModuleId } from './types.js';
export interface Clock {
    now(): number;
}
export interface RandomSource {
    /** Short unguessable token for correlation ids. */
    token(): string;
}
/** Synchronous snapshot persistence; adapters should front a cached file. */
export interface StatsPersistence {
    load(): StatsSnapshot | undefined;
    save(snapshot: StatsSnapshot): void;
}
export declare const systemClock: Clock;
export declare function createTokenSource(random?: () => number): RandomSource;
export interface BackoffParams {
    baseMs: number;
    factor: number;
    capMs: number;
}
export declare function effectiveCooldown(consecutive: number, params: BackoffParams): number;
export declare class TurnBudgets {
    readonly maxDecisions: number;
    readonly maxFailures: number;
    private decisionsUsed;
    private failuresUsed;
    constructor(maxDecisions: number, maxFailures: number);
    get decisionsRemaining(): number;
    get failuresRemaining(): number;
    get decisionBudgetExhausted(): boolean;
    get failureBudgetExhausted(): boolean;
    /** Reserve one real decision slot. Returns false when exhausted. */
    tryConsumeDecision(): boolean;
    /**
     * Record a failed decision attempt. Cancelled failures do NOT burn the
     * failure budget (the user pulled the plug, not the reviewer).
     */
    recordFailure(kind: FailureKind): void;
}
export declare class SessionLedger {
    private readonly backoff;
    private lastAttemptAt;
    private consecutiveResumes;
    constructor(backoff: BackoffParams);
    /** Window that applies after the attempt just booked: retry #n waits base×factor^(n-1). */
    private currentWindow;
    /**
     * Book the attempt BEFORE performing the side effect. The returned cooldown
     * applies from now on regardless of success.
     */
    beginAttempt(now: number): number;
    noteRecovery(): void;
    noteUserMessage(): void;
    get consecutive(): number;
    readyAt(): number;
    inCooldown(now: number): boolean;
}
export type StatsBucketName = 'today' | 'all';
export interface StatsSnapshot {
    dayKey: string;
    today: Record<string, number>;
    all: Record<string, number>;
    perModule: Record<ModuleId, Record<string, number>>;
}
export declare class StatsCounters {
    private readonly clock;
    private snapshot;
    constructor(clock: Clock, restored?: StatsSnapshot);
    inc(name: string, by?: number, moduleId?: ModuleId): void;
    get(name: string, bucket?: StatsBucketName): number;
    moduleTotals(moduleId: ModuleId, bucket?: StatsBucketName): Record<string, number>;
    reset(): void;
    exportSnapshot(): StatsSnapshot;
}
export declare class LedgerHub {
    private readonly stats;
    private sessions;
    private turns;
    constructor(stats: StatsCounters);
    session(sessionId: string, backoff: BackoffParams): SessionLedger;
    closeSession(sessionId: string): void;
    turn(sessionId: string, turnId: string, maxDecisions: number, maxFailures: number): TurnBudgets;
    endTurn(sessionId: string, turnId: string): void;
    get statsCounters(): StatsCounters;
}
