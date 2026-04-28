import { chromium } from 'playwright';

const analyzeConsoleMessage = (text) => {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('hydration') || lowerText.includes('did not match')) {
    return {
      causes: ['SSR/CSR 渲染输出不一致（常见于依赖随机数、时间、浏览器 API 的渲染）'],
      fixes: [
        '确保首屏渲染是确定性的：不要在渲染阶段读取 Date/Math.random/window/localStorage',
        '把只在客户端可得的数据放到 useEffect 后再 setState 渲染',
      ],
    };
  }

  if (lowerText.includes('failed to fetch')) {
    return {
      causes: ['接口不可达、CORS、或浏览器拦截导致 fetch 失败'],
      fixes: [
        '检查 Network 里对应请求是否被阻止、是否跨域、是否 4xx/5xx',
        '确认后端/Next Route 是否已启动并监听正确端口',
      ],
    };
  }

  if (lowerText.includes('typeerror') && lowerText.includes('cannot read')) {
    return {
      causes: ['访问了 undefined/null 的属性，数据未就绪或字段名不匹配'],
      fixes: [
        '对可空数据做判空/可选链，或为接口响应加 zod/类型校验',
        '检查该字段是否来自异步请求，加载态时不要直接读取深层字段',
      ],
    };
  }

  if (lowerText.includes('referenceerror')) {
    return {
      causes: ['变量/函数未定义（常见于缺失 import、拼写错误）'],
      fixes: ['检查报错行附近的 import 与变量命名', '确保运行环境具备该全局对象（如 window 仅客户端存在）'],
    };
  }

  return {
    causes: ['前端运行时异常或第三方脚本异常'],
    fixes: ['根据报错堆栈定位到具体文件/行号，再针对性修复', '如果来自第三方脚本，先确认是否可忽略或需要降级处理'],
  };
};

const analyzeRequest = ({ status, errorText }) => {
  if (typeof status === 'number') {
    if (status === 401) {
      return {
        causes: ['未登录或 Token/Session 失效导致鉴权失败'],
        fixes: ['检查请求是否带上 cookie/Authorization', '检查 Next middleware/接口鉴权逻辑与环境变量配置'],
      };
    }
    if (status === 403) {
      return {
        causes: ['权限不足或被服务端拒绝'],
        fixes: ['检查当前用户权限与后端 RBAC/ACL', '确认接口是否限制来源/CSRF 校验是否通过'],
      };
    }
    if (status === 404) {
      return {
        causes: ['请求的路由/接口不存在或路径写错'],
        fixes: ['确认 Next Route 文件路径与请求 URL 完全匹配', '检查 baseURL、反向代理、环境变量是否正确'],
      };
    }
    if (status >= 500) {
      return {
        causes: ['服务端异常（Next Route 抛错、数据库/第三方依赖失败）'],
        fixes: ['查看服务端日志定位具体异常栈', '重点检查最近改动的 API handler、数据库连接、环境变量'],
      };
    }
    if (status >= 400) {
      return {
        causes: ['请求参数不合法或业务校验失败'],
        fixes: ['查看响应体的错误信息与字段校验提示', '对照后端接口要求检查请求体/查询参数/headers'],
      };
    }
  }

  if (errorText) {
    if (errorText.includes('ERR_CONNECTION_REFUSED')) {
      return { causes: ['目标服务未启动或端口不通'], fixes: ['确认服务已启动且端口正确', '检查本机防火墙/代理设置'] };
    }
    if (errorText.includes('ERR_NAME_NOT_RESOLVED')) {
      return { causes: ['域名解析失败'], fixes: ['检查域名/hosts', '确认网络可用与 DNS 设置'] };
    }
    if (errorText.includes('ERR_BLOCKED_BY_CLIENT')) {
      return { causes: ['被浏览器插件/拦截器阻止'], fixes: ['关闭相关插件（广告拦截）重试', '把该域名加入白名单'] };
    }
  }

  return { causes: ['网络层失败或请求被中断'], fixes: ['检查 Network 里该请求的详细错误', '确认接口地址、协议、代理设置无误'] };
};

const toIssueText = ({ error, trigger, causes, fixes }) => {
  const causesText = causes?.length ? causes.map((c) => `- ${c}`).join('\n') : '- 无法判断';
  const fixesText = fixes?.length ? fixes.map((f) => `- ${f}`).join('\n') : '- 无法判断';
  return [
    `错误信息：${error}`,
    `触发操作：${trigger}`,
    `可能原因：\n${causesText}`,
    `修复建议：\n${fixesText}`,
  ].join('\n');
};

const run = async () => {
  const url = process.argv[2];
  if (!url) {
    process.stderr.write('用法：npm run diagnose:browser -- http://localhost:3000\n');
    process.exit(2);
  }

  const isHeadless = process.env.HEADLESS === '0' ? false : true;
  const timeoutMs = Number(process.env.TIMEOUT_MS ?? 60_000);

  const browser = await chromium.launch({ headless: isHeadless });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleEntries = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const location = msg.location();
    consoleEntries.push({
      type,
      text: msg.text(),
      location,
    });
  });

  page.on('pageerror', (err) => {
    pageErrors.push({
      message: err?.message ?? String(err),
      stack: err?.stack,
    });
  });

  page.on('requestfailed', (request) => {
    const failure = request.failure();
    failedRequests.push({
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      errorText: failure?.errorText,
    });
  });

  page.on('response', async (response) => {
    const status = response.status();
    if (status < 400) return;
    const request = response.request();
    const contentType = response.headers()['content-type'] ?? '';
    let bodyPreview;
    try {
      if (contentType.includes('application/json')) {
        const json = await response.json();
        bodyPreview = JSON.stringify(json).slice(0, 800);
      } else {
        const text = await response.text();
        bodyPreview = text.slice(0, 800);
      }
    } catch {
      bodyPreview = undefined;
    }
    badResponses.push({
      method: request.method(),
      url: response.url(),
      status,
      bodyPreview,
    });
  });

  const actions = [`打开页面 ${url}`];

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  } catch (err) {
    const message = err?.message ?? String(err);
    await browser.close();
    process.stdout.write(
      `${toIssueText({
        error: message,
        trigger: actions[actions.length - 1],
        ...analyzeRequest({ status: undefined, errorText: message }),
      })}\n`,
    );
    process.exit(1);
  }

  await page
    .waitForLoadState('networkidle', { timeout: Math.min(15_000, timeoutMs) })
    .catch(() => undefined);
  await page.waitForTimeout(1500);

  const issues = [];

  for (const entry of consoleEntries) {
    const locationText =
      entry.location?.url && entry.location?.lineNumber
        ? ` (${entry.location.url}:${entry.location.lineNumber}:${entry.location.columnNumber ?? 0})`
        : '';
    const error = `[console.${entry.type}] ${entry.text}${locationText}`;
    const analysis = analyzeConsoleMessage(entry.text);
    issues.push(
      toIssueText({
        error,
        trigger: actions[0],
        causes: analysis.causes,
        fixes: analysis.fixes,
      }),
    );
  }

  for (const err of pageErrors) {
    const error = err.stack ? `[pageerror] ${err.message}\n${err.stack}` : `[pageerror] ${err.message}`;
    const analysis = analyzeConsoleMessage(err.message);
    issues.push(
      toIssueText({
        error,
        trigger: actions[0],
        causes: analysis.causes,
        fixes: analysis.fixes,
      }),
    );
  }

  for (const req of failedRequests) {
    const errorText = req.errorText ? ` ${req.errorText}` : '';
    const error = `[requestfailed] ${req.method} ${req.url}${errorText}`;
    const analysis = analyzeRequest({ status: undefined, errorText: req.errorText });
    issues.push(
      toIssueText({
        error,
        trigger: actions[0],
        causes: analysis.causes,
        fixes: analysis.fixes,
      }),
    );
  }

  for (const resp of badResponses) {
    const previewText = resp.bodyPreview ? `\n响应预览：${resp.bodyPreview}` : '';
    const error = `[response] ${resp.method} ${resp.url} -> ${resp.status}${previewText}`;
    const analysis = analyzeRequest({ status: resp.status, errorText: undefined });
    issues.push(
      toIssueText({
        error,
        trigger: actions[0],
        causes: analysis.causes,
        fixes: analysis.fixes,
      }),
    );
  }

  await browser.close();

  if (issues.length === 0) {
    process.stdout.write('未检测到 Console error/warn 或 Network 失败请求。\n');
    process.exit(0);
  }

  const uniqueIssues = Array.from(new Set(issues));
  const output = uniqueIssues
    .map((issue, index) => `#${index + 1}\n${issue}`)
    .join('\n\n');
  process.stdout.write(`${output}\n`);
  process.exit(1);
};

run().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});

