import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runAllSelfTests,
  runCommandAndBoundsFuzzer,
  runUndoAndPresetTransactionAudit,
  runPersistenceAndSerializationCrucible,
  runUxErgonomicsAndInputOwnershipAudit,
  runBalanceCopilotAndProgressionAudit,
  runLegalIpAndExportFidelityAudit,
  runWebglMemoryAndContextInvariantsAudit,
} from './selfTestSuite';

test('Suite 1: Command & Bounds Fuzzer passes all adversarial assertions', () => {
  const report = runCommandAndBoundsFuzzer();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Suite 2: Undo & Preset Transaction Audit passes all atomic undo and preset checks', () => {
  const report = runUndoAndPresetTransactionAudit();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Suite 3: Persistence & Serialization Crucible passes cloud size and import schema checks', () => {
  const report = runPersistenceAndSerializationCrucible();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Suite 4: UX, Ergonomics & Input Ownership Audit verifies zero hotkey collisions', () => {
  const report = runUxErgonomicsAndInputOwnershipAudit();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Suite 5: Balance, Copilot & Progression Audit verifies texture cohesion, walkability, and streak math', () => {
  const report = runBalanceCopilotAndProgressionAudit();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Suite 6: Legal, IP & Export Fidelity Audit verifies glTF 2.0 meshes and trademark hygiene', () => {
  const report = runLegalIpAndExportFidelityAudit();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Suite 7: WebGL Memory & Context Invariants Audit verifies proper disposal and shared geo preservation', () => {
  const report = runWebglMemoryAndContextInvariantsAudit();
  for (const a of report.assertions) {
    assert.equal(
      a.passed,
      true,
      `[${a.id}] ${a.title} failed: ${a.actualSummary} (${a.assertionDiff || ''})`
    );
  }
  assert.equal(report.failedCount, 0);
});

test('Master SelfTestSuiteReport aggregates all 7 suites with 0 failures', () => {
  const master = runAllSelfTests();
  assert.equal(master.allPassed, true);
  assert.equal(master.totalFailed, 0);
  assert.equal(master.suites.length, 7);
});
