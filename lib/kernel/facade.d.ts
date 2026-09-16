/**
 * Kernel facade — THE frozen boundary between the kernel and capability
 * modules.
 *
 * Facade rule (CI-enforced): modules under src/{continue,guard,review,console}
 * may import ONLY this file's exports and their own directory. The kernel
 * never imports upward.
 */
import { AutomationCoordinator } from './coordinator.js';
import { LedgerHub } from './ledger.js';
import type { BackoffParams, Clock, RandomSource, StatsPersistence } from './ledger.js';
import { ProbeRegistry } from './probes.js';
import type { ResolvedDefaults } from './defaults.js';
import type { ModuleId } from './types.js';
export interface KernelPorts {
    clock?: Clock;
    rng?: RandomSource;
    /** Optional synchronous snapshot persistence for stats. */
    statsPersistence?: StatsPersistence;
}
export interface Kernel {
    readonly coordinator: AutomationCoordinator;
    readonly ledger: LedgerHub;
    readonly probes: ProbeRegistry;
    readonly clock: Clock;
    readonly rng: RandomSource;
    /** Current resolved configuration (re-resolved on setConfig). */
    config(): ResolvedDefaults;
    setConfig(userPatch: Record<string, unknown>): ResolvedDefaults;
}
export interface Disposable {
    dispose(): void;
}
export type ContinueOptions = ResolvedDefaults['continue'];
export type GuardOptions = ResolvedDefaults['guard'];
export type ReviewOptions = ResolvedDefaults['review'];
export type ContinueModuleStarter = (kernel: Kernel, options: ContinueOptions) => Disposable;
export type GuardModuleStarter = (kernel: Kernel, options: GuardOptions) => Disposable;
export type ReviewModuleStarter = (kernel: Kernel, options: ReviewOptions) => Disposable;
/** Modules mounted by the composition root, keyed for lifecycle control. */
export interface MountedModules {
    continue?: Disposable;
    guard?: Disposable;
    review?: Disposable;
}
export declare function createKernel(ports?: KernelPorts): Kernel;
export declare function defaultBackoffParams(resolved: ResolvedDefaults): BackoffParams;
export declare function moduleEnabled(resolved: ResolvedDefaults, moduleId: ModuleId): boolean;
