/**
 * اختبارات المجدول تعمل على قاعدة بيانات حقيقية (نفس المخطط وقيوده)،
 * بطابور وقنوات إرسال مزيّفة. تسلسلية لأنها تتشارك القاعدة.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  testEnvironment: 'node',
  maxWorkers: 1,
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
