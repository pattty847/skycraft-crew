// Read the installed Codex client's catalog. Does not start a thread or model turn.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';

const child = spawn('codex', ['app-server'], {
  cwd: tmpdir(), stdio: ['pipe', 'pipe', 'ignore'],
});
const pending = new Map();
let nextId = 0;
const failPending = error => {
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
  pending.clear();
};
child.on('error', () => failPending(new Error('Could not start codex. Install/sign in to Codex CLI first.')));
child.on('exit', () => failPending(new Error('Codex app-server exited before returning the catalog.')));
child.stdin.on('error', () => failPending(new Error('Codex app-server connection closed.')));
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const request = pending.get(message.id);
  if (!request) return;
  clearTimeout(request.timer);pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);reject(new Error(`Timed out waiting for ${method}.`));
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({id,method,params})+'\n');
  });
}
try {
  await call('initialize', { clientInfo: {name:'codex_sky_block',title:'Sky Block model discovery',version:'0.1.0'} });
  child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
  const models = [];
  let cursor = null;
  do {
    const page = await call('model/list', {limit:100,includeHidden:false,...(cursor?{cursor}:{})});
    models.push(...page.data);cursor=page.nextCursor;
  } while (cursor);
  if (process.argv.includes('--json')) console.log(JSON.stringify(models,null,2));
  else console.table(models.map(model => ({
    model: model.model,
    default: model.isDefault ? 'yes' : '',
    input: model.inputModalities?.join(', ') ?? 'not reported',
    effort: model.supportedReasoningEfforts.map(item=>item.reasoningEffort).join(', '),
    upgrade: model.upgrade ?? '',
  })));
} catch (error) {
  console.error(error.message);process.exitCode=1;
} finally {
  lines.close();child.stdin.end();child.kill('SIGTERM');
  setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); },1000).unref();
}
