// Vitest global setup.
//
// jest-dom matchers (toBeInTheDocument, toHaveClass, ...) only make sense when
// a DOM is present. The default test environment is `node` (used by the
// existing API/business-rule tests); component tests opt into a DOM with a
// per-file `// @vitest-environment happy-dom` pragma. We therefore only load
// the DOM matchers when a `document` actually exists, so the node-environment
// tests are unaffected.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}
