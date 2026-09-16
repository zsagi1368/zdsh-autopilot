export const LOOP_GUARD_DEFAULTS = {
    sameTextCount: 4,
    shortChars: 40,
    shortCount: 12,
    shortWindowMs: 30_000,
    toolRepeatCount: 5,
};
function digest(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++)
        h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return String(h);
}
export class LoopGuard {
    thresholds;
    now;
    lastText = '';
    sameTextRuns = 0;
    /** Timestamps of recent short, tool-free assistant messages. */
    shortRuns = [];
    toolRuns = new Map();
    firedThisTurn = false;
    constructor(thresholds = LOOP_GUARD_DEFAULTS, now = () => Date.now()) {
        this.thresholds = thresholds;
        this.now = now;
    }
    beginTurn() {
        this.firedThisTurn = false;
        this.shortRuns = [];
        // Text and tool streaks persist across turns on purpose: a loop often
        // spans turn boundaries after an auto-resume.
    }
    feedAssistant(text) {
        if (text === this.lastText) {
            this.sameTextRuns += 1;
        }
        else {
            this.lastText = text;
            this.sameTextRuns = 1;
        }
        if (text.length <= this.thresholds.shortChars) {
            const now = this.now();
            this.shortRuns.push(now);
            this.shortRuns = this.shortRuns.filter(t => now - t <= this.thresholds.shortWindowMs);
        }
    }
    /**
     * Feed a completed tool call. Changed arguments OR changed result reset that
     * tool's streak and the short-run window (something moved → progress).
     */
    feedTool(name, argsJson, resultJson) {
        const key = `${name}#${digest(argsJson)}`;
        const resultKey = digest(resultJson);
        const record = this.toolRuns.get(key);
        const at = this.now();
        if (!record || record.lastResultDigest !== resultKey) {
            this.toolRuns.set(key, { count: 1, lastResultDigest: resultKey, lastAt: at });
            this.shortRuns = [];
        }
        else {
            record.count += 1;
            record.lastAt = at;
        }
    }
    /** Signals currently over their thresholds (empty array when healthy). */
    trippedSignals() {
        const signals = [];
        if (this.sameTextRuns >= this.thresholds.sameTextCount)
            signals.push('same-text');
        if (this.shortRuns.length >= this.thresholds.shortCount)
            signals.push('short-run');
        for (const record of this.toolRuns.values()) {
            if (record.count >= this.thresholds.toolRepeatCount) {
                signals.push('tool-repeat');
                break;
            }
        }
        return signals;
    }
    /** At most ONE interrupt per turn; callers must check before cancelling. */
    shouldInterrupt() {
        return !this.firedThisTurn && this.trippedSignals().length > 0;
    }
    markFired() {
        this.firedThisTurn = true;
    }
}
