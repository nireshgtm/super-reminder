// Jest mock for expo-sqlite (not exercised in Phase 1 scheduler tests)
export const openDatabaseAsync = jest.fn(async () => ({
  execAsync: jest.fn(async () => {}),
  runAsync: jest.fn(async () => ({ lastInsertRowId: 0, changes: 0 })),
  getFirstAsync: jest.fn(async () => null),
  getAllAsync: jest.fn(async () => []),
}));
