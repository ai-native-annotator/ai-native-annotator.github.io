/**
 * AI dialogue pane + the rationale-clash loop.
 *
 * A human disagreeing with a label is cheap data; a human *stating why*
 * against a model that also stated why is an argument about the skill's
 * instructions, and that is what we want to capture. Every message the human
 * sends while a node is selected is filed against that node's skill, paired
 * with the model's own rationale, and turned into a concrete proposed
 * amendment to the skill file — exportable as a patch so it can be reviewed
 * and merged like any other change.
 */

import { state, set, pathKey } from '../core/state.js';
import { el, esc, download } from '../core/dom.js';
import { callProvider, PROVIDERS } from '../core/providers.js';
import { extractJson } from '../core/runner.js';
import { logInfo, logError, describeError } from '../core/log.js';
import { sttSupported, ttsSupported, startDictation, speak, stopSpeaking } from '../voice.js';

let dictation = null;

export function renderChat(container, format) {
  container.innerHTML = '';
  const sel = state.selectedNode;

  const log = el('div', { class: 'chat-log' });
  for (const msg of state.chat) log.append(messageEl(msg, format));
  if (!state.chat.length) {
    log.append(el('div', { class: 'empty sm' },
      '选中一个标注节点后，在这里说明你的判断依据；系统会把它和模型的依据对照，生成 skill 更新提案。也可以直接提问。'));
  }

  const scope = el('div', { class: 'chat-scope' },
    sel && !sel.node?.pending
      ? el('span', {},
          '当前针对：',
          el('span', { class: 'skill-chip', style: `--c:${format.skillColor?.(sel.node.skill) || '#888'}` },
             sel.node.skill),
          el('span', { class: 'scope-span' }, truncate(sel.node.span || '', 40)))
      : el('span', { class: 'muted' }, '未选中节点 — 消息将作为一般提问处理'));

  const input = el('textarea', {
    class: 'chat-input', rows: 2,
    placeholder: sel && !sel.node?.pending
      ? `说明你为什么认为 ${sel.node.skill} 这里的判断需要改…（Enter 发送，Shift+Enter 换行）`
      : '提问或说明…（Enter 发送）',
    onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } },
  });

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    state.chat.push({ role: 'human', text, skill: sel?.node?.skill, path: sel?.path });
    set({}, 'chat');
    const reply = await respond(text, sel, format);
    state.chat.push(reply);
    set({}, 'chat', 'proposals');
    if (state.voice.ttsEnabled && reply.text) speak(reply.text, state.doc?.language);
  };

  const bar = el('div', { class: 'chat-bar' }, input);
  if (sttSupported) {
    const mic = el('button', { class: 'btn ghost sm mic-btn', title: '语音输入' }, '🎤');
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
    const tts = el('button', {
      class: `btn ghost sm tts-btn${state.voice.ttsEnabled ? ' on' : ''}`, title: '朗读 AI 回复',
      onclick: () => {
        const next = !state.voice.ttsEnabled;
        if (!next) stopSpeaking(); // turning it off should also cut off whatever is being read right now
        set({ voice: { ...state.voice, ttsEnabled: next } }, 'voice');
        renderChat(container, format);
      },
    }, '🔊');
    bar.append(tts);
  }
  bar.append(el('button', { class: 'btn', onclick: send }, '发送'));

  container.append(scope, log, bar);
  log.scrollTop = log.scrollHeight;
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
    box.append(el('div', { class: 'proposal-actions' },
      el('button', {
        class: 'btn sm ghost',
        onclick: () => download(
          `skill-proposal-${msg.skill || 'general'}-${Date.now()}.md`,
          msg.patch || msg.text, 'text/markdown'),
      }, '导出为 .md 提案')));
  }
  return box;
}

function renderText(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

async function respond(text, sel, format) {
  if (!sel || sel.node?.pending) {
    if (state.runMode === 'live' && state.apiKeys[state.provider]) {
      try {
        const answer = await freeformAsk(text);
        return { role: 'ai', text: answer };
      } catch (err) {
        logError('chat', `一般提问调用失败：${describeError(err)}`, err);
        return { role: 'ai', text: `调用失败：${describeError(err)}` };
      }
    }
    return { role: 'ai', text: '（未选中节点）请先在标注树里点选一个已完成的节点再说明意见；或者切到 live 模式 + 填好 API Key，我可以直接回答一般问题。' };
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
    modelRationale: node.rationale || '(模型未给出理由)',
    humanOutput: humanEdit ?? null,
    humanRationale: text,
  };

  let body;
  if (state.runMode === 'live' && state.apiKeys[state.provider]) {
    try {
      body = await liveProposal(clash);
    } catch (err) {
      logError('chat', `提案生成调用失败：${describeError(err)}`, err);
      body = `${localProposal(clash)}\n\n_（live 模式调用失败，已回退到本地模板：${esc(err.message)}）_`;
    }
  } else {
    body = localProposal(clash);
  }

  const proposal = { role: 'proposal', skill: node.skill, text: body, patch: body, clash };
  state.proposals.push(proposal);
  return proposal;
}

function localProposal(c) {
  const changed = c.humanOutput
    ? `已改为：\n\`\`\`json\n${JSON.stringify(c.humanOutput, null, 2)}\n\`\`\``
    : '（未直接改动输出，仅提出异议）';
  return [
    `**Skill 更新提案 — \`${c.skill}\`**`,
    ``,
    `**触发位置**：${c.span || '(整句)'}`,
    ``,
    `**模型判断**：${JSON.stringify(c.modelOutput)?.slice(0, 240)}`,
    `**模型依据**：${c.modelRationale}`,
    ``,
    `**人工判断**：${changed}`,
    `**人工依据**：${c.humanRationale}`,
    ``,
    `**分歧点**：模型依据依赖的是「${firstClause(c.modelRationale)}」，`
      + `而人工依据主张「${firstClause(c.humanRationale)}」。`,
    ``,
    `**建议写入 \`${c.file}\`**：`,
    `> 当遇到 ${describeCase(c.span)} 这类情况时，${c.humanRationale}`,
    ``,
    `_（本条由本地模板生成；切换到 live 模式可让模型改写成更贴合技能文件语气的条款。）_`,
  ].join('\n');
}

async function liveProposal(c) {
  const instructions = [
    '你是一个标注规范维护者。给定一次标注中模型与人工标注者的分歧，',
    '产出一条可以直接写进技能说明文件（markdown）的修订条款。',
    '要求：先一句话点明分歧的实质，再给出建议加入技能文件的规则条款（用 > 引用块）。',
    '规则条款要写成可泛化的标注规范，而不是只针对这一个例子。中文回答。',
  ].join('');
  const input = [
    `技能：${c.skill}（文件 ${c.file}）`,
    `文本片段：${c.span}`,
    `模型输出：${JSON.stringify(c.modelOutput)}`,
    `模型依据：${c.modelRationale}`,
    `人工输出：${c.humanOutput ? JSON.stringify(c.humanOutput) : '(未改输出)'}`,
    `人工依据：${c.humanRationale}`,
  ].join('\n');
  logInfo('chat', `live: 生成 ${c.skill} 的 skill 更新提案`);
  const text = await freeformAsk(`${instructions}\n\n---\n\n${input}`);
  return `**Skill 更新提案 — \`${c.skill}\`**（live 生成）\n\n${text}`;
}

async function freeformAsk(prompt) {
  const provider = state.provider;
  const apiKey = state.apiKeys[provider];
  const model = state.models[provider] || PROVIDERS[provider]?.defaultModel;
  return callProvider(provider, { apiKey, model, prompt });
}

// exposed for the format studio, which needs raw JSON extraction from a live call too
export { extractJson };

const firstClause = (s) => String(s || '').split(/[；;。\n]/)[0].slice(0, 60);
const describeCase = (span) => (span && span.length < 24 ? `「${span}」` : '类似');
const truncate = (s, n) => (String(s).length > n ? String(s).slice(0, n) + '…' : String(s));

/** Export every proposal gathered this session as one reviewable markdown. */
export function exportProposals() {
  if (!state.proposals.length) return alert('还没有生成任何 skill 更新提案。');
  const doc = [
    '# Skill 更新提案汇总',
    '',
    `生成时间：${new Date().toISOString()}`,
    `来源文档：${state.doc?.id || '-'}（格式 ${state.formatId}）`,
    '',
    '每条提案都来自一次「模型 rationale ↔ 人工 rationale」的交锋。',
    '建议逐条评审后合入对应的 skill 文件。',
    '',
    ...state.proposals.map((p, i) => `\n---\n\n## ${i + 1}. ${p.skill}\n\n${p.text}`),
  ].join('\n');
  download(`skill-proposals-${state.doc?.id || 'session'}.md`, doc, 'text/markdown');
}
