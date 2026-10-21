TASK: annotate ONE English sentence in UMR (PropBank-style numbered roles) in EXACTLY the conventions below. Reuse variables of the 5 previous sentences for coref and temporal links. For every event verb/adjective call roleset_lookup(lemma) to pick the sense and check which roles are core (-01 if no roleset fits).

1. EVENTS
Events: predicated verbs, states, non-verbal clauses; event nominals (storm, meeting); participles; gerunds; infinitives; relative-clause verbs.
NOT events: modal/tense auxiliaries (will, would, can, may, must, should, have, be, do); phasal verbs (start, keep: only aspect; stop/finish/continue stay events: continue-01 :ARG1 complement); the light verb of light verb + eventive noun (use the noun, interview-01); adjectives/state nouns used as modifiers; entity nouns.
- Predicate adjectives/nouns that have a PropBank roleset ARE events: "X is important" -> (i/ important-01 :ARG1 X :aspect state); "the basket is full" -> (f/ full-09 :ARG1 basket :ARG2 (t/ thing)).

- Sentence-initial But/However (contrast with the previous sentence): root (h/ have-concession-91 :ARG1 (e/ event) :ARG2 <main clause>); h aligned to the connective, e aligned 0-0, coref (earlier-event :same-event e). h has no aspect.

- Keep small words: only/again :mod, some :quant, those :mod (t/ that), closely :manner (c/ close-10), up/down after an event verb :direction (up-03/down-03). 'Nevertheless'/'for example': main clause :ARG2-of (h/ have-concessive-condition-91 | have-example-91 :ARG1 (e/ event)), h aligned to the word. percentage-entity aligned to the number alone. continue-01 stays the root event. roleset_lookup shows each sense's meaning: choose by meaning.
 Verb+particle: call roleset_lookup('pick up'); a phrasal roleset (pick-up-04) = ONE concept aligned verb..particle, no particle node; else :direction (off-07).
- "know/ask/wonder if/whether X (or not)": (k/ know-01 :ARG1 (t/ truth-value :polarity-of (x/ X-event ...))); t aligned to "if"; do not build or/have-mod pairs for "or not".
- "I don't think/believe/expect X": the negation goes on X (:polarity - on X's event), not on think.
- "make/let X do" = two events. Add implicit events only when sure.

2. ROOT
One main event is root; complement, adverbial, relative events hang under it. Clear relation (:purpose :cause :condition :concession :manner :temporal before/after/while) -> role under the main event. No clear relation: root = and / consecutive (event sequence) / or (:op1 :op2) or contrast-91 / but-91 / unexpected-co-occurrence-91 (:ARG1 :ARG2). A clause that starts with and/and then just continues the narrative: annotate the clause itself as root (no and node); the link is in the document-level temporal group. Non-verbal clauses: abstract predicate is root: have-91 (ARG1 possessor, ARG2 possessum), belong-91 (possessum, possessor), exist-91 (location, theme), have-place-91 (theme, location), have-mod-91 (theme, property), have-role-91 (theme, reference, category), have-org-role-92 (theme, org, title), have-rel-role-92 (theme, relative, role), identity-91 (theme, equated).

3. CONCEPTS AND ROLES
- Events: PropBank lemma-sense. Nouns: plain lemma. Time words are concepts under :temporal: (t/ then), (a/ at-first), (t/ today), (n/ now).
 
- Pronouns/implicit people: (p/ person :refer-person 1st|2nd|3rd :refer-number singular|plural). Generic "you" adds :refer-definiteness class. Overt plural nouns (men, diseases): NO :refer-number; only pronoun/implicit person nodes get :refer-person + :refer-number. Named entities: type (company, product, journal; not organization) + (n/ name :op1 ..) one :opN per word + :wiki real Wikipedia title ("Lorillard_Tobacco_Company"), "-" only if none; no refer-person. 

- Pronoun with antecedent in the SAME sentence (it, its, who) reuses that variable; across sentences new node + coref.
- Agent nouns: researchers -> (p/ person :refer-number plural :ARG0-of (r/ research-01)); workers -> work-01; spokeswoman -> (p/ person :ARG1-of (h/ have-org-role-92 :ARG2 org :ARG3 (s/ spokeswoman))). Entity nouns from verbs -> (t/ thing :ARG1-of (f/ find-01)),. Adjectives with a roleset used as modifiers are events with the sense id (p/ percentage :ARG1-of (h/ high-02)); never bare high/old/new.
- Report (said): say-01 root, ARG1 = reported clause with :quote <say var>. "Although X, Y": X is :concession of Y. 
- "N units ago" -> :temporal (b/ before :op1 (n/ now) :quant (m/ more-than :op1 (q/ temporal-quantity :quant N :unit (y/ year)))); "once/when X" -> (a/ after :op1 X-event); "N units later" -> (a/ after :op1 earlier-event :quant (q/ temporal-quantity)).
- Core roles per roleset; reentrancy by shared variable (control: wants to go -> go :ARG0 same person). Passive: same roles as active. Inverse roles for modifying events: (p/ person :ARG0-of (r/ run-02)).

- Non-core: :temporal :place :manner :purpose :cause :condition :concession :duration :frequency :direction :path :extent :goal :source; noun relations :mod :poss (owner; possessum is parent) :part :topic :medium :age :group :example :quant (all, numbers) :unit :ord :li :polite :degree. Measures: substance is the head (three cups of milk -> milk :quant 3 :unit cup).
 Deverbal/adjectival words ALWAYS take the roleset_lookup sense, also as modifiers: yields -> (t/ thing :ARG1-of (y/ yield-03 :ARG0 fund)), compound-01, average-01, mature-01 (not 'maturity'), long-03, early-01, relative-05. Every real event has :aspect (event nominal: process); modifier-adjective events (short-07, top-06, simple-02, high-02, typical-02, down-03) get NO :aspect. 'a day/41 days/seven-day' -> temporal-quantity :quant N :unit day; 'N %' -> percentage-entity :value N. 'according to X' -> say-91 :ARG0 X :ARG1 claim.
- Negation: :polarity - on the negated concept.

4. ATTRIBUTES in the graph (all lowercase values, written after roles)
- :aspect on each event except abstract have-concession-91: process (event nominal) > habitual (generic/usual, used to) > state (be/have/love/know/want/think/see, perception, mental, ability, non-verbal, adjective events) > activity (progressive/present, no end, start/keep) > endeavor (stopped, for-duration) > performance (completed or future; default; telic motion or transfer like dump, get down). imperfective / perfective only if unsure.
- :mode imperative | interrogative | expressive on the main verb; imperatives get a 2nd-person ARG0.
- DO NOT write :modstr or :modpred in the graph. The complement of a modal-type predicate (want, need, hope, try, plan, decide, allow, forbid; NOT think/believe/expect/assume) stays its ARG1 and ALSO gets :modal-predicate <predicate variable> (bare variable). Speech-verb complements are plain ARG1.

5. ALIGNMENT: one line per variable, `var: start-end` (1-based; one word -> `5-5`); pronoun person node = the pronoun; name and type nodes = name span; connectives = their word; have-concession-91 = the But; truth-value = the "if"; implicit/abstract nodes 0-0.

6. DOCUMENT LEVEL
 [Cues: 'd/would+V (past habit) = habitual; bare -ing clause or watch/see/hear X V complement = activity; 'And then': (t/ then) aligned to 'then' only, no (then :contained e); roleset ARGn (drop-01 ARG4 end point) beats :goal.]  (omit empty groups; use only variables that exist in this or the previous sentences; the constant document-creation-time is allowed; never ROOT, PAST_REF etc.)
:temporal (parent :rel child): rel describes the CHILD relative to the PARENT, so (A :after B) means B happens after A; (A :before B) means B is before A; (A :overlap B); (A :contained B) means B is inside A. Entries: (time-expression-node :contained event) for an overt time expression (at first, then); otherwise link the event to the nearest relevant earlier event: narrative sequence (and then, next action) -> (earlier :after current); same time (state, comment) -> (earlier :overlap current); complement of think/know -> (earlier-context-event :overlap complement). If nothing clear, give no temporal tuple.
 Also (document-creation-time :before e) for the main past event (the say-01 in a report), :contains for a present state; (say-event :contains complement-state).
:modal starts with (root :modal author); then (author :label event). Labels: full-affirmative, partial-affirmative, neutral-affirmative, full-negative, partial-negative, neutral-negative, unspecified. Plain asserted event: (author :full-affirmative e). Cues: will, plain assertion, manage -> full-affirmative; probably, should, must, imperative, intend/plan, think/believe -> partial-affirmative; may, might, can, want, hope, maybe -> neutral-affirmative; not, never, deny -> full-negative; probably not, forbid -> partial-negative; doubt, "don't think X" -> neutral-negative; "know if X (or not)", "John does not know whether X" -> unspecified. For a modal-type predicate give a tuple ONLY for the complement (strength computed from the whole construction), none for the predicate itself. Conditional: (author :neutral-affirmative cond-node), then the clauses.
 Report with a person speaker: (author :full-affirmative say-event), (author :full-affirmative speaker-person), then (speaker-person :full-affirmative event) for each event inside the report. First tuple exactly (root :modal author).
:coref (earlier :same-entity current): pronouns, implicit arguments (implicit thing/person) and repeated mentions -> the nearest earlier variable of the same entity. :same-event for repeated events and for event anaphora (that/it/this referring to an earlier event; the implicit event of have-concession-91). :subset-of for subsets. No coref for generic or unrelated nodes.
 Scan all 5 previous sentences: a repeated noun (crocidolite, Lorillard, the problem/story) links to the earliest variable of that entity.

Skeleton:
 Variables sN+letter (s8a; never a8 or bare); one head word per node (no ranges over compounds).
(s3g / get-05
    :ARG1 (s3p / person :refer-person 3rd :refer-number singular)
    :ARG2 (s3d / down-03)
    :aspect performance)
...
