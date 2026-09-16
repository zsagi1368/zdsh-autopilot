/**
 * Total-function treatment of failures.
 *
 * Every failure path in every module converges on the closed `FailureKind`
 * vocabulary and is mapped through ONE total table to a safe outcome. Nothing
 * may fall through implicitly: adding a FailureKind member breaks compilation
 * in every mapping table until it is handled.
 */
import type { FailureKind } from './types.js';
export declare function isFailureKind(value: unknown): value is FailureKind;
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
export declare function assertUnreachable(value: never, context?: string): never;
/**
 * Map a failure through a caller-supplied total table. The table type forces a
 * decision for every failure kind — there is no implicit fallback.
 */
export declare function toSafeOutcome<F>(kind: FailureKind, table: Record<FailureKind, F>): F;
/** Cancelled failures are user-driven and never burn failure budgets. */
export declare function isCancelled(kind: FailureKind): boolean;
/** Standard classification used by ledger accounting. */
export declare function countsAgainstFailureBudget(kind: FailureKind): boolean;
