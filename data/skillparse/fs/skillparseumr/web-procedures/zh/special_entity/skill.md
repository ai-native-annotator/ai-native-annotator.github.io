# Skill: names, dates, quantities, ordinals

You are building a UMR graph for one sentence. You are given one piece that is
a proper name, a date, a quantity, a percentage or an ordinal. Write **its whole UMR
graph fragment** as JSON. The structures are fixed; they are written in penman
below only to show their shape.

The sentence and the piece are given under **Input** at the end.

## Named entities

A type concept with a `:name` child; each **word** of the name is one quoted
`:opN`, exactly as written:

    (p / individual-person :name (n / name :op1 "Edmund" :op2 "Pope"))
    (c / country :name (n / name :op1 "Russia"))
    (c2 / city :name (n2 / name :op1 "Tacloban"))

- Chinese names are split into words, never into single characters:
  欧洲议会 → `:op1 "欧洲" :op2 "议会"`.

 Segment as a standard word segmenter does: 新时代 is two words (`"新" "时代"`), 有限公司 is two (`"有限" "公司"`), and a generic suffix (集团, 公司, 电视) is its own op. A province keeps 省 in its one op (`"X省"`). A street name X街 / X路 is one op, but a direction + street word (西街, 东路) is its own op after the proper part.


 A one-character abbreviation (美 in 美方, 中 in 中方) is copied as written (`:op1 "美"`), never expanded.

 A Chinese person's name (surname + given name, 王小明) is **one** op, never split into surname and given name. A language name keeps its whole word, 语 / 话 / 文 included (`:op1 "越南语"`, `:op1 "普通话"`). The suffix 市 after a city name in the text is its own last op (`:op1 "X" :op2 "市"`).

- A full name followed by its abbreviation or alias in （ ） (X委员会（ABC）) is two entities: the full name is the root, with `:ARG1-of (i / identity-91 :ARG2 (o / organization :name (n2 / name :op1 "ABC")))`. The abbreviation is never one more op of the full name.



 A one-character suffix stays with its word (人民报, 文汇报, 环球网, 新浪网 are one op each), and a number with its classifier is one op (一万个). A title after a person's name (博士, 牧师) or before it (教宗) is one more op of the name, and each part of a run-together transliterated name is its own op (若望 / 保禄).

- A transliterated foreign name is split at the middle dot (`·` or `．`), and
  the dot is **kept as its own op**: 玛丽·居里 → `:op1 "玛丽" :op2 "·" :op3 "居里"`.
- The title of a publication or work in 《 》 (or 「 」) keeps the marks as its
  own first and last ops: 《光明日报》 → `:op1 "《" :op2 "光明" :op3 "日报" :op4 "》"`.
  If the piece arrives without the marks but the tokens right before and after
  it are 《 and 》, add them anyway. This is only for newspapers and published articles or reports
  (a news outlet's or an article's title): the title of a TV series, episode or programme, a book, a film or another work, the name of a channel, or a name in 「 」
  used with 名义 never contains the marks; only its words are ops.
- A code with a hyphen, slash or digits (A-12, 747-400) stays one op.
- A model or version designation with its type noun (A-12型, 2004-B版) is one
  `product` whose name has both parts: `:op1 "A-12" :op2 "型"`.
- A place name before an institution's own name (伦敦交通局, 日本气象厅) is
  split off. The institution is named by its own word(s) and takes the place
  as `:poss`, an entity with its own type and name:
  `(g / government-organization :name (n / name :op1 "交通局") :poss (c / city :name (n2 / name :op1 "伦敦")))`.

  This split is only for a city or local place before a government body; a country that begins the official name of a national commission or agency stays in the name as `:op1`, with no `:poss`. A country or region before a broadcaster's own name (某国中央电视台) is split off: the company is named by the rest and takes the country as `:place`. A country or place word that
  begins the name of a publication, company, society or academy (美国X周报,
  俄罗斯X学会) stays inside the name as `:op1`, with no `:poss`.

 A common noun for an institution after a place (某市警察, 当地政府, 某州警方) is not a name at all. The first node is the common noun (警察), with the place as `:place`, a named entity of its own. Never make the common noun a `name`.


 But a place written before the 《 》 marks (香港《X报》), or before a website name that does not contain it (中国新浪网), is not part of the name: the outlet takes it as `:place`, a city or country with its own name.

- A common head noun after a proper name that names a place feature (月球山,
  X河) is not folded into the name: the head noun is the first node, with its own Chinese concept, and the named entity hangs on it with `place`: (s / 山 :place (p / planet :name (n / name :op1 "月球"))). Never drop the head noun.

 This is only for a feature named after another entity (a mountain on a planet). A place whose own name ends in a type word (X花园, X广场, X竞技场, X球场) is **one** named entity: the type word stays in the name as its last op (`:op1 "X" :op2 "广场"`), and the type comes from it. A district X区 is one op, "X区". A country or city written right before a facility name, with no particle between them, also stays in the name as the first ops, and gets no separate country or city node.

- Mythical beings, cryptids and religious figures named by a common word are
  not named entities (they are plain concepts).

- So is a religion or believer word used as a modifier (穆斯林 in 穆斯林社区): a plain concept with no name.




Choose the most specific type: individual-person (any named person; never
plain `person`), country, city, state, province, organization, company,
government-organization, academic-organization (academies, learned societies,
not universities: those are `school`), military, publication, newspaper, facility, island, continent,
world-region, planet, ... .

 A name ending in 公司 / 集团 is `company`. A former or historical state (前苏联) is `country-region`, and 前 stays in the name as `:op1`. Celestial bodies (地球, 月球, 火星) are `planet`.

 More specific types:
 - a stadium, arena, ground or court (…竞技场, …体育场, …球场) is `sports-facility`, never `facility`;
 - a sports club, team or federation (…俱乐部, …足球协会, a club's short name) is `sports-organization`, never `organization` or `sports-team`;
 - a named cup, league or tournament (…杯, …联赛) is `game`;
 - a park, garden or square (…花园, …公园, …广场) is `park`;
 - a district or neighbourhood of a city (…区, a suburb) is `city-district`, never `city`;
 - a metropolitan county 大X ('Greater X') is `local-region`, with the name split 大 / X;
 - a website or social-media platform used to post or communicate (微博, Twitter) is `cultural-artifact`, not `company`.

 - a railway or metro station (…站) is `station`, never `train-station`;
 - a club name followed by 队 keeps 队 in its last op (…俱乐部队), never as a separate head node;


 - a band, orchestra or choir (…乐团, …合唱团, a named pop group) is `social-group`, not `organization`.

 - the title of a TV series, a TV episode or a TV programme (a work in 《 》) is `show`, never `broadcast-program` (that type is only for a channel); a book title is `book`;
 - a named fictional race, alien species or people (the creatures of a science-fiction story) is `ethnic-group`, in every mention, never `species`, `organization` or `individual-person`;
 - a named ship, spacecraft or time machine that people travel in is `ship` (or `spaceship`, `aircraft`), not `product`;
 - a named village, camp or shanty-town inside a city (X村 within a city) is `city-district`;
 - a title or role noun with no proper name (船长, 教授 used alone for one character of a story) is not a named entity: the fragment is one plain node with that word as concept and no `name`.


 - a shopping mall or plaza building (…商场, …坊) is `building`, not `facility`.

 - a statue or monument (a named statue, 某某纪念碑) is `work-of-art`, not `facility`;
 - an outlet cited as the employer of a critic or as the source of a review: a website or media company (a games or entertainment site) is `company`, and a review periodical that is not clearly a newspaper is `magazine`. Its name has its words only, never the 《 》 marks;
 - a fictional race + 人 is not one name either: the root is `人` with `:mod` the `ethnic-group`, and the name never contains 人.





 A named instrument or device (a named telescope or probe) is `product`, not `facility`; a named vehicle or craft that people travel in is `ship` (see below). A national armed branch (美国空军) is one `armed-organization` whose name keeps the country as `:op1`; never split it into military + country. An ethnicity or nationality + 人 (犹太人) is not one name: the head is `人`, with `:mod` the ethnic-group whose name lacks 人 (`:op1 "犹太"`).
 A named one-off event (2000年总统大选, a named war or summit) is `event` with a name whose ops are its words (2000 / 年 / 总统大选), not a predicate with a date.
 Every news outlet is `newspaper`: papers, news
websites and portals (…网). A broadcaster (BBC, a TV network, a TV station named X电视 / X电视台) is `company`. A named TV channel or sub-channel (X台 naming a channel, X频道, X高清台) is `broadcast-program`; but a channel named by its broadcaster's name + a number or word (BBC One, BBC Two) is `company`. A street or road (…街, …路, …道) is `road`; a city written before it (X市Y街) is its own city entity under the road's `:place`. A region written before a city (a part of a country + a city) is its own entity under the city's `:place`, typed `country-region`. 中国大陆, 台湾, 香港 and 澳门 are `country-region`. Choose the type from what the entity does in the document: a name that buys, sells, plans or broadcasts is a company or organization, never `individual-person`. Do not add `:wiki`.
A state body (parliament, congress, ministry, bureau, court, central bank,
a government mint or agency) is `government-organization`, not
`organization`. A name used as a modifier
(*Russian* in *Russian prison*) is still the entity: `(c / country :name (n /
name :op1 "Russia"))`.

## Dates

    (d / date-entity :year 2006 :month 2 :day 17)
    (d / date-entity :weekday (f / friday))

Numbers only, never strings. *today*, *last week*, 今天 are not dates. Nor are relative words with no number (当年, 当时, 那时): given alone, each is a plain concept with the word (`(x / 当年)`), never `date-entity :year 当年`. A Chinese weekday keeps the Chinese word as its concept (`:weekday (x / 星期六)`), never an English name. A recurring time (每晚 + clock time) is `(r / rate-entity-91 :ARG2 (d / date-entity :time (h / hHHmMM)))`.

A decade (1980年代, *the 1980s*) is `(d / date-entity :era 1980)`.

A clock time is a `:time` node whose concept is `hHHmMM` (9点05分, 09:05 → `(h / h09m05)`), never a string, always inside a `date-entity`, also when given alone: `(d / date-entity :time (h / h10m00))`.

 An anaphoric date word (同年, 该年, 同月) is resolved to the date written earlier in the sentence or the document: `date-entity` with that year or month (同年秋季 after 2001年 → `(d / date-entity :year 2001 :season (s / 秋季))`), never a 年 node with `mod` 同.

 Clock times use the 24-hour form: add 12 to the hour when 下午 / 傍晚 / 晚上 / 晚 / 当晚 / 每晚 marks it as PM (下午3点10分 → `h15m10`). Look at the sentence: the PM word is often written before the piece (当晚11:30 given as 11:30, or the alternative times in brackets after it), and still applies. A relative day word with only a part of the day and no clock time (第二天早上) is not a date-entity: the day word is the head, with the part of the day as `temporal`.
 A relative day word (当晚, 当天, 次日, 第二天, 翌日) is a `:day` node with the word as concept (`(d / date-entity :day (x / 当晚) :time (h / h20m15))`). Given alone, it is just that plain concept: no temporal-quantity and no ordinal-entity. 当地时间 is `:timezone (t / 时间 :mod (l / 当地))` on the date-entity. A date in a coordination whose month or year is written only on an earlier conjunct (3月5日和6日, given 6日) takes that month or year too.


 A start time X年开始 / 自X年起 ('since X') is `(s / 开始 :op1 (d / date-entity :year X))`, with the starting word as concept; it is not an event.

 The concept is always the word as written: 自X以来 is `(s / 以来 :op1 X)`, never `开始` or `since`.




## Quantities

    (t / temporal-quantity :quant 20 :unit (y / year))
    (m / monetary-quantity :quant 3499 :unit (d / dollar))
    (p / percentage-entity :value 4.6)

`:quant` is a plain number (*1,500* → 1500, *二十* → 20, *5 million* →
5000000). The unit is a concept in the sentence's language (English `dollar`,
`year`; Chinese `欧元`, `年`). *more than eight months* →
`(m / more-than :op1 (t / temporal-quantity :quant 8 :unit (m2 / month)))`.

 An approximate count N到M (三到四个) is `(o / or :op1 3 :op2 4)`, not `range`. A half (半) is `:quant 0.5`.


## Ordinals

*the first time* → `(o / ordinal-entity :value 1)`; 第三次 → `:value 3`.

A bare numeral + 台 / 号 used as a channel label (1台) is `(t / 台 :ord (o / ordinal-entity :value 1))`, never a name.


 A classifier after the ordinal (首个, 第一位) is its `:unit`: `(o / ordinal-entity :value 1 :unit (u / 个))`.

An ordinal with a time unit counting from a start (第三年 'the third year') is a temporal quantity (but 第二天 'the next day' is a relative day word: see Dates)
with that ordinal: `(t / temporal-quantity :unit (y / 年) :ord (o / ordinal-entity :value 3))`.

## Output

- `graph`: the fragment, `{{"nodes": [...], "edges": [...], "attrs": [...]}}`.
  Every `(v / concept` of the shapes above is a node `{{"var": "v", "concept":
  "concept"}}` (the **first node is the root**); every `:role (child ...)` is an
  edge `[parent, role, child]`; every `:role constant` is an attribute
  `[var, role, value]`. *Edmund Pope* is

      nodes  [{{"var": "p", "concept": "person"}}, {{"var": "n", "concept": "name"}}]
      edges  [["p", "name", "n"]]
      attrs  [["n", "op1", "Edmund"], ["n", "op2", "Pope"]]

  Write name parts and wiki titles as plain strings (no extra quotes) and
  numbers as numbers. Variable names are yours; they are renamed later.
- `open`: usually `[]`. Only if the piece contains something that is not part
  of the fixed structure and needs its own annotation (*the Russian court in
  Moscow* given to you whole), make it a placeholder `{{"var": "x1", "text":
  ..., "span": [first, last]}}` joined by an edge.
- `outside`: almost always `[]`. Only if a node of the entity takes a
  participant that is written elsewhere in this sentence and not in the piece,
  give it as `{{"var": "y1", "text": ..., "span": [first, last]}}`, its var
  used in `edges` like a placeholder; `text` and `span` are the participant's
  **head word only**. It is joined to the node that already stands for it.
- `alignment`: the span of the whole piece: the numbers of its first and last
  token as listed in Tokens, both included (one token: [4, 4]).

## Examples

To see how a case is annotated, call `search_annotations` with the language and a
few keywords: words of the text, concepts (`have-org-role-91`), roles (`:ARG1-of`). It
returns whole gold sentence annotations, and the worked examples of this procedure's
skills, that contain them. To check a rule, call `search_guidelines` with keywords: it
returns the matching sections of the UMR guidelines.

## Input

Sentence: {sent}
Tokens, each with its number: {token_sent}
Language: {lang}

The piece: "{text}"
Its tokens: span {span} (first and last token number, both included)
