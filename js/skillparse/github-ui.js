/**
 * The annotator's two dialogs with GitHub (github.js): open a file of a repository as a document
 * of this page, and submit the annotation of the open document as a pull request.
 */

import { h, clear, openModal, closeModal, toast } from './ui.js';
import { S, assembled } from './core.js';
import { py } from './py.js';
import { importDocument, openImported, openSettings } from './dialogs.js';
import { token, parseRepo, repoInfo, listFiles, fileText, docSource, umrPath, submitAnnotation, whoami } from './github.js';
import { readJson, writeJson } from './local.js';
import { addStrings, t } from './i18n.js';

addStrings({
  github: 'GitHub ▾', githubOpen: '打开 GitHub 上的文件…', githubSubmit: '提交我的标注（开 pull request）…',
  githubToken: 'GitHub token', githubTokenNote: '只存在这个浏览器里，只发给 api.github.com。建议用 fine-grained token，只给要用的那个仓库：Contents 读写、Pull requests 读写（没有写权限的仓库会先 fork 到你名下，需要能建 fork 的 token）。',
  ghNoToken: '还没有 GitHub token。', ghSetToken: '去设置里填', ghRepo: '仓库（owner/name，或文件的 GitHub 地址）', ghBranch: '分支（空着就是默认分支）', ghList: '列出 .txt / .umr 文件',
  ghFile: '文件', ghNoFiles: '这个分支上没有 .txt 或 .umr 文件。', ghHow: '怎么读', ghOpenGo: '打开', ghOpenTitle: '打开 GitHub 上的文件',
  ghOpenDesc: '选仓库里的一个 .txt（原文）或 .umr 文件，在这里标注；标完用「提交我的标注」开一个 pull request。每位标注者各开各的，审定人在「审定」模式里比较、合并。',
  ghOpened: '打开了 {repo} 的 {path}（{n} 句）。标完后：GitHub ▾ → 提交我的标注。',
  ghSubmitTitle: '提交标注（pull request）', ghSubmitTo: '提交到 {repo}（{base}）：{path}', ghSubmitAs: '以 {login} 的名义，分支 annotate/{login}/…；没有这个仓库的写权限时先 fork。再次提交会更新同一个 pull request。',
  ghUnfinished: '还有 {n} 句没有图：照样可以提交，那几句是空的。', ghNote: '给审定人的话（可不写）', ghSubmitGo: '提交，开 pull request', ghPath: '文件路径（.txt 或 .umr）',
  ghStep: { fork: '正在 fork 仓库…', commit: '正在写入分支…', pull: '正在开 pull request…', merge: '正在合并…', close: '正在关闭各位标注者的 pull request…' },
  ghSubmitted: '已提交：pull request #{n}', ghUpdated: '已更新 pull request #{n}', ghView: '在 GitHub 上看',
}, {
  github: 'GitHub ▾', githubOpen: 'Open a file from GitHub…', githubSubmit: 'Submit my annotation (pull request)…',
  githubToken: 'GitHub token', githubTokenNote: 'Kept in this browser only and sent only to api.github.com. A fine-grained token for the one repository is best: Contents read and write, Pull requests read and write (without write access the repository is forked to your account first, which needs a token that may create forks).',
  ghNoToken: 'No GitHub token yet.', ghSetToken: 'Add it in Settings', ghRepo: 'Repository (owner/name, or the file\'s GitHub address)', ghBranch: 'Branch (empty: the default branch)', ghList: 'List the .txt / .umr files',
  ghFile: 'File', ghNoFiles: 'This branch has no .txt or .umr file.', ghHow: 'Read it as', ghOpenGo: 'Open', ghOpenTitle: 'Open a file from GitHub',
  ghOpenDesc: 'Pick a .txt (the text) or .umr file of a repository and annotate it here; then “Submit my annotation” opens a pull request. Each annotator opens their own, and a moderator compares and merges them in the Moderate mode.',
  ghOpened: 'Opened {path} of {repo} ({n} sentences). When done: GitHub ▾ → Submit my annotation.',
  ghSubmitTitle: 'Submit the annotation (pull request)', ghSubmitTo: 'To {repo} ({base}): {path}', ghSubmitAs: 'As {login}, on the branch annotate/{login}/…; without write access to the repository it is forked first. Submitting again updates the same pull request.',
  ghUnfinished: '{n} sentences have no graph yet: it can be submitted as it is, with those empty.', ghNote: 'A note for the moderator (optional)', ghSubmitGo: 'Submit: open the pull request', ghPath: 'File path (.txt or .umr)',
  ghStep: { fork: 'Forking the repository …', commit: 'Writing to the branch …', pull: 'Opening the pull request …', merge: 'Merging …', close: 'Closing the annotators\' pull requests …' },
  ghSubmitted: 'Submitted: pull request #{n}', ghUpdated: 'Pull request #{n} updated', ghView: 'See it on GitHub',
});

const LAST = 'skillparse_github_last';

/** The line shown instead of a form when there is no token. */
export function needToken() {
  return token() ? null : h('div', { class: 'warn row gh-no-token' }, h('span', { text: t('ghNoToken') }),
    h('button', { class: 'btn sm', text: t('ghSetToken'), onclick: openSettings }));
}

/** The repository, branch and path fields every GitHub form starts with, filled from what was used last. */
export function sourceFields(from = null) {
  const last = from || readJson(LAST, null) || {};
  const repo = h('input', { type: 'text', class: 'gh-repo', value: last.owner ? `${last.owner}/${last.repo}` : '', placeholder: 'owner/name' });
  const branch = h('input', { type: 'text', class: 'gh-branch', value: last.base || '', placeholder: 'main' });
  const path = h('input', { type: 'text', class: 'gh-path', value: last.path || '', placeholder: 'docs/example.txt' });
  /** {owner, repo, base, path} as typed (an address fills branch and path); base asked from GitHub when empty. */
  const read = async ({ needPath = true } = {}) => {
    const r = parseRepo(repo.value);
    if (!r) throw new Error(t('ghRepo'));
    if (r.base && !branch.value.trim()) branch.value = r.base;
    if (r.path && !path.value.trim()) path.value = r.path;
    const src = { owner: r.owner, repo: r.repo, base: branch.value.trim() || (await repoInfo(r)).default_branch, path: path.value.trim().replace(/^\/+/, '') };
    if (needPath && !src.path) throw new Error(t('ghPath'));
    branch.value = src.base;
    writeJson(LAST, src);
    return src;
  };
  return { repo, branch, path, read };
}

export function openFromGitHub() {
  const f = sourceFields();
  const files = h('select', { class: 'gh-files', size: 8, style: 'width:100%' });
  const how = h('select', { class: 'gh-how' });
  const err = h('div', { class: 'err' });
  const go = h('button', { class: 'btn primary gh-open-go', text: t('ghOpenGo'), disabled: true });
  let text = '';
  const formats = () => {
    const p = files.value || f.path.value;
    const isUmr = /\.umr$/i.test(p) || /^#\s*::\s*snt\d+/m.test(text);
    const graphs = /#\s*sentence level graph:\s*\n\s*\(/.test(text);
    const list = isUmr ? (graphs ? ['umr-load', 'umr'] : ['umr']) : ['txt-lines', 'txt-split'];
    clear(how, list.map((v) => h('option', { value: v, text: t({ 'txt-lines': 'fmtLines', 'txt-split': 'fmtSplit', 'umr-load': 'fmtLoad', umr: 'fmtUmr' }[v]) })));
  };
  const pick = async () => {
    err.textContent = '';
    go.disabled = true;
    try {
      if (files.value) f.path.value = files.value;
      const src = await f.read();
      text = await fileText(src, src.path, src.base);
      if (text === null) throw new Error(`${src.path}: 404`);
      formats();
      go.disabled = false;
    } catch (e) { err.textContent = e.message; }
  };
  files.addEventListener('change', pick);
  f.path.addEventListener('change', pick);
  const list = async () => {
    err.textContent = '';
    try {
      const src = await f.read({ needPath: false });
      const paths = await listFiles(src);
      clear(files, paths.map((p) => h('option', { value: p, text: p, selected: p === src.path })));
      if (!paths.length) err.textContent = t('ghNoFiles');
      else if (files.value) await pick();
    } catch (e) { err.textContent = e.message; }
  };
  go.addEventListener('click', async () => {
    err.textContent = '';
    go.disabled = true;
    try {
      const src = await f.read();
      const name = src.path.split('/').pop().replace(/\.(txt|umr)$/i, '');
      const res = await importDocument({ name, text, fmt: how.value });
      docSource(res.id, src);
      closeModal();
      await openImported(res);
      toast(t('ghOpened', { repo: `${src.owner}/${src.repo}`, path: src.path, n: res.sentences }), 9000);
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  });
  const body = h('div', { style: 'display:grid;gap:8px' },
    h('div', { class: 'note', text: t('ghOpenDesc') }), needToken(),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghRepo') }), f.repo),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghBranch') }), f.branch),
    h('div', {}, h('button', { class: 'btn gh-list', text: t('ghList'), onclick: list })),
    files,
    h('label', { class: 'gh-field' }, h('span', { text: t('ghPath') }), f.path),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghHow') }), how),
    err, h('div', {}, go));
  openModal(t('ghOpenTitle'), body, { wide: false });
}

export async function openSubmit() {
  const known = docSource(S.doc);
  const f = sourceFields(known);
  const note = h('textarea', { rows: 3, class: 'gh-note', style: 'font-family:var(--sans)' });
  const err = h('div', { class: 'err' });
  const done = h('div', { class: 'gh-done' });
  const as = h('div', { class: 'note' });
  const go = h('button', { class: 'btn primary gh-submit-go', text: t('ghSubmitGo') });
  const items = await py('items', { w: 'sentence' }).catch(() => []);
  const empty = items.filter((x) => x.status === 'new').length;
  if (token()) whoami().then((u) => { as.textContent = t('ghSubmitAs', { login: u.login }); }).catch((e) => { err.textContent = e.message; });
  go.addEventListener('click', async () => {
    err.textContent = '';
    go.disabled = true;
    try {
      const src = await f.read();
      S.umrStale = true;
      const u = await assembled(true);
      const r = await submitAnnotation(src, u.text, { note: note.value.trim(), onStep: (k) => { done.textContent = t(`ghStep.${k}`); } });
      docSource(S.doc, src);
      clear(done, h('strong', { text: t(r.updated ? 'ghUpdated' : 'ghSubmitted', { n: r.number }) }), ' ',
        h('a', { href: r.url, target: '_blank', rel: 'noopener', text: t('ghView') }));
      toast(t(r.updated ? 'ghUpdated' : 'ghSubmitted', { n: r.number }));
    } catch (e) { err.textContent = e.message; done.textContent = ''; }
    go.disabled = false;
  });
  const body = h('div', { style: 'display:grid;gap:8px' },
    needToken(),
    known ? h('div', { text: t('ghSubmitTo', { repo: `${known.owner}/${known.repo}`, base: known.base, path: umrPath(known.path) }) }) : null,
    h('label', { class: 'gh-field' }, h('span', { text: t('ghRepo') }), f.repo),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghBranch') }), f.branch),
    h('label', { class: 'gh-field' }, h('span', { text: t('ghPath') }), f.path),
    as, empty ? h('div', { class: 'warn', text: t('ghUnfinished', { n: empty }) }) : null,
    h('label', { class: 'gh-field' }, h('span', { text: t('ghNote') }), note),
    err, h('div', {}, go), done);
  openModal(t('ghSubmitTitle'), body, { wide: false });
}

/** The toolbar's GitHub menu. */
export function setupGitHub() {
  const menu = document.getElementById('menu-github');
  document.getElementById('btn-github').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', () => { menu.hidden = true; });
  menu.querySelector('[data-github="open"]').addEventListener('click', openFromGitHub);
  menu.querySelector('[data-github="submit"]').addEventListener('click', () => openSubmit().catch((e) => toast(e.message)));
}
