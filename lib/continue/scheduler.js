import { effectiveCooldown } from '../kernel/ledger.js';
export class ContinueScheduler {
    adapters;
    clock;
    rng;
    ledgerHub;
    backoff;
    limits;
    sessions = new Map();
    constructor(adapters, clock, rng, ledgerHub, backoff, limits) {
        this.adapters = adapters;
        this.clock = clock;
        this.rng = rng;
        this.ledgerHub = ledgerHub;
        this.backoff = backoff;
        this.limits = limits;
    }
    // ------------------------------------------------------------------
    // State transitions
    // ------------------------------------------------------------------
    beginTurn(sessionId) {
        this.cancelPending(sessionId); // host healed itself — cancel quietly
    }
    noteUserMessage(sessionId) {
        this.cancelPending(sessionId);
        this.ledgerHub.session(sessionId, this.backoff).noteUserMessage();
    }
    pauseSession(sessionId, durationMs) {
        const state = this.stateFor(sessionId);
        state.pausedUntil = this.clock.now() + durationMs;
        this.cancelPending(sessionId);
    }
    resumeSession(sessionId) {
        const state = this.sessions.get(sessionId);
        if (state)
            state.pausedUntil = 0;
    }
    /** Explicit human action — bypasses every gate except "agent exists". */
    resumeNow(sessionId, text) {
        return this.adapters.sendFollowup(sessionId, text, 'continue');
    }
    cancelPending(sessionId) {
        const state = this.sessions.get(sessionId);
        if (state?.pendingTimer) {
            state.pendingTimer.cancel();
            delete state.pendingTimer;
        }
    }
    closeSession(sessionId) {
        this.cancelPending(sessionId);
        this.sessions.delete(sessionId);
    }
    // ------------------------------------------------------------------
    // Scheduling
    // ------------------------------------------------------------------
    /**
     * Called after the detector decided a turn is resume-worthy.
     * Returns true when a grace timer was armed.
     */
    schedule(sessionId, template, buildText) {
        if (!this.gateLocal(sessionId)) {
            this.adapters.auditSkipped({ sessionId, reason: this.localSkipReason(sessionId) });
            return false;
        }
        const state = this.stateFor(sessionId);
        if (state.pendingTimer)
            return false; // one pending resume per session
        const timer = this.adapters.setTimeoutMs(() => {
            delete state.pendingTimer;
            this.fire(sessionId, template, buildText);
        }, this.limits.graceMs);
        state.pendingTimer = { cancel: timer, template };
        return true;
    }
    fire(sessionId, template, buildText) {
        // Second gate — identical checks, because the world changed during grace.
        if (!this.gateLocal(sessionId)) {
            this.adapters.auditSkipped({ sessionId, reason: this.localSkipReason(sessionId) });
            return;
        }
        const ledger = this.ledgerHub.session(sessionId, this.backoff);
        if (ledger.consecutive >= this.limits.maxConsecutive) {
            this.adapters.auditSkipped({ sessionId, reason: 'consecutive-limit' });
            return;
        }
        if (ledger.inCooldown(this.clock.now())) {
            this.adapters.auditSkipped({ sessionId, reason: 'cooldown' });
            return;
        }
        // Cross-module gates: coordinator may suppress or defer.
        const outcomes = this.adapters.requestResume(sessionId);
        const verdict = outcomes.find(o => o.status !== 'dispatched') ?? outcomes[0];
        if (verdict?.status === 'deferred') {
            // Re-arm shortly; do not burn cooldown for a deferred attempt.
            const retryAt = Math.min(60_000, this.limits.graceMs * 2);
            const state = this.stateFor(sessionId);
            const timer = this.adapters.setTimeoutMs(() => {
                delete state.pendingTimer;
                this.fire(sessionId, template, buildText);
            }, retryAt);
            state.pendingTimer = { cancel: timer, template };
            return;
        }
        if (verdict && verdict.status !== 'dispatched') {
            this.adapters.auditSkipped({ sessionId, reason: verdict.reason ?? 'paused' });
            return;
        }
        // Book BEFORE the side effect; failures consume the attempt too.
        const backoffApplied = ledger.beginAttempt(this.clock.now());
        const sent = this.adapters.sendFollowup(sessionId, buildText(), template);
        if (!sent) {
            this.adapters.auditSkipped({ sessionId, reason: 'no-agent' });
            return;
        }
        this.adapters.auditResumed({
            sessionId,
            attempt: ledger.consecutive,
            template,
            backoffMs: backoffApplied,
        });
    }
    /** Recovery bookkeeping after an assistant turn completes successfully. */
    noteRecoveredTurn(sessionId) {
        this.ledgerHub.session(sessionId, this.backoff).noteRecovery();
    }
    nextReadyIn(sessionId, loopGuard) {
        void loopGuard;
        const ledger = this.ledgerHub.session(sessionId, this.backoff);
        return effectiveCooldown(Math.max(0, ledger.consecutive - 1), this.backoff);
    }
    makeAttemptId() {
        return `att_${this.clock.now().toString(36)}_${this.rng.token()}`;
    }
    stateFor(sessionId) {
        let state = this.sessions.get(sessionId);
        if (!state) {
            state = { pausedUntil: 0 };
            this.sessions.set(sessionId, state);
        }
        return state;
    }
    gateLocal(sessionId) {
        const state = this.sessions.get(sessionId);
        if (state?.pausedUntil && this.clock.now() < state.pausedUntil)
            return false;
        if (state?.pendingTimer)
            return false;
        return true;
    }
    localSkipReason(sessionId) {
        const state = this.sessions.get(sessionId);
        if (state?.pausedUntil && this.clock.now() < state.pausedUntil) {
            return 'session-paused';
        }
        return 'cooldown';
    }
}
