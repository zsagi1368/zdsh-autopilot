const FAILURE_KINDS = [
    'timeout',
    'cancelled',
    'unavailable',
    'schema',
    'budget',
    'circuit-open',
];
export function isFailureKind(value) {
    return typeof value === 'string' && FAILURE_KINDS.includes(value);
}
/**
 * Exhaustiveness helper. Call inside a `default:` branch:
 *
 * ```ts
 * default: return assertUnreachable(kind);
 * ```
 *
 * If a new FailureKind member appears, every switch using this fails to
 * compile until handled.
 */
export function assertUnreachable(value, context = 'value') {
    throw new Error(`internal: unhandled ${context} ${JSON.stringify(String(value))}`);
}
/**
 * Map a failure through a caller-supplied total table. The table type forces a
 * decision for every failure kind — there is no implicit fallback.
 */
export function toSafeOutcome(kind, table) {
    return table[kind];
}
/** Cancelled failures are user-driven and never burn failure budgets. */
export function isCancelled(kind) {
    return kind === 'cancelled';
}
/** Standard classification used by ledger accounting. */
export function countsAgainstFailureBudget(kind) {
    return !isCancelled(kind);
}
