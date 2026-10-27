# Judgment Lab — Exp-all-in-one

[日本語](README.md) · [中文](README.zh-CN.md) · [English](README.en.md)

A teacher-controlled classroom application based on Judgment under Uncertainty: Heuristics and Biases (Kahneman, Slovic & Tversky, eds., 1982). Japanese, Chinese and English are selectable; Japanese is the initial default. Runs locally with Node.js and SQLite, without Vercel or Neon.

All 21 catalog tasks were audited; 14 are available. Published subsets, the conversation pilot and method reconstructions are labeled explicitly. Seven need core stimuli or field conditions. The [restoration inventory](docs/restoration-status.md) accounts for all 14 previously held tasks. This is not a reproduction of every book experiment. English letter frequency is excluded; five-second multiplication represents anchoring.

## Run locally

Requires Node.js 24.15.0 or later. No third-party npm dependencies. Run from the repository:

~~~sh
npm start
~~~

## Classroom flow

- Students open http://127.0.0.1:3000/ , enter a seven-digit student ID, and wait. Leading zeros are preserved.

- The teacher opens http://127.0.0.1:3000/admin , selects experiment blocks, independently enables experiment-order and answer-position randomization, and presses Start.

- Waiting students begin within roughly one second and complete the selected tasks consecutively. Late arrivals enter the active lesson. Students can return to waiting after finishing. The teacher ends the active lesson before starting another.

- Experiment order is randomized independently per student, or follows chapter order when disabled. Answer randomization affects choice buttons, not ordered numerical scales, multiplication conditions or within-task stages. Original condition assignment is separate.

- Reloads preserve assignments, order and saved answers. Language switching preserves current inputs; ordinary unsent inputs are lost on reload. Unconfirmed submissions retry with the same submission ID.

- Student pages show questions and necessary controls only. There is no common prior-experience question, additional confidence scale or technical explanation. Teachers can export CSV or JSON.

## Available tasks

| ID | Task | Original design, briefly | Changes for this implementation | Source |
| --- | --- | --- | --- | --- |
| 01-02 | Conjunctive and disjunctive bets | Choose a preferred bet by comparing a single red draw with seven red draws or at least one red in seven draws. | Restores the two chapter comparisons; removes the third pair, likelihood question and invented equal prizes. Giving both pairs in a fixed order is a documented implementation choice. | [BH73](https://doi.org/10.1016/0030-5073(73)90061-5) · [TK74](https://doi.org/10.1126/science.185.4157.1124) |
| 03-01 | Insensitivity to sample size | Compare which of two hospitals, averaging 45/15 births daily, records more days with over 60% boys in a year; three choices. | The over-60% item retains daily variation and the “within 5%” option, translated for individual screen responses. | [KT72](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf) |
| 03-02 | Local representativeness | Given 72 six-child families with birth order GBGBBG, estimate how many have BGBBBB; G denotes girls and B boys. | Restores the original family-count estimate instead of coin choices. No added independence/equiprobability premise or cap at 72; translated screen input. | [KT72](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf) |
| 04-01 | Engineer–lawyer estimates | Estimate the probability that Jack, Dick and an undescribed person are engineers or lawyers under one of two base rates. | Restores two base rates crossed with two target professions and 0–100 probabilities. Uses the two published profiles plus the null description; omits the three unpublished profiles and expert-bonus procedure. | [KT73](https://doi.org/10.1037/h0034747) |
| 06-01 | Linda conjunction judgments | Within-subject probability-ranking version: read Linda’s profile and rank eight occupations/activities from 1 to 8. | Restores all eight targets and ranks 1–8, with no added appearance detail. Translated numeric ranking; excludes Bill and other study versions. | [TK82R](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/judgments-of-and-by-representativeness/7565F5DCBEC82B58C6428ABE8F7304AB) |
| 08-01 | Causal versus diagnostic judgments | Compare mother/daughter blue-eye conditional likelihoods, then relative confidence in predicting fathers’ versus sons’ heights in a survey of final-year high-school boys; three choices each. | Removes 180 cm, a hypothetical population, equal marginals and the extra 0–100 confidence rating. Restores both distinct measures in three languages without correctness scoring for height. | [TK80](https://amsr.contentdm.oclc.org/digital/api/collection/p21050coll5/id/3872/download) |
| 09-07 | False consensus: hypothetical sign task | In a hypothetical restaurant or religious sign scenario, estimate consent rates, make a personal choice and rate eight traits of self, accepters and refusers. | Uses Study 3 (1977): two percentages totaling 100 and three targets × eight traits on −50 to +50 scales. Wording is faithfully restated and translated; target orders are randomized without original fixed quotas. | [RGH77](https://doi.org/10.1016/0022-1031(77)90049-X) |
| 11-06 | Five-second multiplication estimates | Two groups of high-school students estimated either 1×2×…×8 or 8×7×…×1 within five seconds; each participant saw only one expression. | The blackboard becomes a screen. After a readiness page, a five-second deadline captures the entered estimate or null. Reloads or hidden pages are recorded as interruptions; input speed, device and language introduce differences. Removes unsupported instructions prohibiting calculation tools. | [TK74](https://doi.org/10.1126/science.185.4157.1124) |
| 12-01 | Self and partner contributions to conversation | Two people from the same conversation independently estimate their own and their partner’s speaking time, allowing cross-person comparison. | Selects the chapter’s 26-person conversation pilot, distinct from the marital household study. Two estimates need not total 100; added recall, confidence and seven-day conditions are removed. Partner IDs are matching metadata within one lesson. | [RS79](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Negotiation_and_Conflict_Management/Ross_Sicoly_1979_Egocentric_biases.pdf) |
| 14-01 | Counterfactual simulation | Between-subject route/time versions of Mr Jones’s fatal accident; write one or more “If only…” completions, with the first completion coded by researchers. | Restores the accident story, removes the one-completion restriction, event-category question and reasons. Translated free text is retained for manual coding. | [KT82S](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/simulation-heuristic/9C6ED91A6429A8443641641DC41A52FE) |
| 23-01 | Outcome information and historical judgment | Read twelve facts about the Gurka conflict, estimate four outcome probabilities and rate each fact’s relevance across one no-outcome and four outcome-information groups. | Limited to event A in Experiment 1 (1975). Restores four probabilities totaling 100 and twelve seven-point relevance ratings. All languages are faithful restatements; no unverified endpoint labels are added. | [F75](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf) |
| 25-01 | Two-bag probability (chapter example) | Chapter example: a fair coin selects one of two 1,000-chip bags (700/300 red). After 12 replacement draws give 8 red and 4 blue, estimate once the probability of the 700-red bag. | Removes the authored ten-step sequence; restores the batch sample and single probability judgment, accepting decimals. Translated screen response, not the full original research program. Retains the original 0–1 probability notation and 0.5 cues. | [ED68](https://pages.ucsd.edu/~mckenzie/Edwards1968excerpts.pdf) |
| 26-01 | Multistage bag–can inference | Use bag, can and disc composition tables to estimate Bag I versus II odds from an observed color: three conditions × four colors × two rounds, 24 judgments. | Restores original matrices, 24 judgments and odds, retaining two raw weights and infinite ratios. Individual saved schedules replace shared 4–6-person schedules; the original participants’ roughly two hours of prior related experience are not reproduced. | [GKP73](https://deepblue.lib.umich.edu/handle/2027.42/33759) |
| 33-03 | Risk, benefit and hazard characteristics (30 items) | Rank 30 activities or technologies by risk or benefit, rate proportionally with the minimum fixed at 10, then judge acceptable risk and nine seven-point dimensions for every item. | Reconstructed from the 1978 report and the 2016 replication by Fox-Glassman and Weber. Replaces the ten-item short version; allows ties and ratio ratings above 100. Five cyclic block orders are assigned individually; translations and contemporary classroom sampling are explicit changes. | [FSLRC78](https://doi.org/10.1007/BF00143739) · [FGW16](https://elke-u-weber.com/media/2016_journal_of_mathematical_psychology_fox-glassman.pdf) · [SFL82](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/facts-versus-fears-understanding-perceived-risk/F2E2E20E89E2121C7BCB43672D590EB8) |

## Implemented versions and conditions

Experiment cards show only the names and brief descriptions of available tasks. Administration conditions, version notes, source comparisons and tasks awaiting materials are documented in this README.

| ID | Version scope | Conditions | Materials missing for the full study |
| --- | --- | --- | --- |
| 01-02 | Two published comparisons | Administer as hypothetical preferences, without real wagering. | The full study booklet, incentive procedure and allocation schedule remain unavailable. |
| 04-01 | Published Jack, Dick and null subset | Each student answers three items with a consistent base rate and target profession. | The other three original profiles and the expert-comparison reward procedure. |
| 09-07 | Original paper: Study 3 | Hypothetical only: no actual sign carrying or course-credit promise. | The original paper-form layout and exact order-allocation table are unavailable; scenarios, traits and scales are verified. |
| 12-01 | Conversation pilot from the same chapter | Requires two people who actually shared a conversation and answer independently, entering each other’s IDs. No added fixed topic or duration. | Core materials for the pilot are available. The 20 marital activities are also recovered but belong to a different procedure. |
| 23-01 | Original paper: Experiment 1, event A | One condition per student; some assigned outcomes are counterfactual and explained after completion. | The complete 1975 questionnaire layout is unavailable; facts, outcomes and measurement scope are verified from the paper. |
| 26-01 | Book matrices, all 24 judgments | Students need to understand odds notation. The screen defines ratios without numerical examples or answer training. | Core matrices and conditions are recovered; earlier practice items and original individual allocation records are unavailable. |
| 33-03 | 30-item method reconstruction | Reserve a long session: the complete 2016 version averaged about 90 minutes. Activities are not silently localized. | No verified facsimile of the 1978 paper questionnaire; items, dimensions and full stages are checked against the original and 2016 replication. |

## Tasks not yet restored

| ID | Task | Original design, briefly | Restoration gap | Source |
| --- | --- | --- | --- | --- |
| 04-07 | Nonregressive prediction | Groups evaluated a practice lesson, predicted competence five years later, or did both. | PDF 72–73 describes methods but omits all seven stimuli. The freshman example on PDF 70 is recovered, but uses a different target and measurement and is not this teacher study. All seven original practice-lesson descriptions, exact questions and evaluation/prediction presentation order. Percentile judgments relative to 100 elementary teachers, using five-year-old records in evaluation, prediction or combined groups. | [KT73](https://doi.org/10.1037/h0034747) |
| 09-03 | Belief perseverance after discrediting feedback | Success/failure feedback on a novel discrimination task was discredited before reassessment. | The firefighter variant on PDF 163–167 also omits complete case stimuli; six invented symbol classifications cannot restore it. The 25 genuine/fictitious suicide-note pairs, version-specific feedback schedule and complete posttest wording. Requires feedback retraction and debriefing; fictitious scores must not be treated as ability diagnoses. | [RLH75](https://doi.org/10.1037/0022-3514.32.5.880) |
| 09-05 | Biased assimilation and attitude polarization | Supporters and opponents of capital punishment evaluated mixed evidence and reported attitude changes. | PDF 161–162 is a summary. Published short result cards are recovered and could support a labeled first-stage response task, but not the current full detailed-evidence/polarization procedure. Detailed study reports, methodological critiques and rebuttals, and stimulus tables/figures. Requires prior death-penalty attitudes, evidence on both sides and the evaluation sequence. | [LRL79](https://fbaum.unc.edu/teaching/articles/jpsp-1979-Lord-Ross-Lepper.pdf) |
| 13-01 | Perceptual salience and causality | Observers viewed a conversation from different positions and rated the speakers' causal influence. | Summaries on PDF 155–156 and 212–213 cannot recover the script. Enlarged SVG figures and an invented 0–100 influence question constitute another design. Controlled conversation scripts or recordings, viewpoint-specific viewing procedures and the original attribution questionnaire. Requires controlled live or equivalent video viewing that holds conversation content constant while varying viewpoint. | [TF75](https://doi.org/10.1037/h0077095) |
| 16-02 | Choice and illusion of control | Participants bought real football-card lottery tickets for $1, chose or received matched cards, and later stated resale prices. | The procedure and trilingual price elicitation are recovered from PDF 256–257. Remaining gaps are physical materials and actual ownership/purchase conditions, not an invented hypothetical price question. Two matched sets of 227 football-player cards and matched-allocation records. Requires actual $1 purchase, roughly $50 prize pool, matched cards for no-choice participants and pre-draw asking prices, retaining initial refusal separately. | [L75](https://nuovoeutile.it/wp-content/uploads/2014/10/Langer1975_IllusionofControl.pdf) |
| 17-01 | Illusory correlation | Controlled pairings of drawing features and symptoms were followed by judgments of association. | PDF 261–264 supplies six symptoms, counts and exposure timing. The missing 45 drawings cannot be replaced by three SVGs or another study’s word-association scale. The 45 original human-figure drawings, picture-level symptom assignments and complete posttest. Two symptoms per drawing, each of 15 pairs three times, 30 seconds per drawing; no clinical diagnosis. | [CC67](https://pubmed.ncbi.nlm.nih.gov/4859731/) |
| 20-01 | Information and overconfidence | Thirty-two judges received case information in four stages and repeatedly reported judgments and confidence. | The first stage and five examples on PDF 308–311 are recovered, but these alone cannot implement the increasing-information manipulation. Complete stage 2–4 case records and the 20 unpublished questions of 25, including options and factual keys. Repeat the same 25 five-choice questions over four stages, with 20–100% confidence for every item. | [O65](https://doi.org/10.1037/h0022125) |

## Relationship to source designs

- Height compares confidence in predicting father from son versus son from father, with three choices. It is distinct from the eye-color conditional-likelihood question. There is no 180 cm threshold, equal-marginal premise or extra 0–100 rating.

- Restored tasks include the eight-target Linda ranking, six-child family-count estimate, and Jones route/time accident versions. The two-bag task is a chapter 25 example with one 0–1 probability judgment, retaining the original 0.5 cues; it is not the full research program.

- 11-06 shows one expression for five seconds after readiness. The deadline captures the last valid input; blank or invalid input is null. Interruption, reload and hiding the page also produce null, without repeating the expression. Screen and keyboard replace a blackboard.

- Seven additions cover two hypothetical bet pairs; Jack, Dick and the null profile; false-consensus Study 3; the conversation pilot; Gurka Experiment 1; 24 bag–can odds judgments; and the full 30-item risk method. Selecting all 14 tasks gives 86 readiness/response pages.

- Conversation partners must share a real conversation and answer independently. Estimates need not total 100. Only reciprocal partner IDs within one lesson enter conversationPairs. Exports give each self-estimate minus the partner’s estimate of that person and the pair mean; these are not objective speaking-time accuracy scores.

- The 30-item risk task uses the original study plus the 2016 replication. Minimum-ranked items are fixed at 10; ties, decimal responses and ratios above 100 are allowed. All nine scales retain their order and direction. Reserve a long session: the complete 2016 version averaged about 90 minutes.

- Translation, screen responses, consecutive administration and teacher-selected ordering are changes from the source studies. Back-translation, cross-language equivalence and psychological effects have not been validated. Each task uses one specified version, not all conditions or studies in its chapter.

- See the [design audit](docs/design-audit.md) and [early](docs/audit-early.md), [middle](docs/audit-middle.md), [late](docs/audit-late.md) reports. PDF references count file pages from 1 in the supplied 598-page reflowed edition; they differ from printed book pagination.

## Data and verification

- data/local.sqlite stores student IDs, teacher settings, lesson IDs, seeds, individual task orders, versioned protocols, responses and timing. Another lesson creates separate records for the same student ID. ID entry identifies a record; it does not authenticate the person.

- JSON schemaVersion=5 includes lessons, runs, sessions and full stimulus/translation snapshots. CSV has one row per response field, including lesson ID, teacher settings, experiment order, choice order, language, presentation hash and timing. Researchers code free text manually.

- Historical responses and protocols remain intact and distinct from new teacher-1 records. Old stimuli are not rewritten as corrected stimuli. Assigned but unseen tasks appear in JSON with zero responses.

- Use a separate DATA_DIR for testing. data/, environment files and logs are ignored by Git. Stop the server and copy data to back it up. .env is not automatically loaded; use node --env-file=.env server/index.mjs if needed. PORT defaults to 3000.

- The server binds only to 127.0.0.1. Teacher and student flows can currently be checked on the same PC. Access from other student computers, teacher authentication, recruitment, payments and public deployment are not implemented.

- npm test covers source scales, input constraints, translations, teacher start/end, waiting/resume, retries, saved random orders, exports and legacy records. npm run check checks syntax, metadata and generated READMEs. Test data is separate from participant records.

Typography matches PRP. Japanese uses the bundled Noto Sans JP Variable (@fontsource-variable/noto-sans-jp 5.3.0); other languages use PingFang SC, Microsoft YaHei, Helvetica Neue and Arial in that order. [Font license](public/fonts/noto-sans-jp/LICENSE).

~~~sh
npm test
npm run check
npm run docs
~~~

## Key files

| File | — |
| --- | --- |
| content/catalog.json | All 21 designs, sources, audit and availability |
| server/restored.mjs / public/revised-messages.js | Restored protocols and trilingual stimuli |
| server/expanded.mjs / public/expanded-messages.js | Seven expanded protocols and trilingual stimuli |
| server/classroom.mjs | Teacher settings, waiting students and durable assignments |
| server/store.mjs / server/runs.mjs | SQLite, response persistence/exports and legacy compatibility |
| public/app.js / public/admin.js | Student and teacher interfaces |
| tests/classroom.test.mjs | Teacher-flow and source-restoration regression tests |

## Original sources

Checked against the user-supplied book PDF and original papers. The PDF itself is not bundled. Restoration is limited to the specified task versions.

- **TK74** — Tversky & Kahneman (1974). Judgment under Uncertainty: Heuristics and Biases. Science, 185, 1124–1131. [Source](https://doi.org/10.1126/science.185.4157.1124)

- **KT72** — Kahneman & Tversky (1972). Subjective probability: A judgment of representativeness. Cognitive Psychology, 3, 430–454. [Source](https://api.pageplace.de/preview/DT0400.9781107266070_A23693425/preview-9781107266070_A23693425.pdf)

- **KT73** — Kahneman & Tversky (1973). On the psychology of prediction. Psychological Review, 80, 237–251. [Source](https://doi.org/10.1037/h0034747)

- **TK82R** — Tversky, A., & Kahneman, D. (1982). Judgments of and by representativeness. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 84–98). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/judgments-of-and-by-representativeness/7565F5DCBEC82B58C6428ABE8F7304AB)

- **TK80** — Tversky & Kahneman (1980). Causal schemas in judgments under uncertainty. In Fishbein (Ed.), Progress in Social Psychology, Vol. 1, 49–72. [Source](https://amsr.contentdm.oclc.org/digital/api/collection/p21050coll5/id/3872/download)

- **RLH75** — Ross, L., Lepper, M. R., & Hubbard, M. (1975). Perseverance in self-perception and social perception: Biased attributional processes in the debriefing paradigm. Journal of Personality and Social Psychology, 32(5), 880–892. [Source](https://doi.org/10.1037/0022-3514.32.5.880)

- **LRL79** — Lord, Ross & Lepper (1979). Biased assimilation and attitude polarization: The effects of prior theories on subsequently considered evidence. Journal of Personality and Social Psychology, 37, 2098–2109. [Source](https://fbaum.unc.edu/teaching/articles/jpsp-1979-Lord-Ross-Lepper.pdf)

- **RGH77** — Ross, L., Greene, D., & House, P. (1977). The “false consensus effect”: An egocentric bias in social perception and attribution processes. Journal of Experimental Social Psychology, 13(3), 279–301. [Source](https://doi.org/10.1016/0022-1031(77)90049-X)

- **TK73A** — Tversky & Kahneman (1973). Availability: A heuristic for judging frequency and probability. Cognitive Psychology, 5, 207–232. [Source](https://noorsiddiqui.com/papers/TverskyKahneman.pdf)

- **RS79** — Ross & Sicoly (1979). Egocentric biases in availability and attribution. Journal of Personality and Social Psychology, 37, 322–336. [Source](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Negotiation_and_Conflict_Management/Ross_Sicoly_1979_Egocentric_biases.pdf)

- **TF75** — Taylor, S. E., & Fiske, S. T. (1975). Point of view and perceptions of causality. Journal of Personality and Social Psychology, 32(3), 439–445. [Source](https://doi.org/10.1037/h0077095)

- **KT82S** — Kahneman, D., & Tversky, A. (1982). The simulation heuristic. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 201–208). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/simulation-heuristic/9C6ED91A6429A8443641641DC41A52FE)

- **L75** — Langer (1975). The illusion of control. Journal of Personality and Social Psychology, 32, 311–328. [Source](https://nuovoeutile.it/wp-content/uploads/2014/10/Langer1975_IllusionofControl.pdf)

- **CC67** — Chapman & Chapman (1967). Genesis of popular but erroneous psychodiagnostic observations. Journal of Abnormal Psychology, 72, 193–204. [Source](https://pubmed.ncbi.nlm.nih.gov/4859731/)

- **O65** — Oskamp (1965). Overconfidence in case-study judgments. Journal of Consulting Psychology, 29, 261–265. [Source](https://doi.org/10.1037/h0022125)

- **F75** — Fischhoff (1975). Hindsight ≠ foresight: The effect of outcome knowledge on judgment under uncertainty. Journal of Experimental Psychology: Human Perception and Performance, 1, 288–299. [Source](https://web.mit.edu/curhan/www/docs/Articles/15341_Readings/Behavioral_Decision_Theory/Fischhoff_1975_Hindsight_is_not_equal_to_foresight.pdf)

- **ED68** — Edwards (1968). Conservatism in human information processing. In Formal Representation of Human Judgment, 17–52. [Source](https://pages.ucsd.edu/~mckenzie/Edwards1968excerpts.pdf)

- **GKP73** — Gettys, Kelly & Peterson (1973). The best guess hypothesis in multistage inference. Organizational Behavior and Human Performance, 10, 364–373. [Source](https://deepblue.lib.umich.edu/handle/2027.42/33759)

- **SFL82** — Slovic, P., Fischhoff, B., & Lichtenstein, S. (1982). Facts versus fears: Understanding perceived risk. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), Judgment under Uncertainty: Heuristics and Biases (pp. 463–490). Cambridge University Press. [Source](https://www.cambridge.org/core/books/abs/judgment-under-uncertainty/facts-versus-fears-understanding-perceived-risk/F2E2E20E89E2121C7BCB43672D590EB8)

- **BH73** — Bar-Hillel, M. (1973). On the subjective probability of compound events. Organizational Behavior and Human Performance, 9(3), 396–406. [Source](https://doi.org/10.1016/0030-5073(73)90061-5)

- **FSLRC78** — Fischhoff, B., Slovic, P., Lichtenstein, S., Read, S., & Combs, B. (1978). How safe is safe enough? A psychometric study of attitudes towards technological risks and benefits. Policy Sciences, 9, 127–152. [Source](https://doi.org/10.1007/BF00143739)

- **FGW16** — Fox-Glassman, K. T., & Weber, E. U. (2016). What makes risk acceptable? Revisiting the 1978 psychological dimensions of perceptions of technological risks. Journal of Mathematical Psychology, 75, 157–169. [Source](https://elke-u-weber.com/media/2016_journal_of_mathematical_psychology_fox-glassman.pdf)

[Selection spreadsheet](https://docs.google.com/spreadsheets/d/1E6j0l_dqVMttijLAn5mud7CvreEPOiTsKCHZV-zfaYI/edit)
