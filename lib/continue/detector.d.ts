/**
 * Interruption detector: decides whether a turn ending is worth auto-resuming.
 *
 * Two layers:
 *  1. End-reason whitelist — only `error` and `max-tokens` are acted on live;
 *     `aborted` (user stop) and `blocked` (policy denial) NEVER resume;
 *     `interrupted` is written only by crash recovery at host reload, so it is
 *     claimed exclusively by the startup scan.
 *  2. Error classifier — a configurable pattern corpus separates permanent
 *     failures (auth/quota/model/context/invalid-request families) from
 *     transient ones. Unknown errors default to transient (resume attempt),
 *     because a skipped recovery is a lost turn while an extra prompt is cheap.
 */
export type LiveEndReason = 'completed' | 'error' | 'max-tokens' | 'aborted' | 'blocked';
/** Reasons that may ever be resumed live. `interrupted` belongs to boot scan only. */
export type ResumeEligibleReason = 'error' | 'max-tokens' | 'interrupted-boot-scan';
export interface FailureInfo {
    code?: string;
    status?: number;
    message?: string;
}
export interface ClassifyPattern {
    /** Human-readable family name for audits and notifications. */
    family: string;
    re: RegExp;
}
/** Built-in baseline corpus; extendable via configuration later (M5 settings). */
export declare const PERMANENT_FAILURE_PATTERNS: readonly ClassifyPattern[];
export declare const TRANSIENT_HINT_PATTERNS: readonly RegExp[];
export interface DetectionOutcome {
    action: 'schedule-resume' | 'skip';
    /** Populated when skipping: why this turn will not be resumed. */
    skipReason?: 'permanent-failure' | 'not-eligible';
    family?: string;
}
export declare function detectLive(reason: LiveEndReason, failure: FailureInfo | undefined, options: {
    classifyErrors: boolean;
}): DetectionOutcome;
/** Boot-scan variant: `interrupted` becomes eligible here. */
export declare function detectBootScan(reason: LiveEndReason | 'interrupted', failure: FailureInfo | undefined, options: {
    classifyErrors: boolean;
}): DetectionOutcome;
