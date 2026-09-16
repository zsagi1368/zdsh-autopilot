// ---------------------------------------------------------------------------
// Presets (named config sets applied over user settings)
// ---------------------------------------------------------------------------
export const PRESET_PATCHES = {
    conservative: {
        continue: { enabled: false },
        guard: { enabled: true, classifyFailDenyStreak: 1 },
        review: {
            enabled: true,
            fallbackPolicy: 'delegate',
            circuit: { consecutiveDenials: 3, windowSize: 10, windowDenials: 6, action: 'delegate' },
        },
    },
    standard: {
        continue: { enabled: true },
        guard: { enabled: true },
        review: { enabled: true, fallbackPolicy: 'rejected' },
    },
    fullspeed: {
        continue: { enabled: true, cooldownMs: 10_000, maxConsecutive: 5 },
        guard: { enabled: true, classifyFailDenyStreak: 3 },
        review: { enabled: true, maxReviewsPerTurn: 20, fallbackPolicy: 'rejected' },
    },
};
const RECENT_CAP = 8;
export class ConsoleState {
    deps;
    recent = [];
    latestDenial;
    paused = false;
    constructor(deps) {
        this.deps = deps;
    }
    note(moduleId, summary) {
        this.recent.push({ at: this.deps.kernel.clock.now(), moduleId, summary });
        if (this.recent.length > RECENT_CAP)
            this.recent.shift();
    }
    noteDenial(toolName, sessionId) {
        this.latestDenial = { toolName, sessionId, at: this.deps.kernel.clock.now() };
        this.note('review', `denied ${toolName}`);
    }
    status() {
        const stats = this.deps.kernel.ledger.statsCounters;
        const coordinator = this.deps.kernel.coordinator;
        return {
            paused: coordinator.paused,
            circuitOpen: coordinator.circuitOpen,
            modules: {
                continue: this.deps.moduleEnabled('continue'),
                guard: this.deps.moduleEnabled('guard'),
                review: this.deps.moduleEnabled('review'),
            },
            today: {
                sent: stats.get('sent', 'today'),
                skipped: stats.get('skipped', 'today'),
                allowed: stats.get('allowed', 'today'),
                denied: stats.get('denied', 'today'),
                reviewed: stats.get('reviewed', 'today'),
            },
        };
    }
    setModuleEnabled(moduleId, enabled) {
        this.deps.setModuleEnabled(moduleId, enabled);
    }
    setPaused(paused) {
        this.paused = paused;
        this.deps.kernel.coordinator.dispatch({ kind: 'pause-change', paused });
    }
    approveLatestDenial() {
        if (!this.latestDenial)
            return { ok: false };
        const tool = this.latestDenial.toolName;
        void tool;
        // Actual approval bridging is performed by the review module's
        // approveNext via the composition-root closure; here we only validate.
        return { ok: true, toolName: this.latestDenial.toolName };
    }
    applyPreset(name) {
        this.deps.kernel.setConfig(PRESET_PATCHES[name]);
        for (const m of ['continue', 'guard', 'review']) {
            this.deps.setModuleEnabled(m, this.deps.moduleEnabled(m));
        }
    }
    resetStats() {
        this.deps.kernel.ledger.statsCounters.reset();
    }
    recentActions() {
        return this.recent.map(r => ({ moduleId: r.moduleId, summary: r.summary }));
    }
}
export function performBridgeAction(payload, state, authorize, hooks) {
    if (!authorize(payload))
        return { ok: false, error: 'unauthorized' };
    const MAX_BODY_CHARS = 4096;
    if (typeof payload === 'string' && payload.length > MAX_BODY_CHARS) {
        return { ok: false, error: 'payload too large' };
    }
    let parsed;
    try {
        parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    }
    catch {
        return { ok: false, error: 'bad json' };
    }
    switch (parsed.action) {
        case 'resume':
            if (parsed.sessionId)
                hooks.resumeSession(parsed.sessionId);
            state.setPaused(false);
            return { ok: true };
        case 'unpause':
            state.setPaused(false);
            return { ok: true };
        case 'pause1h':
            state.setPaused(true);
            if (parsed.sessionId)
                hooks.pauseSession(parsed.sessionId, 3_600_000);
            return { ok: true };
        case 'approve-latest':
            return { ok: hooks.approveLatest() };
        case 'reset-stats':
            state.resetStats();
            return { ok: true };
        default:
            return { ok: false, error: 'unknown action' };
    }
}
