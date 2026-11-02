/** Review construction only. Apply still requires the exact live token and durable policy transition. */
import { captureJavaDefinitionBinding, validateJavaCellMapping, JAVA_CELL_MAPPING_CONTRACT, type JavaDefinitionBinding } from '../engine/javaCellMapping';
import { JAVA_SCHEMATIC_PROFILE, type CandidateJavaBlockState } from '../engine/javaProfile';
import { createStudioId, validateStudioDocument, type StudioDocument } from './studioDocument';
import { candidateJavaTarget, policyDataKey, assertCompatiblePolicyTransition, type StudioTarget } from './studioTargetPolicy';
import type { StudioCompatibilityReview } from '../components/StudioCompatibilityPanel';

export type SolidJavaState = Exclude<CandidateJavaBlockState, 'minecraft:air'>;
export interface CompatibilityDraft {
  sourceToken: string;
  locked: boolean;
  assignments: readonly { definitionId: string; blockState: SolidJavaState }[];
}
export interface CompatibilitySource {
  token: string;
  projectName: string;
  target: StudioTarget | null;
  definitions: readonly { id: string; name: string; instances: number; summary: string }[];
}
function checkedDocument(input: StudioDocument): StudioDocument {
  const checked = validateStudioDocument(input);
  if (!checked.ok) throw new Error(checked.error.message);
  return checked.value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function fields(input: unknown, names: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error('Compatibility choices must be plain data.');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) throw new Error('Unknown compatibility choice field.');
  const result: Record<string, unknown> = {};
  for (const key of names) {
    const d = Object.getOwnPropertyDescriptor(input, key);
    if (!d?.enumerable || !('value' in d)) throw new Error('Compatibility choice accessors are unsupported.');
    result[key] = d.value;
  }
  return result;
}
function readDraft(input: unknown): CompatibilityDraft {
  const data = fields(input, ['sourceToken', 'locked', 'assignments']);
  if (typeof data.sourceToken !== 'string' || !data.sourceToken.length || data.sourceToken.length > 4096 || typeof data.locked !== 'boolean') throw new Error('A current source token and explicit lock choice are required.');
  if (!Array.isArray(data.assignments) || data.assignments.length > JAVA_CELL_MAPPING_CONTRACT.limits.maxBindings || Reflect.ownKeys(data.assignments).length !== data.assignments.length + 1) throw new Error('Assignments exceed the supported list or contain non-data entries.');
  const ids = new Set<string>(), assignments: CompatibilityDraft['assignments'][number][] = [];
  for (let i = 0; i < data.assignments.length; i++) {
    const d = Object.getOwnPropertyDescriptor(data.assignments, String(i));
    if (!d?.enumerable || !('value' in d)) throw new Error('Assignment accessors and sparse lists are unsupported.');
    const row = fields(d.value, ['definitionId', 'blockState']);
    if (typeof row.definitionId !== 'string' || row.definitionId.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(row.definitionId) || ['__proto__', 'prototype', 'constructor'].includes(row.definitionId) || ids.has(row.definitionId)) throw new Error('Every assignment needs a unique valid definition ID.');
    if (row.blockState === 'minecraft:air' || !JAVA_SCHEMATIC_PROFILE.blockStates.includes(row.blockState as CandidateJavaBlockState)) throw new Error('Only the admitted solid Java states can be assigned.');
    ids.add(row.definitionId); assignments.push({ definitionId: row.definitionId, blockState: row.blockState as SolidJavaState });
  }
  assignments.sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  return { sourceToken: data.sourceToken, locked: data.locked, assignments };
}
function counts(document: StudioDocument) {
  const result = new Map<string, { count: number; ids: string[] }>();
  for (const block of Object.values(document.blocks)) {
    const row = result.get(block.blockDefId) ?? { count: 0, ids: [] };
    row.count++; if (row.ids.length < 20) row.ids.push(block.id); result.set(block.blockDefId, row);
  }
  return result;
}
/** UI projection from already valid live data; no second mutable world. */
export function describeCompatibilitySource(document: StudioDocument, token: string): CompatibilitySource {
  const used = counts(document);
  return { token, projectName: document.world.worldName, target: document.targetPolicy?.target ?? null,
    definitions: Object.values(document.customBlocks).sort((a, b) => a.name.localeCompare(b.name)).map(def => ({
      id: def.id, name: def.name, instances: used.get(def.id)?.count ?? 0,
      summary: `${def.width} × ${def.heightPlates / 3} × ${def.depth}; ${def.shape}; ${def.color}; ${def.texturePattern}; ${def.materialFinish}${def.hasStuds ? '; studs' : ''}${def.voxels ? '; voxel shape' : ''}`,
    })) };
}
export function eligibleJavaDefinitions(document: StudioDocument): string[] {
  const target = document.targetPolicy?.target;
  if (target?.kind !== 'minecraft-java') return [];
  return target.bindings.filter(binding => {
    const definition = document.customBlocks[binding.definitionId];
    if (!definition) return false;
    const captured = captureJavaDefinitionBinding(definition, binding.blockState);
    return captured.ok && captured.binding.definitionSignature === binding.definitionSignature;
  }).map(binding => binding.definitionId);
}
export function reviewStudioCompatibility(input: StudioDocument, choices: CompatibilityDraft): StudioCompatibilityReview {
  const document = checkedDocument(input), draft = readDraft(choices), used = counts(document);
  const issues: StudioCompatibilityReview['issues'][number][] = [];
  let issuesTruncated = false;
  const add = (code: string, path: string, message: string, definitionId?: string, blockId?: string) => {
    if (issues.length >= 100) { issuesTruncated = true; return; }
    const affected = definitionId ? used.get(definitionId) : undefined;
    issues.push({ code, path, message, affectedInstanceIds: blockId ? [blockId] : affected?.ids ?? [], affectedInstances: blockId ? 1 : affected?.count ?? 0 });
  };
  const previous = document.targetPolicy?.target;
  let target: StudioTarget;
  if (previous?.kind === 'minecraft-java') {
    target = { ...structuredClone(previous), locked: draft.locked };
    const assigned = previous.bindings.map(({ definitionId, blockState }) => ({ definitionId, blockState })).sort((a, b) => a.definitionId.localeCompare(b.definitionId));
    if (policyDataKey(assigned) !== policyDataKey(draft.assignments)) add('copy-required', '$.assignments', 'Existing mappings are fixed for this project. Review changed mappings in a separate project copy.');
    if (previous.locked === draft.locked) add('unchanged-policy', '$.locked', 'This lock state is already active.');
  } else {
    const bindings: JavaDefinitionBinding[] = [];
    for (const assignment of draft.assignments) {
      const definition = document.customBlocks[assignment.definitionId];
      if (!definition) { add('missing-definition', `$.definitions.${assignment.definitionId}`, 'The chosen definition is no longer present.', assignment.definitionId); continue; }
      const captured = captureJavaDefinitionBinding(definition, assignment.blockState);
      if (captured.ok) bindings.push(captured.binding);
      else for (const issue of captured.issues) add(issue.code, `$.definitions.${assignment.definitionId}`, issue.message, assignment.definitionId);
    }
    target = candidateJavaTarget(bindings, draft.locked);
    if (!draft.locked) add('initial-lock-required', '$.locked', 'Select and review the initial locked profile before creating an unlocked Java policy.');
  }
  if (target.kind === 'minecraft-java' && target.locked) {
    const candidate = { ...document, targetPolicy: { policyVersion: 1 as const, checkpoint: { documentId: document.documentId, revision: document.revision, historyEpoch: document.historyEpoch }, target } };
    if (!eligibleJavaDefinitions(candidate).length) add('no-eligible-definition', '$.assignments', 'Choose at least one unchanged unit-block definition for the locked building palette.');
    const mapped = validateJavaCellMapping({ blocks: document.blocks, definitions: document.customBlocks, bindings: target.bindings });
    if (!mapped.ok) {
      for (const issue of mapped.issues) {
        // Keys may contain fractional coordinates. Match the full address before a field suffix.
        const key = issue.path.startsWith('$.blocks.') ? (issue.path.slice(9).match(/^([^,]+,[^,]+,[^.]+(?:\.\d+)?)(?:\.|$)/)?.[1] ?? '') : '';
        const block = document.blocks[key];
        const defId = issue.path.startsWith('$.definitions.') ? Object.keys(document.customBlocks).find(id => issue.path === `$.definitions.${id}` || issue.path.startsWith(`$.definitions.${id}.`)) : undefined;
        add(issue.code, issue.path, issue.message, defId, block?.id);
      }
      issuesTruncated ||= mapped.issuesTruncated;
    }
  }
  if (!issues.length) {
    try {
      assertCompatiblePolicyTransition(document, { ...document, schemaVersion: 2, revision: document.revision + 1, historyEpoch: `${document.historyEpoch}-review`,
        targetPolicy: { policyVersion: 1, checkpoint: { documentId: document.documentId, revision: document.revision, historyEpoch: document.historyEpoch }, target } });
    } catch (error) { add('invalid-transition', '$.target', error instanceof Error ? error.message : 'This transition requires a separate copy.'); }
  }
  const mappings = target.kind === 'minecraft-java' ? target.bindings.map(binding => {
    const def = document.customBlocks[binding.definitionId];
    return { definitionId: binding.definitionId, name: def?.name ?? `${binding.definitionId} (not in this project)`, blockState: binding.blockState,
      instances: used.get(binding.definitionId)?.count ?? 0,
      appearanceSummary: def ? `${def.color}, ${def.texturePattern}, ${def.materialFinish} → ${binding.blockState}. Studio appearance is a reviewed substitution, not exported textures.` : 'Retained mapping; no current instances.',
    };
  }) : [];
  return freeze({ id: createStudioId('compat-review'), sourceToken: draft.sourceToken, target, mappings, issues, issuesTruncated, canApply: !issues.length,
    summary: `${Object.keys(document.blocks).length} placed blocks; ${mappings.length} explicit mappings. ${draft.locked ? 'Enable candidate Java constraints' : 'Disable candidate Java constraints'} after saving a checkpoint and starting a new Undo history. Native Minecraft qualification has not run.` });
}
/** Apply approval is for this exact immutable report, not another report with the same ID. */
export function matchesCompatibilityReview(review: StudioCompatibilityReview, captured: StudioCompatibilityReview | null, liveToken: string): boolean {
  return !!captured && captured.canApply && captured.sourceToken === liveToken && review === captured;
}
