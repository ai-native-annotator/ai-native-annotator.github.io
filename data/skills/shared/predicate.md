# Skill: core predicate identification

You receive one clause (or full simple sentence). Identify its **core
predicate** — the semantic head everything else attaches to.

Decision order:

1. **Abstract eventive concept** (UMR guideline Part 3-1-1). If the clause
   meaning matches one of these non-verbal predications, use it instead of the
   verb:
   - `have-role-91` — "X is a doctor" (X ARG1, role ARG2/ARG3)
   - `have-rel-role-92` / `have-rel-role-91` — kinship/social relation ("his mother")
   - `identity-91` — "X is Y" equative naming ("《世界新闻周报》是...小报")
   - `have-mod-91` — "X is red/beautiful" property predication (many languages
     instead use the adjective/stative verb itself as predicate — prefer the
     stative verb with a sense if the language treats it verbally, e.g. Chinese 冷-01)
   - `belong-91` / `have-91` — possession ("X has Y" → `have-91` when 'own')
   - `exist-91` — existential "there is"
   - `have-place-91`, `have-quant-91`, `have-degree-91`... — locative/quantity/degree predication
   - `resemble-91` — "like/as ... as", 像/如同
   - `have-purpose-91`, `have-cause-91` ... — reifications when the relation itself is asserted
2. Otherwise the **lemma of the head verb** (or stative adjective in Chinese).
   - Multiword predicates: verb-particle ("give up"), 动补 compounds, idioms —
     keep them as one lemma if PropBank has the multiword frame, else use the
     core verb only.
   - Chinese: drop aspect particles 了/着/过 and drop the object if the verb is
     a splittable 离合词 only when PropBank lists the bare verb.
   - Light verbs (进行/加以/make/take a N): the event noun is the real predicate.
3. Never use aspectual verbs (begin/start/继续) as the predicate; they become
   `:aspect` values (e.g. inceptive) on the main event.

Also report up to 3 candidate lemmas so PropBank can be consulted (e.g. for
"decided" report ["decide"], for 停止发行 report ["停止", "发行"]).

## Output JSON

```json
{
  "predicate_kind": "verb" | "abstract",
  "concept": "identity-91",          // only if abstract; else null
  "lemmas": ["decide"],              // candidate lemmas for PropBank lookup, [] if abstract
  "predicate_text": "decided",       // exact words in the clause serving as predicate
  "note": "why"
}
```
