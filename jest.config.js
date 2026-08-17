/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.ts'],
  testTimeout: 30000,
  // The whole suite shares one in-process Postgres, so keep it serial.
  maxWorkers: 1,
};
