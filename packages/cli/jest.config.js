export default {
  testEnvironment: "node",
  rootDir: ".",
  moduleDirectories: ["node_modules", "src"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  roots: [
    '<rootDir>/src/'
  ],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"]
  },
  moduleFileExtensions: ["ts", "js", "jsx"],
};
