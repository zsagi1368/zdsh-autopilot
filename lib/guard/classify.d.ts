import type { FailureKind } from '../kernel/types.js';
export interface ClassifierInput {
    sessionId: string;
    toolName: string;
    /** Already-redacted arguments (the module redacts before calling). */
    argsRedacted: unknown;
    /** Pre-execution facts, e.g. existedBefore per target path. */
    facts: Record<string, boolean | string>;
    /** Direct human messages, newest first, already truncated. */
    directHumanMessages: string[];
    sandboxRequest?: {
        level: string;
        justification: string;
    };
}
export interface ClassifierVerdict {
    decision: 'allow' | 'ask' | 'deny';
    reason: string;
}
export type ClassifierTransport = (input: ClassifierInput) => Promise<unknown>;
export declare function buildClassifierInput(raw: {
    sessionId: string;
    toolName: string;
    args: unknown;
    facts: Record<string, boolean | string>;
    directHumanMessages: string[];
    sandboxRequest?: ClassifierInput['sandboxRequest'];
}): ClassifierInput;
/**
 * Strict output protocol: exactly two keys, decision in the closed enum,
 * non-empty reason ≤1000 chars. Anything else throws → caller fail-closes.
 */
export declare function parseClassifierOutput(raw: unknown): ClassifierVerdict;
export type LadderAction = 'deny' | 'ask';
/**
 * deny×(N-1) then ask on the Nth consecutive failure; success resets; user
 * cancellation never advances the ladder.
 */
export declare class FailureLadder {
    private readonly denyStreak;
    private streak;
    constructor(denyStreak: number);
    recordFailure(kind: FailureKind): void;
    recordSuccess(): void;
    nextAction(): LadderAction;
    get currentStreak(): number;
}
