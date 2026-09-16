/**
 * Single source of truth for every configuration default.
 *
 * The settings schema, the README tables, and the deployment-level
 * `cordis.patch.yml` config block are all derived from (or validated against)
 * this tree. Nothing elsewhere in the codebase may hardcode a default value.
 */
export const DEFAULTS = {
    global: {
        paused: false,
        statsPersistence: true,
    },
    continue: {
        enabled: true,
        graceMs: 3000,
        cooldownMs: 20_000,
        maxConsecutive: 3,
        backoffFactor: 2,
        backoffCapMs: 300_000,
        scanOnBoot: true,
        scanLimit: 8,
        scanWindowMs: 15 * 60_000,
        classifyErrors: true,
    },
    guard: {
        enabled: true,
        classifierTimeoutMs: 30_000,
        classifyFailDenyStreak: 2,
        snapshotPathLimit: 50_000,
    },
    review: {
        enabled: true,
        maxReviewsPerTurn: 10,
        maxFailuresPerTurn: '=maxReviews',
        fallbackPolicy: 'rejected',
        circuit: {
            consecutiveDenials: 3,
            windowSize: 10,
            windowDenials: 6,
            action: 'delegate',
        },
        overrideTtlMs: 300_000,
        reasonMaxChars: 2000,
        reviewerTimeoutMs: 60_000,
    },
};
/**
 * Numeric clamps applied after merging user config. Paths are dotted into the
 * defaults tree; anything out of range is pulled back inside.
 */
const CLAMPS = {
    'continue.graceMs': { min: 0, max: 60_000 },
    'continue.cooldownMs': { min: 0, max: 3_600_000 },
    'continue.maxConsecutive': { min: 1 },
    'continue.backoffFactor': { min: 1 },
    'continue.backoffCapMs': { min: 1_000 },
    'continue.scanLimit': { min: 1, max: 100 },
    'continue.scanWindowMs': { min: 1_000 },
    'guard.classifierTimeoutMs': { min: 100, max: 60_000 },
    'guard.classifyFailDenyStreak': { min: 1, max: 10 },
    'guard.snapshotPathLimit': { min: 1_000, max: 500_000 },
    'review.maxReviewsPerTurn': { min: 1, max: 1_000 },
    'review.overrideTtlMs': { min: 1_000 },
    'review.reasonMaxChars': { min: 100, max: 16_000 },
    'review.reviewerTimeoutMs': { min: 1_000, max: 600_000 },
    'review.circuit.consecutiveDenials': { min: 1 },
    'review.circuit.windowSize': { min: 2 },
    'review.circuit.windowDenials': { min: 1 },
};
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function clampNumber(path, value) {
    const clamp = CLAMPS[path];
    if (!clamp)
        return value;
    let out = value;
    if (clamp.min !== undefined && out < clamp.min)
        out = clamp.min;
    if (clamp.max !== undefined && out > clamp.max)
        out = clamp.max;
    return out;
}
/** Deep-merge one level of user patch over a base section, clamping numbers. */
function mergeSection(path, base, patch) {
    const out = { ...base };
    if (!patch)
        return out;
    for (const [key, value] of Object.entries(patch)) {
        if (!(key in base))
            continue; // unknown keys ignored
        const current = base[key];
        const fullPath = [...path, key].join('.');
        if (isPlainObject(current) && isPlainObject(value)) {
            out[key] = mergeSection(fullPath.split('.'), current, value);
        }
        else if (typeof current === 'number' && typeof value === 'number') {
            out[key] = clampNumber(fullPath, value);
        }
        else if (typeof current === typeof value) {
            out[key] = value;
        }
        // Type mismatches keep the default (fail-soft); callers may layer a
        // fail-loud wire validation on top when wiring the settings service.
    }
    return out;
}
/**
 * Deep-merge user config over defaults (objects merge, arrays and scalars
 * replace), then apply numeric clamps and resolve the '=maxReviews' sentinel.
 * Unknown user keys are ignored — the defaults tree is the schema of record.
 */
export function resolveConfig(defaults = DEFAULTS, user = {}) {
    const merged = mergeSection([], defaults, user);
    const maxReviews = merged.review.maxReviewsPerTurn;
    const maxFailures = merged.review.maxFailuresPerTurn === '=maxReviews'
        ? maxReviews
        : merged.review.maxFailuresPerTurn;
    return {
        global: merged.global,
        continue: merged.continue,
        guard: merged.guard,
        review: { ...merged.review, maxFailuresPerTurn: Math.max(0, maxFailures) },
    };
}
/** Walk every leaf of the defaults tree with its dotted path (schema derivation helper). */
export function walkDefaults(tree, visit, prefix = '') {
    if (!isPlainObject(tree))
        return;
    for (const [key, value] of Object.entries(tree)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (isPlainObject(value))
            walkDefaults(value, visit, path);
        else
            visit(path, value);
    }
}
