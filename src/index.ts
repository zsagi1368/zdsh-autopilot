/**
 * zDSH AutoPilot — host-side plugin entry (scaffold).
 *
 * Loader contract: named exports `name`, optional `inject`, and `apply(ctx)`.
 * Kernel wiring arrives with milestone M1; every assumption about a host seam
 * gets registered in src/kernel/probes.ts together with a probe and a
 * degradation path before it is relied upon.
 */
export const name = 'zdsh-autopilot';

export const inject: readonly string[] = [];

export interface AutopilotPlugin {
  name: string;
  inject?: readonly string[];
  apply(ctx: unknown): void;
}

export function apply(_ctx: unknown): void {
  // Milestone M1 mounts: settings namespace registration, kernel coordinator,
  // and the per-module seams (continue / guard / review).
}
