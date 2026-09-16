/**
 * Accounting engine: cooldowns, backoff, dual budgets, and stats.
 *
 * Core invariant — "book before you act": `beginAttempt` records the attempt
 * timestamp BEFORE any side effect is performed, so a throwing send still
 * consumes cooldown. Failed attempts count against consecutive limits; user-
 * or shutdown-driven cancellations never burn failure budgets.
 */
import { countsAgainstFailureBudget } from './failures.js';
export const systemClock = { now: () => Date.now() };
export function createTokenSource(random = Math.random) {
    return {
        token: () => Math.floor(random() * 0xffffffff).toString(36) + Date.now().toString(36),
    };
}
export function effectiveCooldown(consecutive, params) {
    const raw = params.baseMs * Math.pow(params.factor, Math.max(0, consecutive));
    return Math.min(params.capMs, raw);
}
// ---------------------------------------------------------------------------
// Dual budgets per open turn
// ---------------------------------------------------------------------------
export class TurnBudgets {
    maxDecisions;
    maxFailures;
    decisionsUsed = 0;
    failuresUsed = 0;
    constructor(maxDecisions, maxFailures) {
        this.maxDecisions = maxDecisions;
        this.maxFailures = maxFailures;
    }
    get decisionsRemaining() {
        return this.maxDecisions - this.decisionsUsed;
    }
    get failuresRemaining() {
        return this.maxFailures - this.failuresUsed;
    }
    get decisionBudgetExhausted() {
        return this.decisionsRemaining <= 0;
    }
    get failureBudgetExhausted() {
        return this.failuresRemaining <= 0;
    }
    /** Reserve one real decision slot. Returns false when exhausted. */
    tryConsumeDecision() {
        if (this.decisionBudgetExhausted)
            return false;
        this.decisionsUsed += 1;
        return true;
    }
    /**
     * Record a failed decision attempt. Cancelled failures do NOT burn the
     * failure budget (the user pulled the plug, not the reviewer).
     */
    recordFailure(kind) {
        if (countsAgainstFailureBudget(kind))
            this.failuresUsed += 1;
    }
}
// ---------------------------------------------------------------------------
// Per-session ledger
// ---------------------------------------------------------------------------
export class SessionLedger {
    backoff;
    lastAttemptAt = 0;
    consecutiveResumes = 0;
    constructor(backoff) {
        this.backoff = backoff;
    }
    /** Window that applies after the attempt just booked: retry #n waits base×factor^(n-1). */
    currentWindow() {
        return effectiveCooldown(Math.max(0, this.consecutiveResumes - 1), this.backoff);
    }
    /**
     * Book the attempt BEFORE performing the side effect. The returned cooldown
     * applies from now on regardless of success.
     */
    beginAttempt(now) {
        this.lastAttemptAt = now;
        this.consecutiveResumes += 1;
        return this.currentWindow();
    }
    noteRecovery() {
        this.consecutiveResumes = 0;
    }
    noteUserMessage() {
        this.consecutiveResumes = 0;
    }
    get consecutive() {
        return this.consecutiveResumes;
    }
    readyAt() {
        return this.lastAttemptAt + this.currentWindow();
    }
    inCooldown(now) {
        return now < this.readyAt();
    }
}
function emptyBuckets() {
    return {};
}
function dayKeyOf(now) {
    return new Date(now).toISOString().slice(0, 10);
}
export class StatsCounters {
    clock;
    snapshot;
    constructor(clock, restored) {
        this.clock = clock;
        this.snapshot =
            restored && restored.dayKey === dayKeyOf(clock.now())
                ? restored
                : {
                    dayKey: dayKeyOf(clock.now()),
                    today: emptyBuckets(),
                    all: restored?.all ?? {},
                    perModule: restored?.perModule ?? { continue: {}, guard: {}, review: {} },
                };
    }
    inc(name, by = 1, moduleId) {
        // Roll the daily bucket on date change.
        const key = dayKeyOf(this.clock.now());
        if (key !== this.snapshot.dayKey) {
            this.snapshot = { ...this.snapshot, dayKey: key, today: emptyBuckets() };
        }
        this.snapshot.today[name] = (this.snapshot.today[name] ?? 0) + by;
        this.snapshot.all[name] = (this.snapshot.all[name] ?? 0) + by;
        if (moduleId) {
            const bucket = this.snapshot.perModule[moduleId];
            bucket[name] = (bucket[name] ?? 0) + by;
        }
    }
    get(name, bucket = 'today') {
        const source = bucket === 'today' ? this.snapshot.today : this.snapshot.all;
        return source[name] ?? 0;
    }
    moduleTotals(moduleId, bucket = 'today') {
        if (bucket === 'all')
            return this.snapshot.perModule[moduleId];
        // Today-per-module is derivable only if tracked; keep 'today' module view
        // equal to the shared today counters for names touched by that module.
        return Object.fromEntries(Object.entries(this.snapshot.perModule[moduleId]).filter(([k]) => k in this.snapshot.today));
    }
    reset() {
        this.snapshot = {
            dayKey: dayKeyOf(this.clock.now()),
            today: emptyBuckets(),
            all: emptyBuckets(),
            perModule: { continue: {}, guard: {}, review: {} },
        };
    }
    exportSnapshot() {
        return JSON.parse(JSON.stringify(this.snapshot));
    }
}
// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------
export class LedgerHub {
    stats;
    sessions = new Map();
    turns = new Map();
    constructor(stats) {
        this.stats = stats;
    }
    session(sessionId, backoff) {
        let ledger = this.sessions.get(sessionId);
        if (!ledger) {
            ledger = new SessionLedger(backoff);
            this.sessions.set(sessionId, ledger);
        }
        return ledger;
    }
    closeSession(sessionId) {
        this.sessions.delete(sessionId);
        // Deleting during Map iteration is safe per spec and cannot resurface keys.
        for (const key of this.turns.keys()) {
            if (key.startsWith(`${sessionId}#`))
                this.turns.delete(key);
        }
    }
    turn(sessionId, turnId, maxDecisions, maxFailures) {
        const key = `${sessionId}#${turnId}`;
        let budgets = this.turns.get(key);
        if (!budgets) {
            budgets = new TurnBudgets(maxDecisions, maxFailures);
            this.turns.set(key, budgets);
        }
        return budgets;
    }
    endTurn(sessionId, turnId) {
        this.turns.delete(`${sessionId}#${turnId}`);
    }
    get statsCounters() {
        return this.stats;
    }
}
