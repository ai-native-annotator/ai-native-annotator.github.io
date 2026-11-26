/**
 * index.html with GitHub (js/skillparse/github.js, github-ui.js, mode-moderate.js): annotation as
 * pull requests, moderation as a merge.
 *
 *   1. The token is a setting. An annotator opens a .txt file of a repository, annotates it and
 *      submits: a branch annotate/<login>/<file> with the .umr, and a pull request to the base branch.
 *   2. A second annotator, without write access, does the same through a fork; submitting again
 *      updates the same pull request.
 *   3. The moderator finds both pull requests, and the page compares them with AnCast++ (sentence,
 *      modal, temporal, coreference and comprehensive F; identical sentences); sentences everybody
 *      agrees on are taken as they are.
 *   4. A sentence that differs shows the two annotations side by side with the differing lines
 *      marked, the list of differences, and what a model says about them.
 *   5. The moderator takes one annotator's sentence, or changes it by hand (expert mode), and
 *      merges: a branch adjudicate/…, a pull request that says what was compared and decided,
 *      merged into the base branch; the annotators' pull requests are closed.
 *
 * GitHub is a stand-in kept in this script (a repository, its branches, files and pull requests);
 * models are stand-ins (_skillparse-mocks.js); Pyodide comes from the CDN.
 * Run: npm run test:browser -- github-test.js
 */
const { launchBrowser } = require('./_browser');
const BASE = process.env.BASE || 'http://localhost:8899';

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  (ok ? pass++ : fail++);
  console.log(`  ${ok ? '✓' : '✖'} ${label}${extra ? '\n      ' + extra : ''}`);
};

/** A GitHub of one repository, acme/corpus, with what the page asks of it. */
function fakeGitHub() {
  const users = { 'tok-alice': { login: 'alice', push: true }, 'tok-bob': { login: 'bob', push: false }, 'tok-mod': { login: 'mona', push: true } };
  const repos = { 'acme/corpus': { branches: { main: { 'docs/turtle.txt': '玳瑁是海龟。\n它们吃海绵。\n海绵很多。\n', 'README.md': '# corpus\n' } } } };
  const pulls = [];
  const comments = [];
  const log = [];
  const sha = (text) => { let n = 7; for (const c of String(text)) n = (n * 33 + c.charCodeAt(0)) >>> 0; return n.toString(16).padStart(8, '0').repeat(5); };
  const head = (r, b) => sha(JSON.stringify(repos[r].branches[b]) + b);
  const pullJson = (p) => ({ number: p.number, title: p.title, body: p.body, state: p.state, html_url: `https://github.com/acme/corpus/pull/${p.number}`,
    user: { login: p.login }, updated_at: '2026-11-26T00:00:00Z', merged: p.merged,
    head: { ref: p.branch, sha: head(p.repo, p.branch), repo: { name: p.repo.split('/')[1], owner: { login: p.repo.split('/')[0] } } }, base: { ref: p.base } });
  async function handle(route) {
    const req = route.request();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const user = users[(req.headers().authorization || '').replace('Bearer ', '')];
    if (!user) return json(401, { message: 'Bad credentials' });
    const url = new URL(req.url());
    const path = decodeURIComponent(url.pathname);
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    log.push(`${user.login} ${req.method()} ${path}`);
    if (path === '/user') return json(200, { login: user.login });
    const m = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(path);
    const repo = m && repos[m[1]];
    if (!m) return json(404, { message: 'Not Found' });
    const rest = m[2] || '';
    if (rest === '/forks' && req.method() === 'POST') {
      const mine = `${user.login}/${m[1].split('/')[1]}`;
      repos[mine] ||= { branches: JSON.parse(JSON.stringify(repo.branches)) };
      return json(202, { full_name: mine });
    }
    if (!repo) return json(404, { message: 'Not Found' });
    const writes = m[1].startsWith(user.login + '/') || (m[1] === 'acme/corpus' && user.push);
    if (rest === '') return json(200, { default_branch: 'main', permissions: { push: writes } });
    let x;
    if ((x = /^\/git\/trees\/(.+)$/.exec(rest))) return json(200, { tree: Object.keys(repo.branches[x[1]] || {}).map((p) => ({ path: p, type: 'blob' })) });
    if ((x = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) return repo.branches[x[1]] ? json(200, { object: { sha: head(m[1], x[1]) } }) : json(404, { message: 'Not Found' });
    if (rest === '/git/refs' && req.method() === 'POST') {
      if (!writes) return json(403, { message: 'Resource not accessible' });
      const from = Object.keys(repos['acme/corpus'].branches).find((b) => head('acme/corpus', b) === body.sha) ? 'main' : null;
      repo.branches[body.ref.replace('refs/heads/', '')] = JSON.parse(JSON.stringify((from ? repos['acme/corpus'] : repo).branches.main));
      return json(201, { ref: body.ref });
    }
    if ((x = /^\/contents\/(.+)$/.exec(rest))) {
      if (req.method() === 'PUT') {
        if (!writes) return json(403, { message: 'Resource not accessible' });
        const had = repo.branches[body.branch]?.[x[1]];
        if (had !== undefined && body.sha !== sha(had)) return json(409, { message: 'sha does not match' });
        repo.branches[body.branch][x[1]] = Buffer.from(body.content, 'base64').toString('utf8');
        return json(200, { content: { path: x[1] } });
      }
      const ref = url.searchParams.get('ref');
      const branch = repo.branches[ref] ? ref : Object.keys(repo.branches).find((b) => head(m[1], b) === ref);
      const text = repo.branches[branch]?.[x[1]];
      if (text === undefined) return json(404, { message: 'Not Found' });
      if ((req.headers().accept || '').includes('raw')) return route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' }, body: text });
      return json(200, { sha: sha(text), path: x[1] });
    }
    if (rest === '/pulls' && req.method() === 'POST') {
      const [owner, branch] = body.head.includes(':') ? body.head.split(':') : ['acme', body.head];
      const p = { number: pulls.length + 1, title: body.title, body: body.body, state: 'open', login: user.login, repo: `${owner}/corpus`, branch, base: body.base, merged: false };
      pulls.push(p);
      return json(201, pullJson(p));
    }
    if (rest === '/pulls') {
      const want = url.searchParams.get('head');
      return json(200, pulls.filter((p) => p.state === 'open' && (!want || want === `${p.repo.split('/')[0]}:${p.branch}`)).map(pullJson));
    }
    if ((x = /^\/pulls\/(\d+)\/files$/.exec(rest))) {
      const p = pulls[Number(x[1]) - 1];
      const mine = repos[p.repo].branches[p.branch];
      return json(200, Object.keys(mine).filter((f) => mine[f] !== repo.branches[p.base][f]).map((filename) => ({ filename })));
    }
    if ((x = /^\/pulls\/(\d+)\/merge$/.exec(rest))) {
      const p = pulls[Number(x[1]) - 1];
      if (!user.push) return json(403, { message: 'Resource not accessible' });
      Object.assign(repo.branches[p.base], repos[p.repo].branches[p.branch]);
      Object.assign(p, { state: 'closed', merged: true });
      return json(200, { merged: true });
    }
    if ((x = /^\/pulls\/(\d+)$/.exec(rest)) && req.method() === 'PATCH') {
      Object.assign(pulls[Number(x[1]) - 1], body);
      return json(200, pullJson(pulls[Number(x[1]) - 1]));
    }
    if ((x = /^\/issues\/(\d+)\/comments$/.exec(rest))) {
      comments.push({ number: Number(x[1]), body: body.body, login: user.login });
      return json(201, {});
    }
    return json(404, { message: `Not Found: ${req.method()} ${path}` });
  }
  return { handle, repos, pulls, comments, log };
}

(async () => {
  const { calls, systemone, chat } = require('./_skillparse-mocks.js')();
  const hub = fakeGitHub();
  const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1'] : [];
  const browser = await launchBrowser({ args: proxy });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, locale: 'zh-CN' });
  await ctx.route('https://openrouter.ai/api/v1/systemone', systemone);
  await ctx.route('https://openrouter.ai/api/v1/chat/completions', chat);
  await ctx.route('https://api.github.com/**', hub.handle);
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('annotator_secrets')) localStorage.setItem('annotator_secrets', JSON.stringify({ apiKeys: { openrouter: 'test-key' } }));
    localStorage.setItem('skillparse_lang', 'zh');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const settled = async () => {
    await page.waitForTimeout(150);
    await page.waitForFunction(() => (document.body.dataset.running || '0') === '0', null, { timeout: 180000 });
    await page.waitForTimeout(400);
  };
  const mode = async (m) => { await page.click(`#mode-switch button[data-mode="${m}"]`); await settled(); };
  const asUser = (tok) => page.evaluate((v) => {
    const s = JSON.parse(localStorage.getItem('annotator_secrets'));
    s.github = v;
    localStorage.setItem('annotator_secrets', JSON.stringify(s));
  }, tok);
  const openFile = async () => {
    await page.click('#btn-github');
    await page.click('#menu-github [data-github="open"]');
    await page.fill('#modal .gh-repo', 'acme/corpus');
    await page.click('#modal .gh-list');
    await page.waitForSelector('#modal .gh-files option');
    const listed = await page.$$eval('#modal .gh-files option', (o) => o.map((x) => x.value));
    await page.selectOption('#modal .gh-files', 'docs/turtle.txt');
    await page.waitForSelector('#modal .gh-open-go:not([disabled])');
    await page.click('#modal .gh-open-go');
    await page.waitForFunction(() => document.getElementById('doc').value === 'turtle' && document.getElementById('modal').hidden
      && /就绪/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
    return listed;
  };
  const generate = async () => {
    await mode('expert');
    await page.waitForSelector('.fx-start .fx-generate');
    await page.click('.fx-start .fx-generate');
    await page.waitForFunction(() => document.querySelectorAll('.fx-sentences li.made').length === 3, null, { timeout: 120000 });
    await settled();
  };
  const submit = async () => {
    await page.click('#btn-github');
    await page.click('#menu-github [data-github="submit"]');
    await page.waitForSelector('#modal .gh-submit-go');
    await page.click('#modal .gh-submit-go');
    await page.waitForSelector('#modal .gh-done a', { timeout: 30000 });
    const text = await page.textContent('#modal .gh-done');
    await page.click('#modal-close');
    return text;
  };

  await page.goto(`${BASE}/index.html`);
  await page.waitForFunction(() => /就绪/.test(document.getElementById('status').textContent), null, { timeout: 180000 });

  // ---- 1. alice: the token, a file opened, annotated, submitted
  console.log('\n1. an annotator with write access');
  await page.click('#btn-settings');
  await page.fill('#key-github', 'tok-alice');
  await page.click('#modal button:text-is("保存")');
  check('the GitHub token is a setting, kept with the keys in this browser',
    await page.evaluate(() => JSON.parse(localStorage.getItem('annotator_secrets')).github === 'tok-alice'));
  const listed = await openFile();
  check('the files of the repository are listed (.txt and .umr only), and one opens as a document',
    listed.join() === 'docs/turtle.txt' && await page.evaluate(() => document.getElementById('doc').value === 'turtle'), listed.join());
  await generate();
  let done = await submit();
  const alicePull = hub.pulls[0];
  const aliceFile = hub.repos['acme/corpus'].branches['annotate/alice/docs-turtle']?.['docs/turtle.umr'] || '';
  check('submitting writes the .umr to the branch annotate/<login>/<file> and opens a pull request to the base branch',
    /pull request #1/.test(done) && alicePull?.branch === 'annotate/alice/docs-turtle' && alicePull.base === 'main' && alicePull.login === 'alice'
      && /# :: snt1/.test(aliceFile) && /\(s2x \/ 它-01/.test(aliceFile) && /:coref \(\(s1x :same-event s2x\)\)/.test(aliceFile), `${done} · ${JSON.stringify(alicePull)}`);
  check('the base branch is untouched', hub.repos['acme/corpus'].branches.main['docs/turtle.umr'] === undefined);

  // ---- 2. bob: no write access, a fork; his annotation differs in sentence 2
  console.log('\n2. an annotator without write access');
  await asUser('tok-bob');
  await mode('manual');
  await openFile();
  await generate();
  await page.click('.fx-sentences li >> nth=1');
  await page.waitForSelector('.fx-rel');
  await page.locator('.fx-rel-group:has(.fx-rel-name:text-is("共指")) .fx-rel').first().locator('select.fx-rel-label').selectOption('subset-of');
  await settled();
  await page.click('.fx-graph > summary');
  await page.waitForSelector('.fx-graph .graph-svg [data-var="s2x"] .g-concept.editable');
  await page.click('.fx-graph .graph-svg [data-var="s2x"] .g-concept.editable');
  await page.fill('.fx-pop-input', '它们-01');
  await page.press('.fx-pop-input', 'Enter');
  await settled();
  done = await submit();
  const bobFile = hub.repos['bob/corpus']?.branches['annotate/bob/docs-turtle']?.['docs/turtle.umr'] || '';
  check('without write access the repository is forked, and the pull request comes from the fork',
    /pull request #2/.test(done) && hub.pulls[1]?.repo === 'bob/corpus' && /它们-01/.test(bobFile) && /:subset-of/.test(bobFile)
      && hub.log.some((l) => l === 'bob POST /repos/acme/corpus/forks'), `${done} · ${JSON.stringify(hub.pulls[1])}`);
  done = await submit();
  check('submitting again updates the same pull request', /pull request #2/.test(done) && /已更新/.test(done) && hub.pulls.length === 2, done);

  // ---- 3. the moderator
  console.log('\n3. the moderator: the pull requests found and compared');
  await asUser('tok-mod');
  await mode('moderate');
  await page.waitForSelector('.md-setup .md-find');
  check('the setup starts from the file the open document came from',
    await page.inputValue('.md-setup .gh-repo') === 'acme/corpus' && await page.inputValue('.md-setup .gh-path') === 'docs/turtle.txt');
  await page.click('.md-setup .md-find');
  await page.waitForSelector('.md-pulls li');
  const found = await page.$$eval('.md-pulls li', (e) => e.map((x) => x.textContent));
  check('both annotators\' pull requests are found', found.length === 2 && /alice#1/.test(found[0]) && /bob#2/.test(found[1]), found.join(' | '));
  await page.click('.md-setup .md-start');
  await page.waitForSelector('.md-main .md-cols', { timeout: 120000 });
  await settled();
  const table = await page.$$eval('.md-agreement tbody tr', (r) => r.map((x) => [...x.querySelectorAll('td')].map((c) => c.textContent).join(' | ')));
  const heads = await page.$$eval('.md-agreement thead th', (h) => h.map((x) => x.textContent).join('|'));
  const cells = (table[0] || '').split(' | ');
  check('the agreement of the two by AnCast++: sentence graphs, modal, temporal, coreference, comprehensive; and the identical sentences',
    heads === '|句级图|情态|时间|共指|综合|完全一致的句子' && table.length === 1 && cells[0] === 'alice · bob' && cells.slice(1, 6).every((c) => /^\d+\.\d$/.test(c))
      && Number(cells[1]) < 100 && Number(cells[1]) > 50 && cells[2] === '100.0' && Number(cells[4]) < 100 && Number(cells[5]) < 100 && cells[6] === '2/3', `${heads} || ${table.join(' || ')}`);
  const list = await page.$$eval('.md-list .fx-sentences li', (e) => e.map((x) => `${x.className}:${x.textContent}`));
  check('sentences everybody agrees on are taken as they are; the one that differs is open, with its F',
    /^seen:✓1/.test(list[0]) && /^new:○2.*\d\d\.\d$/.test(list[1]) && /^seen:✓3/.test(list[2]), list.join(' || '));
  check('the page opens on the first sentence that differs, in a document of its own',
    /第 2 句/.test(await page.textContent('.md-main .fx-title')) && await page.evaluate(() => document.getElementById('doc').value === 'turtle.moderated'));

  // ---- 4. one sentence, side by side
  console.log('\n4. a sentence that differs');
  const cols = await page.$$eval('.md-col', (e) => e.map((c) => ({ who: c.querySelector('.md-who').textContent,
    marked: [...c.querySelectorAll('.md-diff')].map((x) => x.textContent.trim()), text: c.querySelector('.md-text').textContent })));
  check('the two annotations side by side, the lines that differ marked',
    cols.length === 2 && cols[0].who === 'alice' && cols[1].who === 'bob' && cols[0].marked.some((l) => /它-01/.test(l)) && cols[1].marked.some((l) => /它们-01/.test(l))
      && cols[0].marked.some((l) => /:same-event/.test(l)) && cols[1].marked.some((l) => /:subset-of/.test(l)), JSON.stringify(cols));
  const diffs = await page.$$eval('.md-differences tbody tr', (r) => r.map((x) => [...x.querySelectorAll('td')].map((c) => c.textContent).join(' | ')));
  check('the differences are listed: the concept, and the document-level label',
    diffs.some((d) => /^概念 \|.*\| 它-01 \| 它们-01$/.test(d)) && diffs.some((d) => /^文档级关系的标签 \| coref.*\| :same-event \| :subset-of$/.test(d)), diffs.join(' || '));
  await page.click('.md-ask');
  await page.waitForSelector('.md-remark-list li', { timeout: 60000 });
  await settled();
  const remark = await page.textContent('.md-remarks');
  check('a model goes through the differences and says which it prefers, and why; it was given both annotations and the list',
    /倾向 alice/.test(remark) && /A 符合规范/.test(remark) && /### Annotation A[\s\S]*### Annotation B[\s\S]*1\. concept/.test(calls.compared?.[0] || ''), remark);

  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });

  // ---- 5. deciding and merging
  console.log('\n5. deciding, and merging');
  check('nothing is decided for it yet', /还没定/.test(await page.textContent('.md-result')));
  await page.click('.md-col.md-b .md-use');
  await page.waitForSelector('.md-col.md-b.used', { timeout: 60000 });
  await settled();
  check('one annotator\'s sentence is taken: the merged version has it', /取自 bob/.test(await page.textContent('.md-result'))
    && /它们-01[\s\S]*:subset-of/.test(await page.textContent('.md-result pre')), await page.textContent('.md-result'));
  await page.click('.md-col.md-a .md-use');
  await page.waitForSelector('.md-col.md-a.used', { timeout: 60000 });
  await settled();
  check('and the other one instead', /取自 alice/.test(await page.textContent('.md-result')) && /它-01[\s\S]*:same-event/.test(await page.textContent('.md-result pre')));
  await page.click('.md-edit');
  await settled();
  await page.waitForSelector('.fx-graph > summary');
  if (!(await page.evaluate(() => document.querySelector('.fx-graph').open))) await page.click('.fx-graph > summary');
  await page.waitForSelector('.fx-graph .graph-svg [data-var="s2x"] .g-concept.editable');
  await page.click('.fx-graph .graph-svg [data-var="s2x"] .g-concept.editable');
  await page.fill('.fx-pop-input', '吃-01');
  await page.press('.fx-pop-input', 'Enter');
  await settled();
  await mode('moderate');
  await page.waitForSelector('.md-result');
  await page.waitForFunction(() => /手动改过/.test(document.querySelector('.md-result')?.textContent || ''), null, { timeout: 30000 });
  check('or changed by hand in the expert mode: the merged version says so', /取自 alice，之后手动改过/.test(await page.textContent('.md-result'))
    && /吃-01/.test(await page.textContent('.md-result pre')), await page.textContent('.md-result'));
  await page.click('.md-merge');
  await page.waitForSelector('#modal .md-merge-go');
  check('everything is decided: no warning before merging', !(await page.$('#modal .md-left')));
  await page.click('#modal .md-merge-go');
  await page.waitForSelector('#modal .gh-done a', { timeout: 30000 });
  const merged = await page.textContent('#modal .gh-done');
  const main = hub.repos['acme/corpus'].branches.main['docs/turtle.umr'] || '';
  const mergePull = hub.pulls[2];
  check('the merged version is on the base branch, through a branch adjudicate/… and a pull request of its own',
    /已合并：pull request #3/.test(merged) && mergePull?.merged && /^adjudicate\/docs-turtle-\d{8}-\d{6}$/.test(mergePull.branch)
      && /\(s2x \/ 吃-01/.test(main) && /\(s1x \/ 玳-01/.test(main) && /\(s3x \/ 海-01/.test(main) && /:same-event/.test(main), `${merged} · ${mergePull?.branch}`);
  check('its description says what was compared, the agreement, and whose each sentence is',
    /alice: #1/.test(mergePull.body) && /bob: #2/.test(mergePull.body) && /AnCast\+\+ F/.test(mergePull.body) && /\| alice · bob \| \d+\.\d \| 100\.0 \|/.test(mergePull.body)
      && /identical in all annotations: 2 sentences/.test(mergePull.body) && /alice, changed by the moderator: sentence 2/.test(mergePull.body), mergePull.body);
  check('the annotators\' pull requests are closed, each with a note that names the merge',
    hub.pulls[0].state === 'closed' && hub.pulls[1].state === 'closed' && !hub.pulls[0].merged
      && hub.comments.length === 2 && hub.comments.every((c) => /#3/.test(c.body)), JSON.stringify(hub.comments));
  await page.click('#modal-close');

  // the page loaded again: what was fetched and decided is still there
  await page.waitForTimeout(2500);        // the work is kept a moment after the last change
  await page.reload();
  await page.waitForSelector('#modal .restore-yes', { timeout: 180000 }).catch(async (e) => {
    console.log('      status:', await page.textContent('#status'), '· doc:', await page.evaluate(() => document.getElementById('doc').value), '· focus:', (await page.textContent('#focus')).slice(0, 300));
    throw e;
  });
  await page.click('#modal .restore-yes');
  await page.waitForSelector('.md-main .md-cols', { timeout: 120000 });
  const again = await page.$$eval('.md-list .fx-sentences li', (e) => e.map((x) => x.className).join());
  check('after a reload the moderation is as it was left', again === 'seen,made,seen' && /pull request #3/.test(await page.textContent('.md-merged')), again);

  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
