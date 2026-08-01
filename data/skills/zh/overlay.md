# Chinese-specific guidance (applies on top of the shared skill)

- Word segmentation: the sentence is given pre-tokenised; concepts use the
  token as-is (no translation). Predicate senses come from the Chinese
  PropBank: `发布-01`. If a verb is absent from PropBank, still use `-01`
  (the gold data does this, e.g. `开考-01`, `重考-01`).
- **Named entities**: the `name` node covers the FULL name span, one `:op`
  per token, including brackets/quote marks as they appear in the text
  (`:op1 "香港" :op2 "中学" :op3 "文凭" :op4 "考试" :op5 "（DSE）"`). Do NOT
  decompose the inside of a proper name into modifiers.
- **Quantities**: Chinese-numeral quantities are concept nodes, Arabic
  numerals are constants: 一位 → `:quant (x / 一) :unit (y / 位)`; 3美元 →
  `:quant 3 :unit (y / 美元)`. 次/度/遍 frequency phrases → `:frequency N`
  (二度 → `:frequency 2`).
- **Pronouns keep their surface form as concept** (他, 她, 它, 其, 他们…)
  with `:refer-person` and `:refer-number`; do NOT replace them with
  `person`, and do NOT merge a pronoun with its noun antecedent inside the
  sentence graph — document-level coreference links them. Only dropped
  (PRO) or controlled arguments re-use the antecedent's variable.
- Time-of-day/date words like 今日/昨天 head their date:
  `:temporal (t / 今日 :time (d / date-entity :month 4 :day 21))`.
- Drop aspect particles 了/着/过, structural 的/地/得, measure-word 的 from
  concepts; classifiers (份/个/条) become `:unit (份)` under quantified nouns
  with `:quant N`.
- 是-sentences: equative naming → `identity-91`; class membership "X是Y" with
  Y a category → the Y-NP is the ARG2 of `have-role-91` only for roles;
  otherwise treat 是 as `identity-91` or property predication.
- Stative adjectives (冷, 重要) are verbal predicates in Chinese PropBank —
  use their frames (重要-01), not `have-mod-91`.
- 把/被 constructions: normal argument structure of the main verb (被-marked
  agent is still ARG0).
- PRO-drop is pervasive: recover dropped subjects as reentrancies to prior
  mentions within the sentence; if the referent is in another sentence, leave
  the argument out (document-level coref handles it) unless the frame requires
  it, in which case use `(person)` and let coref link it.
- Serial verb constructions: choose the semantically main verb; the second
  verb is usually `:purpose` or a complement clause.
- Aspect defaults: 了/已经 + telic → `performance`; 正在/着 → `activity` or
  `process`; habitual with 每/常 → `habitual`; states → `state`.
- Chinese examples keep native words for units and entity names; `:wiki`
  values use the Chinese page title.
- 引号 titles 《...》: keep 《 and 》 as `:op` parts of the `name` node, as
  the gold data does.
