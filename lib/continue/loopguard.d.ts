/**
 * Loop guard: detects idle-loop spinning and interrupts with a restart prompt.
 *
 * Three complementary signals — "change is progress" is the reset rule:
 *  - same full assistant text repeated N times (strongest)
 *  - short sentences without any tool activity within a time window
 *  - same tool + same arguments + same RESULT repeated N times
 *
 * Defaults are deliberately conservative: interrupting real work costs more
 * than missing one loop for another turn.
 */
import type { LoopSignal } from '../kernel/types.js';
export interface LoopGuardThresholds {
    sameTextCount: number;
    shortChars: number;
    shortCount: number;
    shortWindowMs: number;
    toolRepeatCount: number;
}
export declare const LOOP_GUARD_DEFAULTS: LoopGuardThresholds;
export declare class LoopGuard {
    private readonly thresholds;
    private readonly now;
    private lastText;
    private sameTextRuns;
    /** Timestamps of recent short, tool-free assistant messages. */
    private shortRuns;
    private toolRuns;
    private firedThisTurn;
    constructor(thresholds?: LoopGuardThresholds, now?: () => number);
    beginTurn(): void;
    feedAssistant(text: string): void;
    /**
     * Feed a completed tool call. Changed arguments OR changed result reset that
     * tool's streak and the short-run window (something moved → progress).
     */
    feedTool(name: string, argsJson: string, resultJson: string): void;
    /** Signals currently over their thresholds (empty array when healthy). */
    trippedSignals(): LoopSignal[];
    /** At most ONE interrupt per turn; callers must check before cancelling. */
    shouldInterrupt(): boolean;
    markFired(): void;
}
