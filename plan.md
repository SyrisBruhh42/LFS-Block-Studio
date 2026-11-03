Plan:
1.  **Add Domain ID**: Add `webgl_memory_context_invariants` to `SelfTestDomainId` in `src/engine/selfTestSuite.ts`.
2.  **Create New Suite**: Implement `runWebglMemoryAndContextInvariantsAudit` in `src/engine/selfTestSuite.ts`.
    -   *Assertion 1*: Test `disposeUnsharedGroupGeometries` logic by providing a dummy `THREE.Group` with shared and unshared geometries. Ensure `dispose()` is only called on unshared geometries, and on materials marked with `isDisposableMaterial = true`.
    -   *Assertion 2*: Simulate a context loss / context restore scenario. We can test that the active viewport bridge from the Skyblock viewport provides methods to rebuild blocks cleanly and doesn't throw. (Since Skyblock viewport is a React component, we might need to abstract the WebGL context loss logic or we can write a test for the `rebuild` sequence invariants if there are pure functions for them).
        Let's look at `src/components/SkyblockViewport.tsx` to see if there is any pure logic we can extract or test directly. The context loss just calls `rebuildPlacedBlocks`, etc., and sets a boolean. Wait, the prompt says: "Expand self-testing auditor assertions and WebGL context loss/restore disposal invariants with deterministic unit tests."
        We should definitely test `disposeUnsharedGroupGeometries`.
3.  **Include Suite**: Add `runWebglMemoryAndContextInvariantsAudit()` to `runAllSelfTests` array in `selfTestSuite.ts`.
4.  **Update Domain Mapper**: In `src/engine/issueTrackerEngine.ts`, add `webgl_memory_context_invariants: 'WEBGL_TELEMETRY_GUARD'` to `domainMap`.
5.  **Update Tests**: Modify `src/engine/selfTestSuite.test.ts` to assert the 7th suite passes.

Let's do this. I'll request a plan review.
