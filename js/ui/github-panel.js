/**
 * GitHub connect + browse panel: sign in with a token, pick a repo (or one
 * of its forks) and branch, load an annotation file from it, or push the
 * current document there. This is also the entry point into the
 * inter-annotator merge flow (ui/iaa.js), which needs two branches/forks of
 * the same repo to compare.
 */

import { el, $ } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { describeError } from '../core/log.js';
import { toast } from './toast.js';
import {
  connectGithub, disconnectGithub, isConnected, listNetwork, listBranches,
  importFromGithubFile, getFile, putFile,
} from '../io/github.js';
import { exportDocument } from '../io/sources.js';
import { openIaa } from './iaa.js';

export function openGithubPanel(onLoadDoc) {
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => overlay.remove();
  const body = el('div', { class: 'modal-body' });
  overlay.append(el('div', { class: 'modal github-modal' },
    el('div', { class: 'modal-head' }, el('h3', {}, ' GitHub'), el('button', { class: 'btn sm ghost', onclick: close }, '关闭')),
    body));
  document.body.append(overlay);
  renderBody(body, onLoadDoc);
}

function renderBody(body, onLoadDoc) {
  body.innerHTML = '';
  if (!isConnected()) {
    const tokenInput = el('input', { class: 'settings-input', type: 'password', placeholder: 'ghp_... 或 github_pat_...' });
    const status = el('span', { class: 'edit-status' });
    const connect = async () => {
      status.textContent = '验证中…'; status.className = 'edit-status';
      try {
        await connectGithub(tokenInput.value);
        toast('已连接 GitHub');
        renderBody(body, onLoadDoc);
      } catch (err) { status.textContent = describeError(err); status.className = 'edit-status err'; }
    };
    body.append(
      el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, 'Personal Access Token'), tokenInput,
        el('button', { class: 'btn sm', onclick: connect }, '连接')),
      el('div', { class: 'hint' }, '需要 repo 权限。也可以在「⚙ 设置」里预先填好并保存。'),
      status);
    return;
  }

  body.append(el('div', { class: 'gh-user-row' },
    `已连接：@${state.github.user.login}`,
    el('button', { class: 'btn sm ghost', onclick: () => { disconnectGithub(); renderBody(body, onLoadDoc); } }, '断开')));

  const repoInput = el('input', { class: 'settings-input', placeholder: 'owner/repo，例如 ai-native-annotator/ai-native-annotator.github.io',
    value: state.github.owner ? `${state.github.owner}/${state.github.repo}` : '' });
  const networkBox = el('div', { class: 'gh-network' });
  const browse = async () => {
    const [owner, repo] = repoInput.value.trim().split('/');
    if (!owner || !repo) { toast('请输入 owner/repo', true); return; }
    networkBox.innerHTML = '加载中…';
    try {
      const { origin, forks } = await listNetwork(owner, repo);
      networkBox.innerHTML = '';
      networkBox.append(repoRow(origin, '(origin)', onLoadDoc, body));
      for (const f of forks) networkBox.append(repoRow(f, `fork · @${f.owner.login}`, onLoadDoc, body));
      if (!forks.length) networkBox.append(el('div', { class: 'hint' }, '这个仓库还没有 fork。'));
    } catch (err) { networkBox.innerHTML = ''; toast(describeError(err), true); }
  };

  body.append(
    el('div', { class: 'settings-row' }, repoInput, el('button', { class: 'btn sm ghost', onclick: browse }, '浏览仓库 / forks')),
    networkBox,
  );

  if (state.github.owner && state.github.repo) {
    body.append(branchAndFileSection(body, onLoadDoc));
  }
}

function repoRow(repo, tag, onLoadDoc, body) {
  return el('div', { class: 'gh-repo-row' },
    el('span', { class: 'gh-repo-name' }, repo.full_name),
    el('span', { class: 'muted sm' }, tag),
    el('button', { class: 'btn sm ghost', onclick: () => {
      set({ github: { ...state.github, owner: repo.owner.login, repo: repo.name, branch: repo.default_branch || 'main' } });
      renderBody(body, onLoadDoc);
    } }, '选择'));
}

function branchAndFileSection(body, onLoadDoc) {
  const { owner, repo } = state.github;
  const branchSel = el('select', { class: 'settings-input' });
  listBranches(owner, repo).then((branches) => {
    branchSel.innerHTML = '';
    for (const b of branches) branchSel.append(el('option', { value: b.name, selected: b.name === state.github.branch ? '' : undefined }, b.name));
    if (![...branchSel.options].some((o) => o.value === state.github.branch)) {
      set({ github: { ...state.github, branch: branchSel.options[0]?.value || 'main' } });
    }
  }).catch((err) => toast(describeError(err), true));
  branchSel.onchange = () => set({ github: { ...state.github, branch: branchSel.value } });

  const pathInput = el('input', { class: 'settings-input', placeholder: '文件路径，例如 annotations/doc1.json', value: 'annotated.json' });
  const status = el('span', { class: 'edit-status' });

  const load = async () => {
    status.textContent = '加载中…'; status.className = 'edit-status';
    try {
      const doc = await importFromGithubFile(owner, repo, pathInput.value.trim(), branchSel.value);
      onLoadDoc(doc);
      toast(`已从 ${owner}/${repo}@${branchSel.value} 载入`);
      status.textContent = ''; document.querySelector('.overlay')?.remove();
    } catch (err) { status.textContent = describeError(err); status.className = 'edit-status err'; }
  };

  const save = async () => {
    const doc = exportDocument();
    if (!doc) { toast('还没有可导出的文档', true); return; }
    status.textContent = '保存中…'; status.className = 'edit-status';
    try {
      const existing = await getFile(owner, repo, pathInput.value.trim(), branchSel.value);
      await putFile(owner, repo, pathInput.value.trim(), JSON.stringify(doc, null, 1),
        `annotate: update ${doc.id}`, branchSel.value, existing?.sha);
      toast(`已提交到 ${owner}/${repo}@${branchSel.value}`);
      status.textContent = '已保存'; status.className = 'edit-status ok';
    } catch (err) { status.textContent = describeError(err); status.className = 'edit-status err'; }
  };

  return el('div', { class: 'settings-section' },
    el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, '分支'), branchSel),
    el('div', { class: 'settings-row' }, el('label', { class: 'settings-label' }, '文件路径'), pathInput),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn sm', onclick: load }, '从此载入标注'),
      el('button', { class: 'btn sm ghost', onclick: save }, '保存标注到此分支'),
      el('button', { class: 'btn sm ghost', onclick: () => openIaa({ owner, repo, path: pathInput.value.trim() }) }, 'Inter-Annotator 合并…'),
      status));
}

export function mountGithubButton(onLoadDoc) {
  $('#btn-github').onclick = () => openGithubPanel(onLoadDoc);
}
