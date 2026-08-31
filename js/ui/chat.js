/**
 * AI dialogue pane + the rationale-clash loop.
 *
 * Every node has its OWN conversation. A disagreement about one skill call is
 * a self-contained argument — mixing them into one document-wide log meant
 * the model saw unrelated context, and a human coming back to a node had to
 * scroll through everybody else's argument to find it. Threads are keyed by
 * sentence + node path (see state.threadKey), with a 'general' thread for
 * document-level questions.
 *
 * A human disagreeing with a label is cheap data; a human *stating why*
 * against a model that also stated why is an argument about the skill's
 * instructions. That is what gets turned into a concrete amendment — and,
 * via core/skills.js, actually applied to the skill.
 */

import {
  state, set, pathKey, threadKey, currentThread, pushToThread,
} from '../core/state.js';
import { el, esc, download } from '../core/dom.js';
import { callProvider, PROVIDERS } from '../core/providers.js';
import { extractJson } from '../core/runner.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { addAmendment } from '../core/skills.js';
import { t } from '../core/i18n.js';
import { toast } from './toast.js';
import { sttSupported, ttsSupported, startDictation, speak, stopSpeaking } from '../voice.js';

let dictation = null;

export function renderChat(container, format) {
  container.innerHTML = '';
  const sel = state.selectedNode;
  const onNode = Boolean(sel && !sel.node?.pending);
  const key = threadKey();
  const messages = currentThread();

  const log = el('div', { class: 'chat-log' });
  for (const msg of messages) log.append(messageEl(msg, format));
  if (!messages.length) {
    log.append(el('div', { class: 'empty sm' }, t(onNode ? 'chat.emptyNode' : 'chat.emptyGeneral')));
  }

  const scope = el('div', { class: 'chat-scope' },
    onNode
      ? el('span', {},
          t('chat.scopeNode'),
          el('span', { class: 'skill-chip', style: `--c:${format.skillColor?.(sel.node.skill) || '#888'}` },
             sel.node.skill),
          el('span', { class: 'scope-span' }, truncate(sel.node.span || '', 40)))
      : el('span', { class: 'muted' }, t('chat.scopeGeneral')));

  const input = el('textarea', {
    class: 'chat-input', rows: 2,
    placeholder: onNode ? t('chat.placeholderNode', { skill: sel.node.skill }) : t('chat.placeholderGeneral'),
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } },
  });

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    pushToThread(key, { role: 'human', text, skill: sel?.node?.skill, path: sel?.path });
    set({}, 'chat');
    const reply = await respond(text, onNode ? sel : null, format);
    pushToThread(key, reply);
    set({}, 'chat', 'proposals');
    if (state.voice.ttsEnabled && reply.text) speak(reply.text, state.doc?.language);
  };

  const bar = el('div', { class: 'chat-bar' }, input);
  if (sttSupported) {
    const mic = el('button', { class: 'btn ghost sm mic-btn', title: t('chat.micTitle') }, '🎤');
    mic.onclick = () => {
      if (dictation) { dictation.stop(); dictation = null; mic.classList.remove('on'); return; }
      mic.classList.add('on');
      dictation = startDictation({
        lang: state.doc?.language,
        onResult: (text) => { input.value = text; },
        onEnd: () => { mic.classList.remove('on'); dictation = null; },
        onError: () => { mic.classList.remove('on'); dictation = null; },
      });
    };
    bar.append(mic);
  }
  if (ttsSupported) {
    bar.append(el('button', {
      class: `btn ghost sm tts-btn${state.voice.ttsEnabled ? ' on' : ''}`, title: t('chat.ttsTitle'),
      onclick: () => {
        const next = !state.voice.ttsEnabled;
        if (!next) stopSpeaking(); // turning it off should also cut off whatever is being read now
        set({ voice: { ...state.voice, ttsEnabled: next } }, 'voice');
        renderChat(container, format);
      },
    }, '🔊'));
  }
  bar.append(el('button', { class: 'btn', onclick: send }, t('chat.send')));

  container.append(scope, otherThreadsBar(key, format), log, bar);
  log.scrollTop = log.scrollHeight;
}

/** Threads that have messages but aren't the one on screen — click to jump back to that node. */
function otherThreadsBar(activeKey, format) {
  const others = Object.entries(state.chats)
    .filter(([k, msgs]) => k !== activeKey && msgs.length);
  if (!others.length) return null;

  const row = el('div', { class: 'thread-bar' }, el('span', { class: 'sub-label' }, t('chat.otherThreads')));
  for (const [key, msgs] of others) {
    const label = threadLabel(key, msgs);
    row.append(el('button', {
      class: 'chip thread-chip',
      title: label.full,
      onclick: () => jumpToThread(key),
    }, label.short, el('span', { class: 'thread-count' }, String(msgs.length))));
  }
  void format;
  return row;
}

function threadLabel(key, msgs) {
  if (key === 'general') return { short: 'general', full: 'general' };
  const first = msgs.find((m) => m.skill) || msgs[0];
  const m = key.match(/^s(\d+):(.*)$/);
  const sent = m ? Number(m[1]) + 1 : '?';
  const short = `${sent}· ${first?.skill || key}`;
  return { short, full: `${short} (${key})` };
}

/** Select the node a thread belongs to, so the pane shows it in context. */
function jumpToThread(key) {
  if (key === 'general') { set({ selectedNode: null }, 'selectedNode'); return; }
  const m = key.match(/^s(\d+):(.*)$/);
  if (!m) return;
  const sentenceIndex = Number(m[1]);
  const path = m[2].split('.').map(Number);
  const sentence = state.doc?.sentences?.[sentenceIndex];
  if (!sentence) return;
  let nodes = sentence.tree, node = null;
  for (const i of path) { node = nodes?.[i]; if (!node) return; nodes = node.children; }
  set({ selectedSentence: sentenceIndex }, 'sentence');
  set({ selectedNode: { path, node } }, 'selectedNode');
}

function messageEl(msg, format) {
  const cls = msg.role === 'human' ? 'human' : (msg.role === 'proposal' ? 'proposal' : 'ai');
  const box = el('div', { class: `chat-msg ${cls}` });
  if (msg.skill) {
    box.append(el('span', {
      class: 'skill-chip xs',
      style: `--c:${format.skillColor?.(msg.skill) || '#888'}`,
    }, msg.skill));
  }
  box.append(el('div', { class: 'msg-text', html: renderText(msg.text) }));
  if (msg.role === 'proposal') {
    const status = el('span', { class: 'edit-status' });
    box.append(el('div', { class: 'proposal-actions' },
      el('button', { class: 'btn sm', onclick: () => applyProposal(msg, status) }, t('chat.applyToSkill')),
      el('button', {
        class: 'btn sm ghost',
        onclick: () => download(
          `skill-proposal-${msg.skill || 'general'}-${Date.now()}.md`,
          msg.patch || msg.text, 'text/markdown'),
      }, t('chat.exportMd')),
      status));
  }
  return box;
}

/**
 * Close the loop: take the amendment out of the proposal and put it into the
 * skill's instructions, so the next call to that skill actually runs with it.
 * Without this the proposal is just a suggestion box.
 */
function applyProposal(msg, status) {
  const file = msg.clash?.file;
  if (!file) { status.textContent = t('chat.applyNoFile'); status.className = 'edit-status err'; return; }
  const rule = extractRule(msg.patch || msg.text);
  if (!rule) { status.textContent = t('chat.applyNoRule'); status.className = 'edit-status err'; return; }
  addAmendment(file, rule);
  set({}, 'chat');
  status.textContent = t('chat.applied', { file, skill: msg.skill });
  status.className = 'edit-status ok';
  toast(t('chat.appliedToast', { file, skill: msg.skill }));
}

/** Pull the `>` quoted rule out of a proposal. */
function extractRule(text) {
  const quoted = String(text || '').split('\n').filter((l) => l.trim().startsWith('>'))
    .map((l) => l.replace(/^\s*>\s?/, '').trim()).filter(Boolean);
  return quoted.length ? `- ${quoted.join(' ')}` : '';
}

function renderText(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function respond(text, sel, format) {
  if (!sel) {
    if (state.runMode === 'live' && state.apiKeys[state.provider]) {
      try {
        return { role: 'ai', text: await freeformAsk(text) };
      } catch (err) {
        logError('chat', t('chat.callFailed', { err: describeError(err) }), err);
        return { role: 'ai', text: t('chat.callFailed', { err: describeError(err) }) };
      }
    }
    return { role: 'ai', text: t('chat.needNode') };
  }
  const { node, path } = sel;
  const key = pathKey(path);
  const def = (format.skills || []).find((s) => s.id === node.skill);
  const humanEdit = state.edits.get(key);

  const clash = {
    skill: node.skill,
    file: def?.file || `skills/${node.skill}.md`,
    span: node.span,
    modelOutput: node.output,
    modelRationale: node.rationale || '(no rationale given)',
    humanOutput: humanEdit ?? null,
    humanRationale: text,
  };

  let body;
  if (state.runMode === 'live' && state.apiKeys[state.provider]) {
    try {
      body = await liveProposal(clash);
    } catch (err) {
      logError('chat', t('chat.callFailed', { err: describeError(err) }), err);
      body = `${localProposal(clash)}\n\n_(${t('chat.callFailed', { err: esc(err.message) })})_`;
    }
  } else {
    body = localProposal(clash);
  }

  const proposal = { role: 'proposal', skill: node.skill, text: body, patch: body, clash };
  state.proposals.push(proposal);
  return proposal;
}

function localProposal(c) {
  const zh = state.lang !== 'en';
  const changed = c.humanOutput
    ? `${zh ? '已改为' : 'changed to'}：\n\`\`\`json\n${JSON.stringify(c.humanOutput, null, 2)}\n\`\`\``
    : (zh ? '（未直接改动输出，仅提出异议）' : '(no direct edit, objection only)');
  const L = zh
    ? { head: 'Skill 更新提案', where: '触发位置', mOut: '模型判断', mWhy: '模型依据',
        hOut: '人工判断', hWhy: '人工依据', clash: '分歧点',
        clashBody: (a, b) => `模型依据依赖的是「${a}」，而人工依据主张「${b}」。`,
        write: (f) => `建议写入 \`${f}\``,
        rule: (cse, why) => `当遇到 ${cse} 这类情况时，${why}`,
        foot: '_（本条由本地模板生成；切换到 live 模式可让模型改写成更贴合技能文件语气的条款。）_' }
    : { head: 'Skill update proposal', where: 'Where', mOut: 'Model output', mWhy: 'Model rationale',
        hOut: 'Human output', hWhy: 'Human rationale', clash: 'The disagreement',
        clashBody: (a, b) => `The model relies on “${a}”, while the annotator argues “${b}”.`,
        write: (f) => `Suggested addition to \`${f}\``,
        rule: (cse, why) => `When handling ${cse}, ${why}`,
        foot: '_(Generated from the local template; switch to live mode to have the model phrase it in the skill file’s own voice.)_' };

  return [
    `**${L.head} — \`${c.skill}\`**`, ``,
    `**${L.where}**：${c.span || '(whole sentence)'}`, ``,
    `**${L.mOut}**：${JSON.stringify(c.modelOutput)?.slice(0, 240)}`,
    `**${L.mWhy}**：${c.modelRationale}`, ``,
    `**${L.hOut}**：${changed}`,
    `**${L.hWhy}**：${c.humanRationale}`, ``,
    `**${L.clash}**：${L.clashBody(firstClause(c.modelRationale), firstClause(c.humanRationale))}`, ``,
    `**${L.write(c.file)}**：`,
    `> ${L.rule(describeCase(c.span, zh), c.humanRationale)}`, ``,
    L.foot,
  ].join('\n');
}

async function liveProposal(c) {
  const zh = state.lang !== 'en';
  const instructions = zh
    ? ['你是一个标注规范维护者。给定一次标注中模型与人工标注者的分歧，',
       '产出一条可以直接写进技能说明文件（markdown）的修订条款。',
       '要求：先一句话点明分歧的实质，再给出建议加入技能文件的规则条款（用 > 引用块）。',
       '规则条款要写成可泛化的标注规范，而不是只针对这一个例子。中文回答。'].join('')
    : ['You maintain annotation guidelines. Given a disagreement between the model and a human annotator, ',
       'produce one amendment that can be pasted straight into the skill markdown. ',
       'First state the substance of the disagreement in one sentence, then give the proposed rule as a > blockquote. ',
       'The rule must generalise, not merely describe this one example. Answer in English.'].join('');
  const input = [
    `skill: ${c.skill} (file ${c.file})`,
    `span: ${c.span}`,
    `model output: ${JSON.stringify(c.modelOutput)}`,
    `model rationale: ${c.modelRationale}`,
    `human output: ${c.humanOutput ? JSON.stringify(c.humanOutput) : '(unchanged)'}`,
    `human rationale: ${c.humanRationale}`,
  ].join('\n');
  logInfo('chat', `live: proposal for ${c.skill}`);
  const text = await freeformAsk(`${instructions}\n\n---\n\n${input}`);
  const head = zh ? 'Skill 更新提案' : 'Skill update proposal';
  const by = zh ? '（live 生成）' : ' (generated live)';
  return `**${head} — \`${c.skill}\`**${by}\n\n${text}`;
}

async function freeformAsk(prompt) {
  const provider = state.provider;
  return callProvider(provider, {
    apiKey: state.apiKeys[provider],
    model: state.models[provider] || PROVIDERS[provider]?.defaultModel,
    prompt,
  });
}

export { extractJson };

const firstClause = (s) => String(s || '').split(/[；;。\n.]/)[0].slice(0, 60);
const describeCase = (span, zh) => (span && span.length < 24 ? (zh ? `「${span}」` : `“${span}”`) : (zh ? '类似' : 'similar cases'));
const truncate = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

/** Export every proposal gathered this session as one reviewable markdown. */
export function exportProposals() {
  if (!state.proposals.length) return alert(t('chat.noProposals'));
  const zh = state.lang !== 'en';
  const doc = [
    zh ? '# Skill 更新提案汇总' : '# Skill update proposals',
    '',
    `${zh ? '生成时间' : 'Generated'}: ${new Date().toISOString()}`,
    `${zh ? '来源文档' : 'Document'}: ${state.doc?.id || '-'} (${state.formatId})`,
    '',
    zh ? '每条提案都来自一次「模型 rationale ↔ 人工 rationale」的交锋。'
       : 'Each proposal comes from one model-rationale vs human-rationale clash.',
    '',
    ...state.proposals.map((p, i) => `\n---\n\n## ${i + 1}. ${p.skill}\n\n${p.text}`),
  ].join('\n');
  download(`skill-proposals-${state.doc?.id || 'session'}.md`, doc, 'text/markdown');
}
