/**
 * Review module — second-model approval review on the approval waterfall.
 *
 * Claim conjunction (ALL must hold, else pass through with next()):
 *   not a reviewer's own ask ∧ session enabled ∧ policy=ai
 *   ∧ decision budget available ∧ circuit not tripped ∧ audit correlation ok.
 *
 * Failure total-function: any reviewer failure converges on the closed
 * FailureKind vocabulary and maps through fallbackPolicy (default rejected).
 * Cancellation settles as cancelled and burns NO failure budget.
 */
import type { Kernel } from '../kernel/facade.js';
import type { AuditEvent } from '../kernel/types.js';
import type { CircuitConfig } from './circuit.js';
import type { ToolPolicy } from './reviewer.js';
export interface ReviewAdapters {
    /** Session-level enablement (fold of ap/state events). */
    sessionEnabled(sessionId: string): boolean;
    /** Audit correlation: was there an unanswered approval/asked for this call? */
    hasPendingApprovalAsked(callId: string): boolean;
    /** Start the read-only reviewer subagent. Resolves raw structured output. */
    runReviewer(prompt: string): Promise<{
        output: unknown;
        stopReason?: string;
        model?: string;
        durationMs: number;
    }>;
    /** Register this callId as belonging to a reviewer-spawned session (recursion guard input). */
    markReviewerSession(sessionId: string): void;
    unmarkReviewerSession(sessionId: string): void;
    isReviewerSession(agentSessionId: string): boolean;
    /** Inject replacement text into an isError tool result. */
    injectToolResultText(callId: string, text: string): void;
    appendAudit(event: AuditEvent): void;
}
export interface CreateReviewModuleDeps {
    kernel: Kernel;
    options: {
        enabled: boolean;
        maxReviewsPerTurn: number;
        maxFailuresPerTurn: number;
        fallbackPolicy: 'rejected' | 'delegate' | 'allow-once';
        circuit: CircuitConfig;
        overrideTtlMs: number;
        reasonMaxChars: number;
        reviewerTimeoutMs: number;
        riskRules?: Array<{
            pattern: string;
            policy: ToolPolicy;
        }>;
        overrides?: Record<string, ToolPolicy>;
        defaultPolicy?: ToolPolicy;
    };
    adapters: ReviewAdapters;
}
export interface ApprovalRequestLike2 {
    sessionId: string;
    agentSessionId: string;
    callId: string;
    toolName: string;
    reason: string;
    turnId: string;
}
export type ReviewOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable' | 'delegate';
export declare function createReviewModule(deps: CreateReviewModuleDeps): {
    disposable: true;
    handleApprovalRequest: (request: ApprovalRequestLike2) => Promise<ReviewOutcome>;
    approveNext: (toolName: string) => string;
    consumeFeedback: (callId: string, isError: boolean) => string | undefined;
    circuitState: () => import("./circuit.js").CircuitState;
    resetCircuit: () => void;
};
