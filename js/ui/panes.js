/**
 * The three content panes plus the legend strip that sits between the
 * before/after panes.
 *
 * The panes are format-agnostic shells: they own scrolling, headers and the
 * theme switch, and delegate the actual markup to the active format.
 */

import { state, set, currentSentence } from '../core/state.js';
import { el } from '../core/dom.js';
import { renderTree } from './tree.js';
import { sentenceDone } from '../core/pipeline.js';
import { sentenceCoverage } from '../core/coverage.js';
import { t } from '../core/i18n.js';

export function renderSource(container, format) {
  const sentence = currentSentence();
  container.innerHTML = '';
  if (!sentence) return container.append(el('div', { class: 'empty' }, t('common.notLoaded')));
  container.insertAdjacentHTML('beforeend', format.renderSource(sentence));
}

export function renderLegend(container, format) {
  container.innerHTML = '';
  const items = format.legend?.() || [];
  container.append(el('div', { class: 'legend-title' }, t('panes.legend')));
  for (const it of items) {
    container.append(el('div', { class: 'legend-item', title: it.note || '' },
      el('span', { class: 'legend-dot', style: `background:${it.color}` }),
      el('span', { class: 'legend-label' }, it.label),
      it.note ? el('span', { class: 'legend-note' }, it.note) : null));
  }
  container.append(el('div', { class: 'legend-foot' },
    t(format.serial ? 'panes.serialHint' : 'panes.parallelHint')));
}

export function renderAnnotated(container, format) {
  const sentence = currentSentence();
  container.innerHTML = '';
  if (!sentence) return container.append(el('div', { class: 'empty' }, t('common.notLoaded')));

  const themes = format.themes || [];
  const bar = el('div', { class: 'pane-subbar' },
    el('span', { class: 'sub-label' }, t('panes.artifactView')),
    ...themes.map((th) => el('button', {
      class: `chip${state.theme === th.id ? ' on' : ''}`,
      onclick: () => set({ theme: th.id }, 'artifact'),
    }, th.label)));

  const artifact = el('div', { class: 'artifact-wrap' });
  const themeId = themes.some((th) => th.id === state.theme) ? state.theme : themes[0]?.id;
  artifact.insertAdjacentHTML('beforeend', format.renderArtifact(sentence, themeId));
  const extra = format.renderExtra?.(sentence);
  if (extra) artifact.insertAdjacentHTML('beforeend', extra);

  const treeHead = el('div', { class: 'pane-subbar' },
    el('span', { class: 'sub-label' }, t('panes.treeTitle')),
    sentenceDone(sentence) ? el('span', { class: 'done-badge' }, t('panes.sentenceDone')) : null,
    el('span', { class: 'muted sm' }, t('panes.callCount', { n: countCalls(sentence.tree) })));
  const tree = el('div', { class: 'tree-wrap' });

  container.append(bar, artifact, coverageBar(sentence), treeHead, tree);
  renderTree(tree, format);
}

/**
 * Back-check strip: does the annotation so far actually account for the
 * source sentence? Shows the strict ratio, names every genuinely-lost token,
 * and points at the step that dropped it.
 */
function coverageBar(sentence) {
  if (!(sentence.tree || []).some((n) => !n.pending)) return null;
  const report = sentenceCoverage(sentence, state.doc?.language || 'en');
  const pct = Math.round(report.strict.ratio * 100);
  const lost = report.strict.lost;
  const cls = lost.length ? 'bad' : (pct === 100 ? 'good' : 'warn');

  const row = el('div', { class: `coverage-bar ${cls}` },
    el('span', { class: 'sub-label' }, t('cov.title')),
    el('span', { class: 'cov-pct' }, `${pct}%`),
    el('span', { class: 'cov-meter' }, el('span', { class: 'cov-fill', style: `width:${pct}%` })),
    el('span', { class: 'muted sm' },
      t('cov.summary', { covered: report.strict.covered.length,
        dropped: report.strict.dropped.length, lost: lost.length })),
  );

  if (!lost.length) return row;
  const detail = el('div', { class: 'coverage-detail' },
    el('div', {}, t('cov.lostIntro'),
      ...lost.map((tok) => el('code', { class: 'lost-tok' }, tok))),
    ...report.worstSteps.slice(0, 3).map((s) => el('div', { class: 'muted sm' },
      t('cov.stepLost', { skill: s.skill, span: truncate(s.span, 34), lost: s.lost.join(', ') }))),
  );
  return el('div', { class: 'coverage-wrap' }, row, detail);
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function countCalls(nodes = []) {
  return nodes.reduce((n, x) => n + (x.pending ? 0 : 1) + countCalls(x.children), 0);
}

export function renderSentenceBar(container) {
  const doc = state.doc;
  container.innerHTML = '';
  if (!doc) return;
  container.append(el('span', { class: 'sub-label' }, t('panes.sentences')));
  doc.sentences.forEach((s, i) => {
    const done = doc.format === 'umr' ? sentenceDone(s) : Object.keys(s.annotation || {}).length > 0;
    container.append(el('button', {
      class: `chip sentence-chip${i === state.selectedSentence ? ' on' : ''}${done ? ' done' : ''}`,
      title: s.text.slice(0, 60),
      onclick: () => set({ selectedSentence: i, selectedNode: null }, 'sentence'),
    }, String(s.index), done ? el('span', { class: 'chip-check' }, '✓') : null));
  });
  container.append(el('span', { class: 'doc-prov', title: doc.provenance || '' },
    doc.provenance?.startsWith('replay') ? t('prov.replay') :
    doc.provenance?.startsWith('imported') ? t('prov.imported') :
    doc.provenance?.startsWith('authored') ? t('prov.authored') : (doc.provenance || '')));
}
