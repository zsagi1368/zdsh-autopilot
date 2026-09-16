import type { Kernel } from '../kernel/facade.js';
import type { FailureInfo } from './detector.js';
import type { LoopGuardThresholds } from './loopguard.js';
import type { SchedulerAdapters } from './scheduler.js';
export declare const DEFAULT_TEXTS: {
    readonly continue: 'Continue';
    readonly continueMaxTokens: 'Continue';
    readonly loop: 'You appear stuck in a loop ({tool}). Change approach or ask me.';
    readonly guardPending: 'Note: the previous {tool} call may not have finished — check its result before redoing it.';
    readonly guardDone: 'Note: the previous {tool} call already completed successfully — do NOT redo it, continue from its result.';
};
export interface ContinueTexts {
    continue: string;
    continueMaxTokens: string;
    loop: string;
    guardPending?: string;
    guardDone?: string;
}
export interface ContinueModuleAdapters extends SchedulerAdapters {
    /** Feed assistant/tool activity into the loop guard (host event adapter). */
    listActiveSessionIds(): string[];
    getLastTurn(sessionId: string): {
        reason: string;
        endedAt: number;
        failure?: FailureInfo;
        lastTool?: {
            name: string;
            state: 'pending' | 'done' | 'failed';
        };
    } | undefined;
}
export interface CreateContinueModuleDeps {
    kernel: Kernel;
    options: {
        enabled: boolean;
        graceMs: number;
        cooldownMs: number;
        maxConsecutive: number;
        backoffFactor: number;
        backoffCapMs: number;
        scanOnBoot: boolean;
        scanLimit: number;
        scanWindowMs: number;
        classifyErrors: boolean;
        loopGuard?: Partial<LoopGuardThresholds>;
        texts?: Partial<ContinueTexts>;
    };
    adapters: ContinueModuleAdapters;
}
export interface ContinueModule {
    handleTurnStart(sessionId: string): void;
    handleTurnEnd(sessionId: string, reason: 'completed' | 'error' | 'max-tokens' | 'aborted' | 'blocked', failure?: FailureInfo): void;
    handleUserMessage(sessionId: string): void;
    handleAssistantMessage(sessionId: string, text: string): void;
    handleToolCall(sessionId: string, toolName: string, argsJson: string): void;
    noteRecoveredTurn(sessionId: string): void;
    handleToolResult(sessionId: string, toolName: string, argsJson: string, resultJson: string, isError: boolean): void;
    bootScan(): void;
    pauseSession(sessionId: string, durationMs?: number): void;
    resumeSession(sessionId: string): void;
    resumeNow(sessionId: string): boolean;
}
export declare function createContinueModule(deps: CreateContinueModuleDeps): ContinueModule & {
    disposable: true;
};
