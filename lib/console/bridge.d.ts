/**
 * Console state port implementation + status bridge snapshot.
 *
 * The bridge is host-agnostic: the composition root registers HTTP routes and
 * delegates here. `authorizeAction` is the security boundary — cross-origin
 * or unauthenticated requests MUST be rejected by the adapter before reaching
 * performAction.
 */
import type { ModuleId } from '../kernel/types.js';
import type { ConsoleStatePort, PresetName } from './commands.js';
export declare const PRESET_PATCHES: Record<PresetName, Record<string, unknown>>;
export interface ConsoleDeps {
    kernel: import('../kernel/facade.js').Kernel;
    moduleEnabled(moduleId: ModuleId): boolean;
    setModuleEnabled(moduleId: ModuleId, enabled: boolean): void;
}
export declare class ConsoleState implements ConsoleStatePort {
    private readonly deps;
    private readonly recent;
    private latestDenial;
    paused: boolean;
    constructor(deps: ConsoleDeps);
    note(moduleId: ModuleId, summary: string): void;
    noteDenial(toolName: string, sessionId: string): void;
    status(): {
        paused: boolean;
        circuitOpen: boolean;
        modules: {
            continue: boolean;
            guard: boolean;
            review: boolean;
        };
        today: {
            sent: number;
            skipped: number;
            allowed: number;
            denied: number;
            reviewed: number;
        };
    };
    setModuleEnabled(moduleId: ModuleId, enabled: boolean): void;
    setPaused(paused: boolean): void;
    approveLatestDenial(): {
        ok: true;
        toolName: string;
    } | {
        ok: false;
    };
    applyPreset(name: PresetName): void;
    resetStats(): void;
    recentActions(): Array<{
        moduleId: ModuleId;
        summary: string;
    }>;
}
export type BridgeAction = {
    action: 'resume';
    sessionId?: string;
} | {
    action: 'pause1h';
    sessionId?: string;
} | {
    action: 'unpause';
    sessionId?: string;
} | {
    action: 'approve-latest';
} | {
    action: 'reset-stats';
};
export interface BridgeSnapshot {
    version: 1;
    paused: boolean;
    circuitOpen: boolean;
    modules: Record<ModuleId, boolean>;
    today: Record<string, number>;
    recent: Array<{
        moduleId: ModuleId;
        summary: string;
    }>;
}
/** Security gate — implement in the composition root with real origin checks. */
export type ActionAuthorizer = (payload: unknown) => boolean;
/** Minimal surface the action endpoint touches on console state. */
export interface BridgeStateTarget {
    setPaused(paused: boolean): void;
    resetStats(): void;
}
export declare function performBridgeAction(payload: unknown, state: BridgeStateTarget, authorize: ActionAuthorizer, hooks: {
    resumeSession(sessionId: string): void;
    pauseSession(sessionId: string, ms: number): void;
    approveLatest(): boolean;
}): {
    ok: boolean;
    error?: string;
};
