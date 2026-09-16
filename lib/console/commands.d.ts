/**
 * `/ap` command surface: parsing and execution against a console-state port.
 * Pure logic — the host command registry adapter lives in the composition root.
 */
import type { ModuleId } from '../kernel/types.js';
export interface ConsoleStatePort {
    status(): {
        paused: boolean;
        circuitOpen: boolean;
        modules: Record<ModuleId, boolean>;
        today: Record<string, number>;
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
}
export type PresetName = 'conservative' | 'standard' | 'fullspeed';
export interface CommandResult {
    /** Lines to print back to the user. */
    lines: string[];
}
export declare function executeCommand(input: string, state: ConsoleStatePort, t: (key: string, params?: Record<string, string>) => string): CommandResult;
