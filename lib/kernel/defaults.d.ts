/**
 * Single source of truth for every configuration default.
 *
 * The settings schema, the README tables, and the deployment-level
 * `cordis.patch.yml` config block are all derived from (or validated against)
 * this tree. Nothing elsewhere in the codebase may hardcode a default value.
 */
export interface GlobalDefaults {
    paused: boolean;
    statsPersistence: boolean;
}
export interface ContinueDefaults {
    enabled: boolean;
    /** Grace period before an auto-resume fires; a self-healing turn cancels it. */
    graceMs: number;
    /** Per-session base cooldown between auto-resumes. Failed attempts count. */
    cooldownMs: number;
    /** Consecutive auto-resume limit before giving up until recovery. */
    maxConsecutive: number;
    backoffFactor: number;
    backoffCapMs: number;
    scanOnBoot: boolean;
    scanLimit: number;
    scanWindowMs: number;
    classifyErrors: boolean;
}
export interface GuardDefaults {
    enabled: boolean;
    classifierTimeoutMs: number;
    /** Classifier failures denied before the next failure escalates to a human ask. */
    classifyFailDenyStreak: number;
    /** Upper bound for workspace snapshot walks (falls back to shallow mode beyond). */
    snapshotPathLimit: number;
}
/** Sentinel: resolve to the same value as `maxReviewsPerTurn`. */
export type SameAsMaxReviews = '=maxReviews';
export interface ReviewDefaults {
    enabled: boolean;
    maxReviewsPerTurn: number;
    maxFailuresPerTurn: number | SameAsMaxReviews;
    fallbackPolicy: 'rejected' | 'delegate' | 'allow-once';
    circuit: {
        consecutiveDenials: number;
        windowSize: number;
        windowDenials: number;
        action: 'delegate' | 'reject' | 'abort-turn';
    };
    overrideTtlMs: number;
    reasonMaxChars: number;
    reviewerTimeoutMs: number;
}
export interface DefaultsTree {
    global: GlobalDefaults;
    continue: ContinueDefaults;
    guard: GuardDefaults;
    review: ReviewDefaults;
}
export declare const DEFAULTS: DefaultsTree;
export interface ResolvedDefaults {
    global: GlobalDefaults;
    continue: ContinueDefaults;
    guard: GuardDefaults;
    /** Like ReviewDefaults but with the budget sentinel resolved to a number. */
    review: Omit<ReviewDefaults, 'maxFailuresPerTurn'> & {
        maxFailuresPerTurn: number;
    };
}
/**
 * Deep-merge user config over defaults (objects merge, arrays and scalars
 * replace), then apply numeric clamps and resolve the '=maxReviews' sentinel.
 * Unknown user keys are ignored — the defaults tree is the schema of record.
 */
export declare function resolveConfig(defaults?: DefaultsTree, user?: Record<string, unknown>): ResolvedDefaults;
/** Walk every leaf of the defaults tree with its dotted path (schema derivation helper). */
export declare function walkDefaults(tree: unknown, visit: (path: string, value: unknown) => void, prefix?: string): void;
