import type { PathRoots } from '../pathhard.js';
import type { SessionArtifacts } from '../artifacts.js';
import type { Assessment, ShellKind } from './lexer.js';
export declare function assessCommandLine(shell: ShellKind, line: string, artifacts: SessionArtifacts | undefined, roots: PathRoots): Assessment;
/**
 * Whole-line opaque fallback: only the small set of high-confidence semantic
 * markers escalates; everything else stays inside the OS sandbox.
 */
export declare function opaqueAssessment(text: string, roots: PathRoots): Assessment;
