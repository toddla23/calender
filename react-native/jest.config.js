/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', { diagnostics: false, tsconfig: { module: 'commonjs', target: 'ES2022', esModuleInterop: true, strict: true } }],
  },
  moduleNameMapper: {
    '^@calendar/sync-core$': '<rootDir>/../shared/sync-core/src/index.ts',
  },
};
