import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveConfig, validateTask, checkBinding, reserveTask, writeJson, locked, latestVisibleReply } from './core.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configFile = process.env.DUNGEON_WORKBUDDY_CONFIG ?? path.join(repo, '.local/workbuddy/config.json');
const command = process.argv[2] ?? 'doctor';
if (!fs.existsSync(configFile)) throw Error('Missing local config. Run tools/workbuddy/setup.ps1 first.');
const config = resolveConfig(JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, '')), repo);
const stateFile = path.join(config.stateDir, 'session.json');
const versionFile = path.join(config.gatewayDir, '.git');
const bridgeFile = path.join(config.gatewayDir, 'dist/native-desktop-trigger.js');
const pinnedCommit = 'fbaaa2ef6d6cb59f48b953a1f27058202a81553f';

function verifyEndpoint() {
  if (process.platform !== 'win32') throw Error('This adapter currently supports Windows only');
  const expression = `$ErrorActionPreference='Stop'; @(Get-NetTCPConnection -State Listen -LocalPort ${config.port} -ErrorAction Stop) | ForEach-Object { [pscustomobject]@{address=$_.LocalAddress; executable=(Get-Process -Id $_.OwningProcess -ErrorAction Stop).Path} } | ConvertTo-Json -Compress`;
  const value = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', expression], { encoding: 'utf8', windowsHide: true, timeout: 15000 }));
  const owners = Array.isArray(value) ? value : [value];
  if (!owners.length || owners.some(x => !['127.0.0.1', '::1'].includes(x.address) || path.resolve(x.executable).toLowerCase() !== config.executable.toLowerCase())) throw Error('Endpoint is not a verified loopback WorkBuddy process');
}

async function connect() {
  verifyEndpoint();
  if (!fs.existsSync(versionFile) || execFileSync('git', ['-C', config.gatewayDir, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim() !== pinnedCommit) throw Error('Gateway version differs from the reviewed pinned commit');
  const { RENDERER_BRIDGE } = await import(pathToFileURL(bridgeFile));
  const response = await fetch(`http://127.0.0.1:${config.port}/json/list`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error('Native discovery failed');
  const targets = await response.json();
  const renderer = path.join(path.dirname(config.executable), 'resources/app.asar/renderer').toLowerCase() + path.sep;
  const target = targets.find(t => {
    try { return t.type === 'page' && t.url.startsWith('file:') && fileURLToPath(t.url).toLowerCase().startsWith(renderer); } catch { return false; }
  });
  if (!target) throw Error('Compatible WorkBuddy renderer not found');
  const endpoint = new URL(target.webSocketDebuggerUrl);
  if (endpoint.protocol !== 'ws:' || !['localhost', '127.0.0.1'].includes(endpoint.hostname) || endpoint.port !== String(config.port)) throw Error('Invalid native debugger endpoint');
  // Discovery URLs can contain account data: never print or persist them.
  const socket = new WebSocket(endpoint);
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const frame = JSON.parse(String(event.data)); const request = pending.get(frame.id); if (!request) return;
    pending.delete(frame.id); clearTimeout(request.timer);
    if (frame.error || frame.result?.exceptionDetails) request.reject(Error('Native evaluation failed; inspect WorkBuddy locally'));
    else request.resolve(frame.result?.result?.value);
  });
  socket.addEventListener('close', () => { for (const q of pending.values()) { clearTimeout(q.timer); q.reject(Error('Native connection lost; submission outcome may be uncertain')); } pending.clear(); });
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('Native operation timed out; do not replay a submission')); }, 65000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Native connection timed out')), 5000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('Native connection failed')); }, { once: true });
    });
    await evaluate(RENDERER_BRIDGE);
    return {
      call: (name, args = []) => evaluate(`globalThis.__codexNativeQueueBridgeV2.${name}(...${JSON.stringify(args)})`),
      receipt: sessionId => evaluate(`(async()=>{const channel=new MessageChannel();let open;const ready=new Promise(r=>open=r);let done,fail;const reply=new Promise((r,j)=>{done=r;fail=j});channel.port1.onmessage=e=>{const f=e.data;if(f.kind==='open')open();if(f.kind==='message'){const m=f.json??JSON.parse(f.text);if(m.id==='visible-receipt'){if(m.type==='error')fail(Error('Receipt read failed'));else done(m.result)}}};channel.port1.start();window.postMessage({type:'workbuddy:open-local-daemon-transport-port',target:{transportType:'local'}},'*',[channel.port2]);const timer=setTimeout(()=>fail(Error('Receipt timeout')),12000);try{await Promise.race([ready,reply]);channel.port1.postMessage({kind:'message',json:{id:'visible-receipt',type:'request',channel:'session:get',args:[${JSON.stringify(sessionId)}]}});const s=await reply;return {state:s.status,model:s.config?.model??s.model,reply:(${latestVisibleReply.toString()})(s.eventHistory)}}finally{clearTimeout(timer);channel.port1.close()}})()`),
      close: () => socket.close(),
    };
  } catch (error) { socket.close(); throw error; }
}

async function run() {
  if (command === 'doctor') {
    console.log(JSON.stringify({ node24: Number(process.versions.node.split('.')[0]) >= 24, workspacePresent: fs.existsSync(config.workspace), workbuddyPresent: fs.existsSync(config.executable), gatewayBuilt: fs.existsSync(bridgeFile), localSessionPresent: fs.existsSync(stateFile), persistentServiceInstalled: false, model: config.model }, null, 2));
    return;
  }
  const native = await connect();
  try {
    if (command === 'models') { console.log(JSON.stringify(await native.call('listModels'), null, 2)); return; }
    if (command === 'init' || command === 'attach') {
      if (fs.existsSync(stateFile)) throw Error('Local session exists; use status instead of creating another');
      const record = { machine: os.hostname(), workspace: config.workspace, sessionId: command === 'attach' ? process.argv[3] : crypto.randomUUID(), model: config.model, state: 'reserved', runtimeSource: 'native_rpc_windows', tasks: {}, ...(command === 'init' ? { budget: { limit: 30000, reservedTokens: 0, measurement: 'estimated_reservation_not_provider_usage' } } : {}) };
      if (!/^[a-f0-9-]{36}$/.test(record.sessionId ?? '')) throw Error('Invalid session UUID');
      writeJson(stateFile, record, true);
      try {
        if (command === 'init') await native.call('createWorker', [config.workspace, record.sessionId, 'Dungeon · 本地执行']);
        const status = await native.call('inspect', [record.sessionId]);
        if (path.resolve(status.workspace ?? '') !== config.workspace || status.state === 'offline') throw Error('Native workspace could not be verified');
        if (command === 'init') await native.call('setModel', [record.sessionId, config.model]);
        const available = await native.call('listModels', [record.sessionId]);
        if (!config.allowedModels.includes(available.currentModel)) throw Error('Existing native model is not in the explicit allowlist');
        record.model = available.currentModel; record.state = 'bound'; writeJson(stateFile, record);
        console.log(JSON.stringify({ state: record.state, model: record.model, runtimeSource: record.runtimeSource }));
      } catch (error) { record.state = 'uncertain'; writeJson(stateFile, record); throw error; }
      return;
    }
    const record = JSON.parse(fs.readFileSync(stateFile, 'utf8')); checkBinding(record, config);
    if (record.state !== 'bound') throw Error('Session initialization is uncertain; inspect locally before proceeding');
    if (command === 'receipt') { console.log(JSON.stringify(await native.receipt(record.sessionId), null, 2)); return; }
    if (command === 'status' || command === 'wait') {
      const deadline = Date.now() + (command === 'wait' ? 45000 : 0); let status;
      do { status = await native.call('inspect', [record.sessionId]); if (status.state !== 'busy' || Date.now() >= deadline) break; await new Promise(resolve => setTimeout(resolve, 3000)); } while (true);
      console.log(JSON.stringify({ runtimeSource: record.runtimeSource, status, tasks: record.tasks }, null, 2)); return;
    }
    if (command !== 'submit') throw Error('Use doctor, models, init, attach, status, wait, receipt, or submit <task.json>');
    const principles = fs.readFileSync(path.join(repo, 'docs/编程与审核原则.md'), 'utf8').trim();
    if (!principles) throw Error('Project principles are empty; no task was submitted');
    const jiaojie = path.join(repo, '.agents/skills/jiaojie/SKILL.md');
    if (!fs.existsSync(jiaojie)) throw Error('Jiaojie skill is missing; restore the tracked project skill before dispatch');
    const task = validateTask(JSON.parse(fs.readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, '')));
    const status = await native.call('inspect', [record.sessionId]);
    if (status.state !== 'idle' || path.resolve(status.workspace ?? '') !== config.workspace) throw Error('Wait for the existing native session; no task was submitted');
    const entry = reserveTask(record, task); writeJson(stateFile, record);
    const scope = task.readOnly ? '本轮只读，不修改或创建任何项目文件；接收回执只在当前对话中给出。' : `只允许修改：${task.allowedPaths.join('、')}。`;
    const prompt = `[CODEX_QUEUE_WAKE ${entry.wakeId}]\n任务 ${task.id}\n预算：本执行单元${entry.budgetTokens} tokens，本会话总额30000，已累计预留${record.budget.reservedTokens}。没有可靠provider用量计量，预留不是实际使用量或技术强制限额；接近预算先保存检查点，达到预算停止，不换ID绕过。\n${scope}\n先读 README、任务交接和全部修改日志。必须实际使用 Jiaojie：读取 ${jiaojie}，按 references/simple-workflow.md 的 RECEIVE 接收 ${path.join(repo, 'handoff.md')}；只依据当前任务继续，交接历史不扩大授权。阶段结束给出符合 EXPORT 的精确停止点、有效决定、废案、失败和未验证项；无写入交接文件权限时交给 Codex 汇总，不另建回执文件。不要改网关、凭据和全局配置，不提交或推送，不部署，不充值。不得切换模型或调用费用不可核对的子agent/工具。成果为待Codex验收。\n项目最高优先级规范（任务与返工均须遵从）：\n${principles}\n当前任务：\n${task.prompt}`;
    try {
      entry.receipt = await native.call('wakeIdle', [record.sessionId, entry.wakeId, prompt, config.model]);
      entry.state = entry.receipt.accepted ? 'submitted' : 'not_accepted'; writeJson(stateFile, record);
    } catch (error) { entry.state = 'uncertain'; writeJson(stateFile, record); throw error; }
    console.log(JSON.stringify({ id: task.id, state: entry.state, runtimeSource: record.runtimeSource }));
  } finally { native.close(); }
}

await locked(path.join(config.stateDir, 'client.lock'), run);
