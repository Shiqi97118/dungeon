import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateTask, reserveTask, checkBinding, locked, writeJson, resolveConfig, latestVisibleReply } from './core.mjs';

const request = () => ({ id: 'random-character-v1', prompt: 'Implement random character creation', allowedPaths: ['src/ui/CharacterBuilder.tsx'] });
test('visible receipt reconstructs only the last public message and excludes thought events', () => {
  const events = [
    { update: { sessionUpdate: 'agent_message_chunk', messageId: 'progress', content: { type: 'text', text: 'Reading files' } } },
    { update: { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'not-visible' } } },
    { update: { sessionUpdate: 'agent_message_chunk', messageId: 'final', content: { type: 'text', text: '接收成功，' } } },
    { update: { sessionUpdate: 'agent_message_chunk', messageId: 'final', content: [{ type: 'text', text: '按要求未继续。' }] } },
  ];
  assert.equal(latestVisibleReply(events), '接收成功，按要求未继续。');
});
test('rejects unscoped tasks and traversal on either platform', () => {
  assert.throws(() => validateTask({ ...request(), allowedPaths: [] }));
  for (const target of ['../secret', '..\\secret', '/secret', 'C:\\secret', '.local/session.json']) assert.throws(() => validateTask({ ...request(), allowedPaths: [target] }));
  assert.throws(() => validateTask({ ...request(), id: '../id' }));
});
test('read-only handoff reception carries no write paths and cannot masquerade as a writable task', () => {
  const task = validateTask({ ...request(), allowedPaths: [], readOnly: true });
  assert.equal(task.readOnly, true);
  assert.throws(() => validateTask({ ...request(), allowedPaths: [], readOnly: false }));
  assert.throws(() => validateTask({ ...request(), allowedPaths: [], readOnly: 'true' }));
});
test('uncertain or rejected submissions cannot be silently submitted a second time', () => {
  const record = { budget: { limit: 30000, reservedTokens: 0 } }; const task = validateTask(request());
  const first = reserveTask(record, task);
  assert.equal(first.state, 'submitting');
  first.state = 'uncertain';
  assert.throws(() => reserveTask(record, task));
  assert.throws(() => reserveTask(record, validateTask({ ...request(), prompt: 'changed objective' })));
  assert.equal(record.budget.reservedTokens, 4000);
  assert.throws(() => validateTask({ ...request(), status: 'in_progress' }));
  assert.throws(() => validateTask({ ...request(), status: 'accepted' }));
});
test('unknown historical usage and exhausted reservations block further dispatch', () => {
  const task = validateTask(request());
  assert.throws(() => reserveTask({}, task));
  assert.throws(() => reserveTask({ budget: { limit: 30000, reservedTokens: 28000 } }, task));
  assert.throws(() => reserveTask({ budget: { limit: 30000, reservedTokens: 0 } }, { ...task, budgetTokens: 4001 }));
  const record = { budget: { limit: 30000, reservedTokens: 26000 } };
  reserveTask(record, task);
  assert.equal(record.budget.reservedTokens, 30000);
  assert.throws(() => reserveTask(record, { ...task, id: 'next-unit' }));
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
