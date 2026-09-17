/**
 * Media queries for tilt mode. Dependency-free on purpose: tailwind.config.ts
 * imports TILT_QUERY for its `tilt:` screen, and lib/tilt.ts uses the same
 * strings in JS, so CSS sizing and the layout switch can never disagree.
 */
export const TILT_QUERY = '(orientation: landscape) and (max-height: 540px) and (pointer: coarse)';
export const PORTRAIT_PHONE_QUERY = '(orientation: portrait) and (max-width: 540px) and (pointer: coarse)';
