import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateTask, reserveTask, checkBinding, locked, writeJson, resolveConfig } from './core.mjs';

const request = () => ({ id: 'random-character-v1', prompt: 'Implement random character creation', allowedPaths: ['src/ui/CharacterBuilder.tsx'] });
test('rejects unscoped tasks and traversal on either platform', () => {
  assert.throws(() => validateTask({ ...request(), allowedPaths: [] }));
  for (const target of ['../secret', '..\\secret', '/secret', 'C:\\secret', '.local/session.json']) assert.throws(() => validateTask({ ...request(), allowedPaths: [target] }));
  assert.throws(() => validateTask({ ...request(), id: '../id' }));
});
test('uncertain or rejected submissions cannot be silently submitted a second time', () => {
  const record = {}; const task = validateTask(request());
  const first = reserveTask(record, task);
  assert.equal(first.state, 'submitting');
  first.state = 'uncertain';
  assert.throws(() => reserveTask(record, task));
  assert.throws(() => reserveTask(record, validateTask({ ...request(), prompt: 'changed objective' })));
  assert.throws(() => validateTask({ ...request(), status: 'in_progress' }));
  assert.throws(() => validateTask({ ...request(), status: 'accepted' }));
});
test('session cannot move between machines or checkouts by copying state', () => {
  const workspace = path.resolve('checkout');
  const record = { machine: 'host-one', workspace, sessionId: '00000000-0000-0000-0000-000000000001' };
  checkBinding(record, { workspace }, 'host-one');
  assert.throws(() => checkBinding(record, { workspace }, 'host-two'));
  assert.throws(() => checkBinding(record, { workspace: path.resolve('another') }, 'host-one'));
});
test('local state survives reload and overlapping clients are rejected', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dungeon-workbuddy-test-'));
  const file = path.join(root, 'state.json'); const lock = path.join(root, 'lock');
  try {
    writeJson(file, { state: 'submitting' }, true);
    assert.throws(() => writeJson(file, {}, true));
    writeJson(file, { state: 'uncertain' });
    assert.equal(JSON.parse(fs.readFileSync(file)).state, 'uncertain');
    await locked(lock, async () => { await assert.rejects(locked(lock, async () => {})); });
    assert.equal(fs.existsSync(lock), false);
  } finally { for (const name of fs.readdirSync(root)) fs.unlinkSync(path.join(root, name)); fs.rmdirSync(root); }
});
test('model changes require an explicit allowlist', () => {
  const repo = process.cwd();
  const raw = { workspace: '.', gatewayDir: '.local/gateway', stateDir: '.local/workbuddy', executable: 'WorkBuddy.exe', port: 18491, model: 'expensive', allowedModels: ['hy4free'] };
  assert.throws(() => resolveConfig(raw, repo));
  const config = resolveConfig({ ...raw, model: 'hy4free' }, repo);
  assert.equal(config.workspace, repo);
});
