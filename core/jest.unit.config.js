module.exports = {
  testTimeout: 60 * 5 * 1000,
  moduleNameMapper: {
    "^uuid$": require.resolve("uuid"),
  },
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  preset: "ts-jest",
  testEnvironment: "node",
  testRegex: [
    ".*.spec.ts", // Include all .spec.ts files
  ],
  testPathIgnorePatterns: [
    ".*.integration.spec.ts", // Exclude .integration.spec.ts files
    ".*.e2e.spec.ts", // Exclude .e2e.spec.ts files
  ],
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
};
