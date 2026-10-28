/**
 * Markdown for reading skill files: headings, paragraphs, lists, tables, code blocks, quotes,
 * **bold**, *italics*, `code` and links. Everything is built as DOM nodes from text, never
 * through innerHTML, so a skill file cannot inject markup.
 *
 * With { prompt: true } (a skill.md that goes through str.format), `{{` and `}}` show as the
 * braces the model sees, and `{name}` shows as the slot the Runner fills in.
 */

import { h } from './ui.js';

const OPEN = '\u0001';
const CLOSE = '\u0002';

/** Text with str.format slots marked and doubled braces made single. */
function slots(text, prompt) {
  if (!prompt) return [text];
  const out = [];
  let last = 0;
  const re = /\{(\w*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(braces(text.slice(last, m.index)));
    out.push(h('span', { class: 'md-slot', title: 'filled in by the Runner', text: `{${m[1]}}` }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(braces(text.slice(last)));
  return out;
}

const braces = (s) => s.replaceAll(OPEN, '{').replaceAll(CLOSE, '}');

/** Inline markup: `code`, **bold**, *em*, [text](http…). Underscores are left alone (snake_case). */
function inline(text, prompt) {
  const out = [];
  const re = /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...slots(text.slice(last, m.index), prompt));
    if (m[1]) out.push(h('code', {}, slots(m[2].replace(/^ (.*) $/, '$1'), prompt)));
    else if (m[3] !== undefined) out.push(h('strong', {}, inline(m[3], prompt)));
    else if (m[4] !== undefined) out.push(h('em', {}, inline(m[4], prompt)));
    else out.push(h('a', { href: m[6], target: '_blank', rel: 'noopener noreferrer' }, inline(m[5], prompt)));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(...slots(text.slice(last), prompt));
  return out;
}

const LIST = /^( *)([-*+]|\d+[.)]) +(.*)$/;
const indentOf = (line) => line.match(/^ */)[0].length;
const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
const CJK = /[\u3000-\u9fff\uff00-\uffef]/;
/** Lines of a paragraph run together: with a space, or with nothing between Chinese characters. */
const joiner = (a, b) => (CJK.test(a.slice(-1)) && CJK.test(b[0]) ? '' : ' ');
const isRule = (line) => /^ {0,3}([-*_])( *\1){2,} *$/.test(line);
const isTableSep = (line) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes('-');

function blocks(lines, prompt) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^ *(```+|~~~+)\s*(\S*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push(h('pre', { class: 'md-code', dataset: fence[2] ? { lang: fence[2] } : undefined },
        h('code', { text: prompt ? braces(body.join('\n')) : body.join('\n') })));
      continue;
    }

    const head = line.match(/^ {0,3}(#{1,6}) +(.*?)(?: +#+)? *$/);
    if (head) {
      out.push(h(`h${head[1].length}`, {}, inline(head[2], prompt)));
      i++;
      continue;
    }

    if (isRule(line)) { out.push(h('hr')); i++; continue; }

    // rows after a blank line still belong to the table above (the skill files space their tables out)
    const prev = out[out.length - 1];
    if (/^\s*\|.*\|\s*$/.test(line) && prev?.classList?.contains('md-table') && !isTableSep(lines[i + 1] || '')) {
      const tbody = prev.querySelector('tbody');
      const width = prev.querySelectorAll('th').length;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = cells(lines[i++]);
        tbody.append(h('tr', {}, Array.from({ length: Math.max(width, r.length) }, (_, k) => h('td', {}, inline(r[k] ?? '', prompt)))));
      }
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const heads = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.endsWith(':') ? (c.startsWith(':') ? 'center' : 'right') : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      const cell = (tag, text, k) => h(tag, { style: align[k] ? `text-align:${align[k]}` : undefined }, inline(text, prompt));
      out.push(h('div', { class: 'md-table' }, h('table', {},
        h('thead', {}, h('tr', {}, heads.map((c, k) => cell('th', c, k)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, heads.map((_, k) => cell('td', r[k] ?? '', k))))))));
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      out.push(h('blockquote', {}, blocks(body, prompt)));
      continue;
    }

    const item = line.match(LIST);
    if (item) {
      const base = item[1].length;
      const ordered = /\d/.test(item[2]);
      const items = [];
      let loose = false;
      while (i < lines.length) {
        const m = lines[i].match(LIST);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        const inner = base + m[0].length - m[3].length - m[1].length;
        const body = [m[3]];
        i++;
        // the item goes on while lines are indented under it, or are a lazy continuation of its text
        while (i < lines.length) {
          const l = lines[i];
          if (!l.trim()) {
            const next = lines.slice(i + 1).find((x) => x.trim());
            if (next !== undefined && indentOf(next) > base) { body.push(''); i++; loose = true; continue; }
            break;
          }
          if (indentOf(l) > base) { body.push(l.slice(Math.min(indentOf(l), inner))); i++; continue; }
          if (LIST.test(l) || body[body.length - 1] === '' || /^ {0,3}(#|\||>|```)/.test(l)) break;
          body.push(l.trim());
          i++;
        }
        items.push(body);
        if (i < lines.length && !lines[i].trim()) {
          const next = lines.slice(i).find((x) => x.trim());
          const nm = next?.match(LIST);
          if (nm && nm[1].length === base) loose = true;
        }
        while (i < lines.length && !lines[i].trim() && lines.slice(i).find((x) => x.trim())?.match(LIST)?.[1].length === base) i++;
      }
      const start = ordered ? parseInt(item[2], 10) : 1;
      out.push(h(ordered ? 'ol' : 'ul', { start: ordered && start !== 1 ? start : undefined, class: loose ? 'loose' : undefined },
        items.map((body) => {
          const kids = blocks(body, prompt);
          // a tight item's single paragraph is shown inline
          return h('li', {}, !loose && kids[0]?.tagName === 'P' ? [...kids[0].childNodes, ...kids.slice(1)] : kids);
        })));
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && !/^ {0,3}(#{1,6} |>|```|~~~)/.test(lines[i])
      && !isRule(lines[i]) && !(lines[i].trim().startsWith('|') && isTableSep(lines[i + 1] || ''))) {
      para.push(lines[i++].trim());
    }
    if (!para.length) { para.push(lines[i++].trim()); }
    // in a prompt, a line that ends in a slot (`Sentence: {sent}`) keeps its line break
    const groups = [[]];
    para.forEach((l, k) => {
      if (k && prompt && /\{\w*\}\W*$/.test(para[k - 1])) groups.push([]);
      groups[groups.length - 1].push(l);
    });
    out.push(h('p', {}, groups.map((g, k) => [k ? h('br') : null, inline(g.reduce((a, l) => a + joiner(a, l) + l), prompt)])));
  }
  return out;
}

/** Markdown text as a <div class="md">. */
export function renderMarkdown(text, { prompt = false } = {}) {
  let src = String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  if (prompt) src = src.replaceAll('{{', OPEN).replaceAll('}}', CLOSE);
  return h('div', { class: 'md' }, blocks(src.split('\n'), prompt));
}
