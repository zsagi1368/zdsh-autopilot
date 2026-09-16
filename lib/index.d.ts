import type { Kernel } from './kernel/facade.js';
import { ConsoleState } from './console/bridge.js';
export declare const name = "@deepseek-ai/dsh-autopilot";
export declare const inject: readonly string[];
/** Narrow structural view of the host context we need. All optional. */
export interface AutopilotHostContext {
    get?(key: string): unknown;
    on?(event: string, listener: (...args: never[]) => unknown, options?: {
        prepend?: boolean;
    }): () => void;
}
export interface MountedRuntime {
    kernel: Kernel;
    consoleState: ConsoleState;
    dispose(): void;
}
/** Test/inspection hook: the runtime mounted for a given host context. */
export declare function runtimeFor(ctx: object): MountedRuntime | undefined;
export declare function apply(ctx: AutopilotHostContext): void;
/** In-memory audit mirror until the session-log adapter lands (M5 finisher). */
export declare const memoryAuditMirror: Array<{
    name: string;
    at: number;
    data: Record<string, unknown>;
}>;
