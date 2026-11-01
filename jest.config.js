export default {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['./tests/setup.js'],
  extensionsToTreatAsEsm: [],
  // A7: firestoreRules.test.js requires the Firebase emulator (Java 21+).
  // Run it separately with: npm run test:rules
  testPathIgnorePatterns: ['/node_modules/', 'firestoreRules\\.test\\.js'],
};
