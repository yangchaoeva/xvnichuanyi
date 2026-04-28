import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_POLL_INTERVAL_MS = 1000;

const parseArgs = () => {
  const cliUrl = process.argv[2];
  const url = cliUrl || process.env.DIAGNOSE_URL || DEFAULT_URL;
  const timeoutMs = Number(process.env.DIAGNOSE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { url, timeoutMs };
};

const isWindows = process.platform === 'win32';

const createCommand = (command, args) => ({
  command: isWindows ? 'cmd.exe' : command,
  args: isWindows ? ['/d', '/s', '/c', `${command} ${args.join(' ')}`] : args,
});

const runCommand = (command, args, options = {}) => {
  const { command: runner, args: runnerArgs } = createCommand(command, args);
  const child = spawn(runner, runnerArgs, {
    cwd: options.cwd,
    stdio: options.stdio ?? 'inherit',
    env: options.env ?? process.env,
  });
  return child;
};

const waitForUrlReady = async (url, timeoutMs) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // 服务尚未就绪，继续轮询
    }

    await delay(DEFAULT_POLL_INTERVAL_MS);
  }

  return false;
};

const terminateProcess = async (child) => {
  if (!child || child.killed) return;

  if (isWindows) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    await new Promise((resolve) => {
      killer.on('close', resolve);
      killer.on('error', resolve);
    });
    return;
  }

  child.kill('SIGTERM');
  await delay(800);
  if (!child.killed) {
    child.kill('SIGKILL');
  }
};

const isConnectionRefusedText = (text) => {
  const lower = String(text || '').toLowerCase();
  return lower.includes('err_connection_refused') || lower.includes('econnrefused');
};

const run = async () => {
  const { url, timeoutMs } = parseArgs();
  process.stdout.write(`[diagnose-local] 目标地址: ${url}\n`);

  const ready = await waitForUrlReady(url, 2500);
  if (ready) {
    process.stdout.write('[diagnose-local] 检测到服务已在运行，直接执行诊断。\n');
    const diagnose = runCommand('npm', ['run', 'diagnose:browser', '--', url], { stdio: 'pipe' });
    let output = '';

    diagnose.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    diagnose.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    const code = await new Promise((resolve) => diagnose.on('close', resolve));
    if (code === 0) process.exit(0);
    if (isConnectionRefusedText(output)) {
      process.stderr.write('[diagnose-local] 诊断时服务中断，请重试该命令。\n');
    }
    process.exit(code ?? 1);
  }

  process.stdout.write('[diagnose-local] 服务未运行，准备自动启动 npm run dev ...\n');

  const devProcess = runCommand('npm', ['run', 'dev'], { stdio: 'inherit' });
  let finalized = false;

  const cleanup = async () => {
    if (finalized) return;
    finalized = true;
    await terminateProcess(devProcess);
  };

  const exitWith = async (code) => {
    await cleanup();
    process.exit(code);
  };

  process.on('SIGINT', async () => {
    process.stderr.write('\n[diagnose-local] 收到中断信号，正在清理进程...\n');
    await exitWith(130);
  });

  process.on('SIGTERM', async () => {
    process.stderr.write('\n[diagnose-local] 收到终止信号，正在清理进程...\n');
    await exitWith(143);
  });

  const started = await waitForUrlReady(url, timeoutMs);
  if (!started) {
    process.stderr.write(`[diagnose-local] 超时：${timeoutMs}ms 内未检测到服务可访问。\n`);
    await exitWith(1);
    return;
  }

  process.stdout.write('[diagnose-local] 服务已就绪，开始执行浏览器诊断...\n');
  const diagnose = runCommand('npm', ['run', 'diagnose:browser', '--', url], { stdio: 'pipe' });

  let diagnoseOutput = '';
  diagnose.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    diagnoseOutput += text;
    process.stdout.write(text);
  });
  diagnose.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    diagnoseOutput += text;
    process.stderr.write(text);
  });

  const diagnoseCode = await new Promise((resolve) => diagnose.on('close', resolve));
  if ((diagnoseCode ?? 1) !== 0 && isConnectionRefusedText(diagnoseOutput)) {
    process.stderr.write('[diagnose-local] 诊断阶段检测到连接拒绝，可能是 dev 进程启动后异常退出。\n');
  }

  await exitWith(diagnoseCode ?? 1);
};

run().catch(async (error) => {
  process.stderr.write(`[diagnose-local] 运行异常: ${error?.stack ?? error}\n`);
  process.exit(1);
});

