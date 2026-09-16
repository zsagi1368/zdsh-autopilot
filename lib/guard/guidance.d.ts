/**
 * Policy-sourced agent guidance.
 *
 * When Auto mode is active we do not just enforce rules silently — we inject
 * a dynamic system-prompt section teaching the agent how to live inside the
 * policy (split risky calls into visible literals, prefer reversible ops,
 * route sub-agent escalation requests upward). Compliance becomes
 * collaboration instead of adversarial whack-a-mole.
 */
export declare function buildGuidanceText(): string;
