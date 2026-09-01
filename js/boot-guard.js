/**
 * Boot guard — a CLASSIC script, deliberately not a module and deliberately
 * not inline.
 *
 * Not a module, because the thing it most often has to report is the module
 * graph failing to load: a reporter that shares that fate reports nothing.
 *
 * Not inline, because a strict Content-Security-Policy (`script-src 'self'`
 * with no 'unsafe-inline') blocks inline scripts outright — which is exactly
 * the environment where you most need the diagnosis. As a file it runs under
 * a plain `script-src 'self'`, and the page as a whole is then strict-CSP
 * clean: nothing here evaluates strings, so no 'unsafe-eval' is ever needed.
 */

(function () {
  var why = document.getElementById('boot-error-why');
  var say = function (text) { if (!why.dataset.locked) why.textContent = text; };
  var lock = function (text) { why.textContent = text; why.dataset.locked = '1'; };

  /**
   * Report any Content-Security-Policy violation the browser sees, and name
   * where it came from.
   *
   * Uses the securitypolicyviolation event rather than probing with eval(),
   * because probing WITH eval would create the very violation it is looking
   * for — and would put a real eval call site in a page whose whole claim is
   * that it has none.
   *
   * This app ships no CSP (no header, no meta) and evaluates no strings: no
   * eval, no new Function, no string setTimeout/setInterval. It boots cleanly
   * under `script-src 'self'` with neither 'unsafe-eval' nor 'unsafe-inline'
   * — docs/verification/csp-test.js pins exactly that. So a "CSP blocks eval"
   * report in this page's console was imposed from outside it (an extension,
   * an enterprise policy, a wrapper that frames the page), and the event's
   * sourceFile says which. Blaming the page sends you hunting in the wrong
   * place, which is why this says so out loud.
   */
  var cspHits = [];
  document.addEventListener('securitypolicyviolation', function (e) {
    cspHits.push({
      directive: e.violatedDirective || e.effectiveDirective,
      blocked: e.blockedURI,
      from: e.sourceFile ? e.sourceFile + ':' + e.lineNumber : '(no source reported)',
    });
  });

  function cspSummary() {
    if (!cspHits.length) return '';
    var ours = cspHits.filter(function (h) { return (h.from || '').indexOf(location.origin) === 0; });
    var evalHit = cspHits.some(function (h) { return h.blocked === 'eval' || h.blocked === 'wasm-eval'; });
    var lines = cspHits.map(function (h) { return h.directive + ' 拦截 ' + h.blocked + ' @ ' + h.from; });
    var verdict = evalHit && !ours.length
      ? '这条 eval 拦截不是本页面造成的 —— 本页面从不使用 eval，且在 script-src \'self\'（无 unsafe-eval）下能完整启动。'
        + '来源多半是浏览器扩展或企业策略。 · That eval violation did not come from this page: it never uses '
        + 'eval and boots fine under script-src \'self\'. Look at an extension or an enterprise policy.'
      : '';
    return 'CSP: ' + lines.join(' ; ') + (verdict ? '  ' + verdict : '');
  }

  window.__cspHits = cspHits;

  if (location.protocol === 'file:') {
    lock('你是用 file:// 直接打开的 HTML。浏览器会以 CORS 为由拒绝加载 ES 模块，'
      + '所以 js/ 下的代码一行都没跑 —— 界面是静态的，任何按钮（包括语言切换）都不会有反应。'
      + '请在仓库根目录起一个本地服务器：python3 -m http.server 8899，然后访问 http://localhost:8899/'
      + '  ·  Opened over file://, so the browser blocked the ES modules and no script ran. '
      + 'Serve the folder instead: python3 -m http.server 8899 then open http://localhost:8899/');
    return;
  }

  /**
   * Walk the module graph from js/app.js and report the first file the
   * server will not serve.
   *
   * The browser tells us "the module failed to load" but never WHICH import
   * failed — that only shows up in the console/network panel. So the page
   * finds out for itself: follow every relative `from '...'` and report any
   * non-200. One missing file is the single most likely cause of a graph
   * that will not load, and naming it is the whole answer.
   */
  function probeGraph() {
    var seen = {}, queue = ['js/app.js'], bad = [], checked = 0;
    function step() {
      if (!queue.length || checked > 80) return Promise.resolve(bad);
      var path = queue.shift();
      if (seen[path]) return step();
      seen[path] = 1; checked++;
      return fetch(path, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) { bad.push(path + ' -> HTTP ' + r.status); return ''; }
        return r.text();
      }).catch(function (err) {
        bad.push(path + ' -> ' + (err && err.message)); return '';
      }).then(function (src) {
        var re = /from\s+['"](\.[^'"]+)['"]/g, m;
        var dir = path.slice(0, path.lastIndexOf('/'));
        while ((m = re.exec(src))) {
          var parts = (dir + '/' + m[1]).split('/'), out = [];
          for (var i = 0; i < parts.length; i++) {
            if (parts[i] === '.' || parts[i] === '') continue;
            if (parts[i] === '..') out.pop(); else out.push(parts[i]);
          }
          queue.push(out.join('/'));
        }
        return step();
      });
    }
    return step();
  }

  function reportGraph(prefix) {
    probeGraph().then(function (bad) {
      if (bad.length) {
        lock(prefix + ' 缺文件：' + bad.join('、') + '。请确认代码是完整的（git status / 重新 pull），'
          + '并强制刷新。  ·  Missing module(s): ' + bad.join(', ') + '. Check your checkout is complete and hard-refresh.');
      } else {
        lock(prefix + ' 所有模块文件都能取到（没有 404），所以是某个模块执行时报错了。'
            + (cspSummary() ? '  【' + cspSummary() + '】 ' : '')
          + '请打开控制台（F12）看第一条红色报错，把那一行发给我。'
          + '  ·  Every module file is reachable, so one of them threw while evaluating. '
          + 'Open the console (F12) and send me the first red error.');
      }
    });
  }

  // A module that 404s fails on its <script> element — but the element only
  // ever names the ENTRY file, never the import that actually broke, so go
  // and find the real one.
  window.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'SCRIPT') {
      lock('加载模块失败，正在查是哪一个…  ·  Module load failed, finding which one…');
      why.dataset.locked = '';           // let the graph probe replace this
      reportGraph('模块图加载失败 · module graph failed to load:');
    }
  }, true);

  // ...but a module that loads and then THROWS — a syntax error, a bad
  // import, an API the browser does not have — reports as an ordinary
  // uncaught error, which the listener above never sees. That was the gap:
  // the banner could only say "it never started", never why. Print the real
  // message, with the file and line, because that is the whole answer.
  window.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'SCRIPT') return;   // handled above
    if (!e.message) return;
    var at = e.filename ? (' @ ' + e.filename.replace(location.origin, '') + ':' + e.lineno + ':' + e.colno) : '';
    lock('模块报错 · module error:  ' + e.message + at);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    lock('未捕获的 Promise 错误 · unhandled rejection:  ' + ((r && (r.message || r)) || r));
  });

  // Report where it stopped, not merely that it stopped. A step name turns
  // "it did not finish" into something actionable: a fetch step means the
  // server or a file, a wiring step means the DOM.
  setTimeout(function () {
    var box = document.getElementById('boot-error');
    if (!box) return;
    // A real error already beat us to it — never talk over it with a guess.
    // (This ordering matters: the probe below ends in lock(), which would
    // otherwise overwrite the actual message with a vaguer one.)
    if (why.dataset.locked) return;
    var at = window.__bootStep;

    if (at && at.indexOf('fetch') !== -1) {
      say('卡在「' + at + '」—— 这一步在向本地服务器要文件。'
        + '请确认 python3 -m http.server 还活着、而且是在仓库根目录（能看到 index.html 和 js/ 的那一层）起的。'
        + '  ·  Stuck at "' + at + '", which is fetching from your local server. Check the server is still '
        + 'running and was started in the repository root.');
      return;
    }
    if (at) {
      say('卡在「' + at + '」。请打开控制台看具体报错。'
        + '  ·  Stuck at "' + at + '". Check the console for the actual error.');
      return;
    }

    // If a CSP blocked something, name it before anything else — including
    // whether it plausibly came from this page at all.
    var csp = cspSummary();

    // Nothing ran at all and no error surfaced. Rather than shrug, go and
    // find out: ask the server for the entry module and report what it
    // actually says. A 404 or an HTML error page served as JS both land
    // here, and both are invisible from the console alone.
    say('js/app.js 一步都没跑起来，正在诊断…  ·  js/app.js never started; probing…');
    fetch('js/app.js', { cache: 'no-store' }).then(function (r) {
      var ct = r.headers.get('content-type') || '(none)';
      if (!r.ok) {
        lock((csp ? csp + '  ·  ' : '') + '服务器对 js/app.js 返回 HTTP ' + r.status + '。多半是服务器不是在仓库根目录起的 —— '
          + '请在能看到 index.html 和 js/ 的那一层运行 python3 -m http.server 8899。'
          + '  ·  The server returned HTTP ' + r.status + ' for js/app.js. Start it in the repository root.');
        return;
      }
      if (ct.indexOf('javascript') === -1 && ct.indexOf('text/plain') === -1) {
        lock('js/app.js 被服务器当成 "' + ct + '" 发出来了，浏览器会拒绝把它当模块执行。'
          + '  ·  js/app.js is served as "' + ct + '", so the browser refuses to run it as a module.');
        return;
      }
      why.dataset.locked = '';
      reportGraph('js/app.js 取得到但没跑起来 · js/app.js is reachable but never ran:');
    }).catch(function (err) {
      lock('连 js/app.js 都取不到：' + (err && err.message) + '。本地服务器可能没在跑。'
        + '  ·  Could not even fetch js/app.js: ' + (err && err.message) + '. Is the local server running?');
    });
  }, 4000);
}());
