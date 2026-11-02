/** Typed persisted target policy. Candidate compatibility is distinct from native qualification. */
import { JAVA_CELL_MAPPING_CONTRACT, validateJavaCellMapping, validateJavaDefinitionBindings, type JavaDefinitionBinding } from '../engine/javaCellMapping';
import type { StudioDocument } from './studioDocument';

export interface StudioPolicyCheckpoint { documentId: string; revision: number; historyEpoch: string }
export type StudioTarget = { kind: 'freeform' } | {
  kind: 'minecraft-java'; locked: boolean; profileId: string; registryIdentity: string;
  mappingRevision: string; validatorRevision: string; bindings: readonly JavaDefinitionBinding[];
};
export interface StudioTargetPolicy { policyVersion: 1; checkpoint: StudioPolicyCheckpoint; target: StudioTarget }

function fields(value: unknown, required: readonly string[]): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('Target policy must contain plain data.');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== required.length || keys.some(key => typeof key !== 'string' || !required.includes(key))) throw new Error('Unknown or missing target policy field.');
  for (const key of required) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) throw new Error('Target policy accessors are unsupported.');
  }
  return value as Record<string, any>;
}
function id(value: unknown): void {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9_.:-]+$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('Invalid target checkpoint identity.');
}
export function validateStudioTargetPolicy(value: unknown, document: Pick<StudioDocument, 'blocks' | 'customBlocks'>): asserts value is StudioTargetPolicy {
  const policy = fields(value, ['policyVersion', 'checkpoint', 'target']);
  if (policy.policyVersion !== 1) throw new Error('Unsupported target policy version; the project cannot be opened unlocked.');
  const checkpoint = fields(policy.checkpoint, ['documentId', 'revision', 'historyEpoch']);
  id(checkpoint.documentId); id(checkpoint.historyEpoch);
  if (!Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 0) throw new Error('Invalid target checkpoint revision.');
  // Inspect kind without invoking an untrusted getter, even outside document preflight.
  const kind = policy.target && typeof policy.target === 'object' ? Object.getOwnPropertyDescriptor(policy.target, 'kind') : undefined;
  if (!kind || !('value' in kind)) throw new Error('Target policy needs an explicit target kind.');
  if (kind.value === 'freeform') { fields(policy.target, ['kind']); return; }
  const target = fields(policy.target, ['kind', 'locked', 'profileId', 'registryIdentity', 'mappingRevision', 'validatorRevision', 'bindings']);
  if (target.kind !== 'minecraft-java' || typeof target.locked !== 'boolean') throw new Error('Unsupported target or lock state.');
  const contract = JAVA_CELL_MAPPING_CONTRACT;
  if (target.profileId !== contract.profileId || target.registryIdentity !== contract.subsetIdentity || target.mappingRevision !== contract.revision || target.validatorRevision !== contract.validatorRevision) throw new Error('Unknown target profile, admitted registry subset, mapping or validator revision.');
  const bindings = validateJavaDefinitionBindings(target.bindings);
  if (!bindings.ok) throw new Error(bindings.issues[0]?.message ?? 'Invalid target mappings.');
  if (target.locked) {
    const mapped = validateJavaCellMapping({ blocks: document.blocks, definitions: document.customBlocks, bindings: bindings.bindings });
    if (!mapped.ok) throw new Error(`Game compatibility lock: ${mapped.issues[0]?.message ?? 'The build is outside the admitted target.'}`);
  }
}
export function candidateJavaTarget(bindings: readonly JavaDefinitionBinding[], locked = true): StudioTarget {
  const contract = JAVA_CELL_MAPPING_CONTRACT;
  return { kind: 'minecraft-java', locked, profileId: contract.profileId, registryIdentity: contract.subsetIdentity,
    mappingRevision: contract.revision, validatorRevision: contract.validatorRevision, bindings: structuredClone(bindings) };
}
/** Deterministic semantic comparison after bounded schema validation; never a cryptographic proof. */
export function policyDataKey(value: unknown): string {
  const canonical = (input: any): any => Array.isArray(input) ? input.map(canonical) : input && typeof input === 'object'
    ? Object.fromEntries(Object.keys(input).sort().map(key => [key, canonical(input[key])])) : input;
  return JSON.stringify(canonical(value));
}
export function samePolicyEnvelope(left: StudioDocument, right: StudioDocument): boolean {
  return left.schemaVersion === right.schemaVersion && left.historyEpoch === right.historyEpoch && policyDataKey(left.targetPolicy ?? null) === policyDataKey(right.targetPolicy ?? null);
}
export function sameAuthoredBuild(left: StudioDocument, right: StudioDocument): boolean {
  const content = ({ format, schemaVersion, documentId, revision, historyEpoch, savedAt, targetPolicy, ...authored }: StudioDocument) => authored;
  return policyDataKey(content(left)) === policyDataKey(content(right));
}
/** Compatible initial selection/lock toggle only. Other target changes require a separate copy. */
export function assertCompatiblePolicyTransition(previous: StudioDocument, next: StudioDocument): void {
  if (next.schemaVersion !== 2 || !next.targetPolicy || next.documentId !== previous.documentId || next.revision !== previous.revision + 1 || next.historyEpoch === previous.historyEpoch) throw new Error('Policy transition requires the next durable revision and a new history epoch in this project.');
  const checkpoint = next.targetPolicy.checkpoint;
  if (checkpoint.documentId !== previous.documentId || checkpoint.revision !== previous.revision || checkpoint.historyEpoch !== previous.historyEpoch) throw new Error('Policy checkpoint must reference the complete current durable predecessor.');
  if (!sameAuthoredBuild(previous, next)) throw new Error('A same-project lock transition cannot change authored content. Review conversion as a separate copy.');
  const before = previous.targetPolicy?.target, after = next.targetPolicy.target;
  if (before?.kind === 'minecraft-java') {
    if (after.kind !== 'minecraft-java') throw new Error('Changing target kind requires a separate project copy.');
    const { locked: oldLock, ...oldIdentity } = before;
    const { locked: newLock, ...newIdentity } = after;
    if (policyDataKey(oldIdentity) !== policyDataKey(newIdentity)) throw new Error('Changing target identity or mappings requires a separate project copy.');
    if (oldLock === newLock) throw new Error('The requested lock state is already active.');
  } else if (after.kind === 'freeform' && previous.schemaVersion === 2) throw new Error('The requested Freeform policy is already active.');
}
