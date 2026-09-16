export interface ReviewRequestContext {
    sessionId: string;
    toolName: string;
    callId: string;
    /** Caller (the requesting agent) self-description of the action. Evidence only. */
    approvalReason: string;
    args: unknown;
    riskRules: Array<{
        pattern: string;
        policy: string;
    }>;
    /** Compact transcript lines (already truncated by the caller). */
    transcript?: string[];
    /** Human one-shot override context for this tool, if present. */
    humanOverrideId?: string;
}
export interface ReviewVerdict {
    decision: 'allow' | 'deny';
    reason: string;
    riskLevel: 'low' | 'medium' | 'high';
}
export declare function buildReviewPrompt(ctx: ReviewRequestContext): string;
/** Boundary narrowing over whatever the provider produced. */
export declare function parseVerdict(raw: unknown, stopReason?: string): ReviewVerdict;
export type ToolPolicy = 'ai' | 'human' | 'never';
export interface RiskRule {
    pattern: RegExp;
    policy: ToolPolicy;
}
/**
 * First matching rule wins; rules are evaluated against the reason text by
 * default. Overrides then defaults fill the rest.
 */
export declare function resolvePolicy(toolName: string, reason: string, rules: RiskRule[], overrides: Record<string, ToolPolicy>, fallbackDefault: ToolPolicy): ToolPolicy;
