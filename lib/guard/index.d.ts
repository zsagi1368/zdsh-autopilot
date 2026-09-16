/**
 * Guard module assembly — the four-level monotonic decision stack.
 *
 * Layer order and override rules (frozen):
 *   fuse (sync, cannot be overridden by anything below)
 *   → deterministic rules (shell lexer / tool policy)
 *   → LLM classifier over redacted inputs with a failure ladder
 *   → official human approval (single popup; one-shot grants bridge it)
 */
import { SessionArtifacts } from './artifacts.js';
import type { FsProbePort } from './artifacts.js';
import type { ClassifierTransport } from './classify.js';
import { buildGuidanceText } from './guidance.js';
export interface GuardAdapters {
    workspaceRoot(): string;
    homePath(): string;
    dshHomePath(): string;
    fsProbe(): FsProbePort;
    classifierTransport(): ClassifierTransport | undefined;
    provideDirectUserMessages(sessionId: string): string[];
    humanAsk(request: {
        sessionId: string;
        toolName: string;
        reason: string;
    }): Promise<'allowed-once' | 'rejected' | 'cancelled'>;
    appendAudit(event: {
        name: string;
        data: Record<string, unknown>;
    }): void;
    isAutoSession(sessionId: string): boolean;
}
export interface CreateGuardModuleDeps {
    kernel: import('../kernel/facade.js').Kernel;
    options: {
        enabled: boolean;
        classifierTimeoutMs: number;
        classifyFailDenyStreak: number;
        snapshotPathLimit: number;
    };
    adapters: GuardAdapters;
}
export interface PreToolExec {
    sessionId: string;
    callId: string;
    toolName: string;
    argsJson: string;
    /** Shell calls carry their dialect so the right lexer runs. */
    shell?: 'bash' | 'pwsh';
}
export interface PreToolDecision {
    decision: 'allow' | 'deny' | 'ask' | 'delegate-to-official';
    reason: string;
}
export declare function createGuardModule(deps: CreateGuardModuleDeps): {
    disposable: true;
    artifacts: SessionArtifacts;
    guidanceText: typeof buildGuidanceText;
    handlePreToolUse: (exec: PreToolExec) => Promise<PreToolDecision>;
    handleApprovalRequest: (request: ApprovalRequestLike) => 'allowed-once' | undefined;
    handleToolResult: (exec: {
        callId: string;
    }, ok: boolean, createdPaths: string[]) => void;
};
interface ApprovalRequestLike {
    callId: string;
    toolName: string;
}
export {};
