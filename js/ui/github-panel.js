/**
 * GitHub connect + browse panel: sign in with a token, pick a repo (or one
 * of its forks) and branch, load an annotation file from it, or push the
 * current document there. This is also the entry point into the
 * inter-annotator merge flow (ui/iaa.js), which needs two branches/forks of
 * the same repo to compare.
 */

import { el, $, labelledRow } from '../core/dom.js';
import { state, set } from '../core/state.js';
import { describeError } from '../core/log.js';
import { toast } from './toast.js';
import {
  connectGithub, disconnectGithub, isConnected, listNetwork, listBranches,
  importFromGithubFile, getFile, putFile,
} from '../io/github.js';
import { exportDocument } from '../io/sources.js';
import { openIaa } from './iaa.js';
import { t } from '../core/i18n.js';

export function openGithubPanel(onLoadDoc) {
  const overlay = el('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } });
  const close = () => overlay.remove();
  const body = el('div', { class: 'modal-body' });
  overlay.append(el('div', { class: 'modal github-modal' },
    el('div', { class: 'modal-head' }, el('h3', {}, t('gh.title')), el('button', { class: 'btn sm ghost', onclick: close }, t('common.close'))),
    body));
  document.body.append(overlay);
  renderBody(body, onLoadDoc);
}

function renderBody(body, onLoadDoc) {
  body.innerHTML = '';
  if (!isConnected()) {
    const tokenInput = el('input', { class: 'settings-input', type: 'password', placeholder: t('settings.tokenPlaceholder') });
    const status = el('span', { class: 'edit-status' });
    const connect = async () => {
      status.textContent = t('gh.verifying'); status.className = 'edit-status';
      try {
        await connectGithub(tokenInput.value);
        toast(t('gh.connected', { login: state.github.user?.login || '' }));
        renderBody(body, onLoadDoc);
      } catch (err) { status.textContent = describeError(err); status.className = 'edit-status err'; }
    };
    body.append(
      labelledRow(t('settings.githubToken'), tokenInput,
        el('button', { class: 'btn sm', onclick: connect }, t('common.connect'))),
      el('div', { class: 'hint' }, t('gh.tokenHint')),
      status);
    return;
  }

  body.append(el('div', { class: 'gh-user-row' },
    t('gh.connected', { login: state.github.user.login }),
    el('button', { class: 'btn sm ghost', onclick: () => { disconnectGithub(); renderBody(body, onLoadDoc); } }, t('common.disconnect'))));

  const repoInput = el('input', { class: 'settings-input', placeholder: t('gh.repoPlaceholder'),
    value: state.github.owner ? `${state.github.owner}/${state.github.repo}` : '' });
  const networkBox = el('div', { class: 'gh-network' });
  const browse = async () => {
    const [owner, repo] = repoInput.value.trim().split('/');
    if (!owner || !repo) { toast(t('gh.needOwnerRepo'), true); return; }
    networkBox.innerHTML = t('common.loading');
    try {
      const { origin, forks } = await listNetwork(owner, repo);
      networkBox.innerHTML = '';
      networkBox.append(repoRow(origin, '(origin)', onLoadDoc, body));
      for (const f of forks) networkBox.append(repoRow(f, `fork · @${f.owner.login}`, onLoadDoc, body));
      if (!forks.length) networkBox.append(el('div', { class: 'hint' }, t('gh.noForks')));
    } catch (err) { networkBox.innerHTML = ''; toast(describeError(err), true); }
  };

  body.append(
    el('div', { class: 'settings-row' }, repoInput, el('button', { class: 'btn sm ghost', onclick: browse }, t('gh.browse'))),
    networkBox,
  );

  if (state.github.owner && state.github.repo) {
    body.append(branchAndFileSection(body, onLoadDoc));
  }
}

function repoRow(repo, tag, onLoadDoc, body) {
  // `full_name` is what the API returns, but derive it rather than render an
  // empty row if a response ever comes back without it.
  const fullName = repo.full_name || `${repo.owner?.login || '?'}/${repo.name || '?'}`;
  return el('div', { class: 'gh-repo-row' },
    el('span', { class: 'gh-repo-name' }, fullName),
    el('span', { class: 'muted sm' }, tag),
    el('button', { class: 'btn sm ghost', onclick: () => {
      set({ github: { ...state.github, owner: repo.owner.login, repo: repo.name, branch: repo.default_branch || 'main' } });
      renderBody(body, onLoadDoc);
    } }, t('common.select')));
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

  const pathInput = el('input', { class: 'settings-input', placeholder: t('gh.path'), value: 'annotated.json' });
  const status = el('span', { class: 'edit-status' });

  const load = async () => {
    status.textContent = t('common.loading'); status.className = 'edit-status';
    try {
      const doc = await importFromGithubFile(owner, repo, pathInput.value.trim(), branchSel.value);
      onLoadDoc(doc);
      toast(t('gh.loaded', { repo: `${owner}/${repo}`, branch: branchSel.value }));
      status.textContent = ''; document.querySelector('.overlay')?.remove();
    } catch (err) { status.textContent = describeError(err); status.className = 'edit-status err'; }
  };

  const save = async () => {
    const doc = exportDocument();
    if (!doc) { toast(t('gh.noDoc'), true); return; }
    status.textContent = t('gh.saving'); status.className = 'edit-status';
    try {
      const existing = await getFile(owner, repo, pathInput.value.trim(), branchSel.value);
      await putFile(owner, repo, pathInput.value.trim(), JSON.stringify(doc, null, 1),
        `annotate: update ${doc.id}`, branchSel.value, existing?.sha);
      toast(t('gh.saved', { repo: `${owner}/${repo}`, branch: branchSel.value }));
      status.textContent = t('gh.savedShort'); status.className = 'edit-status ok';
    } catch (err) { status.textContent = describeError(err); status.className = 'edit-status err'; }
  };

  return el('div', { class: 'settings-section' },
    labelledRow(t('gh.branch'), branchSel),
    labelledRow(t('gh.path'), pathInput),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn sm', onclick: load }, t('gh.load')),
      el('button', { class: 'btn sm ghost', onclick: save }, t('gh.save')),
      el('button', { class: 'btn sm ghost', onclick: () => openIaa({ owner, repo, path: pathInput.value.trim() }) }, t('gh.iaa')),
      status));
}

export function mountGithubButton(onLoadDoc) {
  $('#btn-github').onclick = () => openGithubPanel(onLoadDoc);
}
