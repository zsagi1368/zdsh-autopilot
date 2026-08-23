/**
 * zDSH AutoPilot — browser half (scaffold).
 *
 * The client fiber follows the host's plugin client contract: named exports
 * `name`, `inject`, and `apply(ctx)`. The tsdown build wraps this module in the
 * `window.__ModuleLoader__.load({ id, factory })` classic-script shell; platform
 * modules stay external and are provided by the loader's `require`.
 *
 * Milestone M5 replaces this stub with the console fiber: locale dictionary,
 * settings tab, per-plugin cards, session-header panel, and the bridge
 * subscription.
 */
export const name = 'zdsh-autopilot';

export const inject: string[] = ['slots', 'locale'];

export function apply(_ctx: unknown): void {
  // Console fiber lands in M5.
}
