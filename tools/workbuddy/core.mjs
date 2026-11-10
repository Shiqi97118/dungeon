import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export function resolveConfig(raw, repo) {
  if (!Number.isInteger(raw.port) || raw.port < 1024 || raw.port > 65535) throw Error('Invalid loopback port');
  if (!Array.isArray(raw.allowedModels) || !raw.allowedModels.includes(raw.model)) throw Error('Model is not explicitly approved');
  const config = { ...raw };
  for (const key of ['workspace', 'gatewayDir', 'stateDir', 'executable']) {
    if (typeof raw[key] !== 'string' || !raw[key]) throw Error(`Missing ${key}`);
    config[key] = path.resolve(repo, raw[key]);
  }
  if (!fs.statSync(config.workspace).isDirectory()) throw Error('Workspace is not a directory');
  return config;
}

export function validateTask(task) {
  if (!task || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/.test(task.id ?? '')) throw Error('Task requires a stable, safe id');
  if (task.status && task.status !== 'ready') throw Error('Shared task is not ready; inspect its checkpoint before running it on another computer');
  if (typeof task.prompt !== 'string' || !task.prompt.trim() || Buffer.byteLength(task.prompt) > 80000) throw Error('Task requires a bounded prompt');
  if (!Array.isArray(task.allowedPaths) || !task.allowedPaths.length) throw Error('Task requires explicit allowedPaths');
  for (const name of task.allowedPaths) {
    if (typeof name !== 'string' || !name || path.posix.isAbsolute(name) || path.win32.isAbsolute(name) || name.split(/[\\/]/).includes('..') || name.startsWith('.local') || name.includes(':') || name.includes('\0')) throw Error('Unsafe task path');
  }
  return { ...task, digest: crypto.createHash('sha256').update(JSON.stringify({ prompt: task.prompt, allowedPaths: task.allowedPaths })).digest('hex') };
}

export function checkBinding(record, config, hostname = os.hostname()) {
  if (record.machine !== hostname || path.resolve(record.workspace) !== config.workspace) throw Error('This execution session belongs to another computer or checkout; initialize a new local session');
  if (!/^[a-f0-9-]{36}$/.test(record.sessionId)) throw Error('Invalid local session identity');
}

export function reserveTask(record, task) {
  if (record.tasks?.[task.id]) throw Error('Task already recorded; inspect the original attempt instead of resubmitting');
  const entry = { digest: task.digest, wakeId: `wake-run-${crypto.randomUUID()}`, state: 'submitting', createdAt: new Date().toISOString() };
  record.tasks ??= {};
  record.tasks[task.id] = entry;
  return entry;
}

export function writeJson(file, data, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exclusive) { fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); return; }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  try { fs.renameSync(temporary, file); }
  catch (error) { fs.unlinkSync(temporary); throw error; }
}

export async function locked(file, action) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Never silently steal a stale lock or replay an uncertain native operation.
  const fd = fs.openSync(file, 'wx', 0o600);
  fs.writeSync(fd, JSON.stringify({ pid: process.pid, machine: os.hostname() }));
  try { return await action(); } finally { fs.closeSync(fd); fs.unlinkSync(file); }
}
