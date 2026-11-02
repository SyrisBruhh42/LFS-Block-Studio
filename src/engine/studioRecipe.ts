import type { CommandMacroLoop, GridCoord, WorldEditEngineState } from './types';
import { executeWorldEditCommand, getGridCoordError } from './worldEditEngine';

export const STUDIO_RECIPE_LIMITS = Object.freeze({
  maxIterations: 16,
  maxCommands: 32,
  maxTotalCommands: 64,
  maxCommandCharacters: 4096,
  maxIntervalMs: 10_000,
  maxBlockWork: 100_000,
});

export interface PrepareStudioRecipeOptions {
  /** Caller supplies validated engine-domain state; history is never copied. */
  state: WorldEditEngineState;
  macro: CommandMacroLoop;
  activeBlockId: string;
  hoveredCoord?: GridCoord | null;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  /** Trusted read-only admission of each detached step, before further commands. */
  validateStep?: (state: WorldEditEngineState, command: string, completed: number) => void;
}
export interface PreparedStudioRecipe { state: WorldEditEngineState; commands: number; workProxy: number; steps: { command: string; message: string }[] }
export class StudioRecipeError extends Error {
  constructor(readonly code: 'invalid-recipe' | 'command-failed' | 'work-limit', message: string) {
    super(message); this.name = 'StudioRecipeError';
  }
}
function invalid(message: string): never { throw new StudioRecipeError('invalid-recipe', message); }
function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Recipe preparation was cancelled. No prepared edit was committed.', 'AbortError');
}
function commandName(command: string): string {
  const trimmed = command.trim();
  const normalized = trimmed.startsWith('//') ? trimmed.slice(2) : trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  return normalized.split(/\s+/)[0].toLowerCase();
}
function blockCountWithinBudget(blocks: WorldEditEngineState['blocks'], remaining: number): number {
  if (!blocks || typeof blocks !== 'object' || Array.isArray(blocks)) invalid('Recipe source blocks must be a coordinate map.');
  let count = 0;
  for (const key in blocks) {
    if (Object.hasOwn(blocks, key) && ++count > remaining) {
      throw new StudioRecipeError('work-limit', 'Recipe exceeds the 100,000 current-plus-result block-count proxy budget. No prepared edit was committed.');
    }
  }
  return count;
}
/** Yield even at zero delay so cancellation/UI work can run between commands. */
function waitBetweenSteps(intervalMs: number, signal?: AbortSignal): Promise<void> {
  checkCancelled(signal);
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => {
      clearTimeout(timer); cleanup();
      reject(new DOMException('Recipe preparation was cancelled. No prepared edit was committed.', 'AbortError'));
    };
    const timer = setTimeout(() => { cleanup(); resolve(); }, intervalMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/**
 * Prepare a recipe on an isolated snapshot. The caller owns stale-token checking
 * and the single final transaction/undo entry. No live editor mutation occurs.
 *
 * The aggregate work proxy charges current block count before EACH command and
 * result block count after it, including selection/read-only commands. It is not
 * an exact cell-examination, memory, latency or frame-time bound. Existing engine
 * preallocation guards still bound individual region/shape operations. Input
 * definitions/clipboard must already satisfy the caller's document validation.
 * Cancellation is cooperative between synchronous engine commands, not within one.
 */
export async function prepareStudioRecipe({ state, macro, activeBlockId, hoveredCoord, signal, onProgress, validateStep }: PrepareStudioRecipeOptions): Promise<PreparedStudioRecipe> {
  checkCancelled(signal);
  if (!macro || typeof macro !== 'object') invalid('A recipe object is required.');
  const { iterations, intervalMs } = macro;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > STUDIO_RECIPE_LIMITS.maxIterations) invalid('Recipe iterations must be a whole number from 1 to 16.');
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs) || intervalMs < 0 || intervalMs > STUDIO_RECIPE_LIMITS.maxIntervalMs) invalid('Recipe interval must be a finite number from 0 to 10,000 milliseconds.');
  if (!Array.isArray(macro.commands) || macro.commands.length < 1 || macro.commands.length > STUDIO_RECIPE_LIMITS.maxCommands) invalid('A recipe requires 1 to 32 commands.');
  const total = macro.commands.length * iterations;
  if (total > STUDIO_RECIPE_LIMITS.maxTotalCommands) invalid('A recipe may execute at most 64 commands in total.');
  if (typeof activeBlockId !== 'string' || activeBlockId.length < 1 || activeBlockId.length > 200 || !/^[a-zA-Z0-9_.:-]+$/.test(activeBlockId)) invalid('The active block identifier is invalid.');
  const commands: string[] = [];
  for (const command of macro.commands) {
    if (typeof command !== 'string' || command.length < 1 || command.length > STUDIO_RECIPE_LIMITS.maxCommandCharacters) invalid('Each recipe command must contain 1 to 4,096 characters.');
    const tokens = command.trim().split(/\s+/);
    if (tokens[0]?.includes('{active}')) invalid('The active block placeholder cannot choose a command name.');
    if (tokens.some(token => token.includes('{active}') && token !== '{active}')) invalid('Use {active} as a complete block argument.');
    const resolved = command.replace(/\{active\}/g, `@${activeBlockId}`);
    if (!resolved.trim() || resolved.length > STUDIO_RECIPE_LIMITS.maxCommandCharacters) invalid('Each resolved recipe command must contain 1 to 4,096 characters.');
    if (['undo', 'redo'].includes(commandName(resolved))) invalid('Undo and redo cannot run inside a recipe; apply or undo the complete recipe instead.');
    commands.push(resolved);
  }
  if (hoveredCoord != null && getGridCoordError(hoveredCoord)) invalid('The recipe cursor must use finite whole coordinates within the engine limit.');
  if (onProgress !== undefined && typeof onProgress !== 'function') invalid('Recipe progress must be a callback.');
  if (validateStep !== undefined && (typeof validateStep !== 'function' || Object.prototype.toString.call(validateStep) === '[object AsyncFunction]')) invalid('Recipe step validation must be a synchronous callback.');
  if (!state || typeof state !== 'object') invalid('A validated engine state is required.');
  // Reject an already oversized block map before cloning it. Do not traverse old
  // undo/redo snapshots: those belong to the caller's live transaction history.
  let currentCount = blockCountWithinBudget(state.blocks, STUDIO_RECIPE_LIMITS.maxBlockWork);
  let working: WorldEditEngineState;
  try {
    working = structuredClone({ blocks: state.blocks, customBlocks: state.customBlocks,
      pos1: state.pos1, pos2: state.pos2, clipboard: state.clipboard,
      clipboardCustomDefs: state.clipboardCustomDefs, undoStack: [], redoStack: [] });
  } catch { invalid('The recipe source must contain cloneable engine-domain data.'); }
  const cursor = hoveredCoord == null ? undefined : { ...hoveredCoord };
  let work = 0;
  const steps: PreparedStudioRecipe['steps'] = [];
  for (let completed = 0; completed < total; completed++) {
    if (completed > 0) await waitBetweenSteps(intervalMs, signal);
    checkCancelled(signal);
    if (currentCount > STUDIO_RECIPE_LIMITS.maxBlockWork - work) {
      throw new StudioRecipeError('work-limit', 'Recipe exceeds the 100,000 current-plus-result block-count proxy budget. No prepared edit was committed.');
    }
    work += currentCount;
    const result = executeWorldEditCommand(working, commands[completed % commands.length], cursor);
    if (!result.success) throw new StudioRecipeError('command-failed', `Recipe command ${completed + 1} of ${total} failed: ${result.message} No prepared edit was committed.`);
    currentCount = blockCountWithinBudget(result.nextState.blocks, STUDIO_RECIPE_LIMITS.maxBlockWork - work);
    work += currentCount;
    // Engine commands may create legacy history internally; never accumulate it
    // across preparation steps or return it as the caller's transaction history.
    working = { ...result.nextState, undoStack: [], redoStack: [] };
    try {
      const checked: unknown = validateStep?.(working, commands[completed % commands.length], completed + 1);
      if (checked !== undefined) {
        // Drain a mistaken native Promise without invoking a custom then accessor.
        try { Promise.prototype.then.call(checked, () => undefined, () => undefined); } catch { /* Not a native Promise. */ }
        throw new Error('Recipe step validation must complete synchronously and return nothing.');
      }
    }
    catch (error) { throw new StudioRecipeError('command-failed', `Recipe command ${completed + 1} of ${total} was rejected: ${error instanceof Error ? error.message : 'Invalid proposal.'} No prepared edit was committed.`); }
    steps.push({ command: commands[completed % commands.length], message: result.message });
    onProgress?.(completed + 1, total);
    checkCancelled(signal);
  }
  return { state: working, commands: total, workProxy: work, steps };
}
