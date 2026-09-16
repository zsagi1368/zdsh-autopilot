/**
 * Kernel facade — THE frozen boundary between the kernel and capability
 * modules.
 *
 * Facade rule (CI-enforced): modules under src/{continue,guard,review,console}
 * may import ONLY this file's exports and their own directory. The kernel
 * never imports upward.
 */
import { AutomationCoordinator } from './coordinator.js';
import { LedgerHub, StatsCounters, createTokenSource } from './ledger.js';
import { ProbeRegistry } from './probes.js';
import { DEFAULTS, resolveConfig } from './defaults.js';
export function createKernel(ports = {}) {
    const clock = ports.clock ?? { now: () => Date.now() };
    const rng = ports.rng ?? createTokenSource();
    let resolved = resolveConfig(DEFAULTS, {});
    const stats = new StatsCounters(clock, ports.statsPersistence?.load());
    const ledger = new LedgerHub(stats);
    const probes = new ProbeRegistry();
    const coordinator = new AutomationCoordinator();
    return {
        coordinator,
        ledger,
        probes,
        clock,
        rng,
        config: () => resolved,
        setConfig(userPatch) {
            resolved = resolveConfig(DEFAULTS, userPatch);
            return resolved;
        },
    };
}
export function defaultBackoffParams(resolved) {
    return {
        baseMs: resolved.continue.cooldownMs,
        factor: resolved.continue.backoffFactor,
        capMs: resolved.continue.backoffCapMs,
    };
}
export function moduleEnabled(resolved, moduleId) {
    switch (moduleId) {
        case 'continue':
            return resolved.continue.enabled;
        case 'guard':
            return resolved.guard.enabled;
        case 'review':
            return resolved.review.enabled;
        default:
            return false;
    }
}
