/**
 * Resume text templates with placeholder filling and idempotency guardrails.
 *
 * The guardrail suffix depends on where the previous turn died: a tool whose
 * result never arrived gets "confirm first, do not redo", a tool that clearly
 * succeeded gets "already done, continue after it", and a failed tool gets NO
 * guardrail — retrying it is the whole point.
 */
export type TemplateKind = 'continue' | 'continue-max-tokens' | 'loop';
export interface TemplateContext {
    code?: string;
    message?: string;
    status?: string;
    tool?: string;
    turn?: string;
    elapsedMs?: number;
}
export type GuardToolState = 'pending' | 'done' | 'failed';
export interface GuardTexts {
    pending?: string;
    done?: string;
    failed?: string;
}
export declare function formatElapsed(ms: number): string;
export declare function fillTemplate(template: string, ctx: TemplateContext): string;
export declare function buildResumeText(args: {
    kind: TemplateKind;
    texts: {
        continue: string;
        continueMaxTokens: string;
        loop: string;
    };
    ctx: TemplateContext;
    guardState?: GuardToolState;
    guards: GuardTexts;
}): string;
