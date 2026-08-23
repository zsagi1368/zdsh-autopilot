/**
 * zDSH AutoPilot — host-side plugin entry.
 *
 * Loader contract: named exports `name`, optional `inject`, and `apply(ctx)`.
 * The host context is adapted into kernel ports here and NOWHERE else; every
 * assumption about a host seam is registered in src/kernel/probes.ts with a
 * probe and a degradation path before modules rely on it.
 */
import { createKernel } from './kernel/facade.js';
import type { Kernel } from './kernel/facade.js';

export const name = 'zdsh-autopilot';

export const inject: readonly string[] = [];

/**
 * Narrow structural view of what we need from the host context. Deliberately
 * NOT the full cordis Context: if the host grows or renames services, this
 * surface is all that needs re-verification (see probes ASSUMPTIONS).
 */
export interface AutopilotHostContext {
  /** Cordis-style service lookup; availability drives activation. */
  get?<T = unknown>(key: string): T | undefined;
}

const kernels = new WeakMap<object, Kernel>();

/** Test/inspection hook: the kernel mounted for a given host context. */
export function kernelFor(ctx: object): Kernel | undefined {
  return kernels.get(ctx);
}

export interface AutopilotPlugin {
  name: string;
  inject?: readonly string[];
  apply(ctx: AutopilotHostContext): void;
}

export function apply(ctx: AutopilotHostContext): void {
  try {
    // Ports: system clock + token source; stats persistence arrives with the
    // console milestone's storage adapter (M5) — memory until then.
    const kernel = createKernel({});
    kernels.set(ctx as object, kernel);

    // Module mounting happens in M2 (continue), M3 (guard), M4 (review).
    // Until then the coordinator has no handlers and apply() stays inert by
    // construction — installing the scaffold must not change behavior.
    void ctx.get?.('settings');
  } catch {
    // Never break host startup because of automation plumbing.
  }
}
