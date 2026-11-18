import test from 'node:test';
import assert from 'node:assert/strict';
import { logFailure } from '../src/server/safeLog.ts';
test('error logging excludes SQL, credentials and personal data from exceptions', () => {
  const captured: string[] = []; const original = console.error;
  console.error = message => captured.push(String(message));
  try {
    const exception = Object.assign(new Error('password=private-test-value SELECT cpf FROM users'), { code: '23505', cause: new Error('private-personal-data') });
    logFailure('db.create', exception);
    logFailure('db.create', { code: 'password=private-test-value' });
  } finally { console.error = original; }
  assert.deepEqual(captured.map(line => JSON.parse(line)), [{ event: 'db.create', code: '23505' }, { event: 'db.create', code: 'INTERNAL_ERROR' }]);
  assert.ok(captured.every(line => !/private|SELECT|cpf|password/.test(line)));
});
