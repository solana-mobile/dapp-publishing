export default {
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  roots: [
    '<rootDir>/src/'
  ],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"]
  },
};
