import type { PathRoots } from './pathhard.js';
export interface FuseVerdict {
    denied: true;
    reason: string;
}
/**
 * Synchronous hard-deny fuse for tool calls. Returns undefined when the call
 * may proceed to the lower layers.
 */
export declare function hardDeny(toolName: string, argsJson: string, roots: PathRoots): FuseVerdict | undefined;
export type ToolDecision = 'allow' | 'classify' | 'deny';
export interface ToolAssessment {
    decision: ToolDecision;
    reason: string;
}
export declare function assessTool(toolName: string, argsJson: string, roots: PathRoots, hasArtifact?: (path: string) => boolean): ToolAssessment;
