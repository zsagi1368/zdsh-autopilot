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
    /**
     * The host cordis fiber effect face (`ctx.effect(setup, label?)`): `setup`
     * runs IMMEDIATELY and its return value is the disposer collected for fiber
     * unload (lib/types/fiber.d.ts `effect(execute: () => SyncEffect, label?)`).
     * RA1d (B3): route disposers returned by `webServer.register` MUST flow
     * through this seam — apply's return object is dropped by the cordis
     * constructor path, so a bare stored disposer would never run on unload.
     * Optional: plain-object contexts (unit tests, bare hosts) carry no
     * `effect`; the register return is also captured on the mounted runtime's
     * dispose for direct-call consumers (FileHub aab73d7 form).
     */
    effect?(setup: () => (() => void) | Iterable<() => void>, label?: string): unknown;
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
