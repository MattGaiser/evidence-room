# Product decisions

The reviewer's problem is not a shortage of text. It is deciding which claims are supported, which questions matter, and whether an unusual proposal satisfies the actual criteria. Evidence Room keeps the original submission beside a criterion-based analysis and leaves the decision to the judge.

## Why this workflow

The supplied XPRIZE role calls for submission intake, AI-assisted review and scoring, clear specifications, tested .NET/React/Python code, and knowledge transfer. A complete review of one submission demonstrates those boundaries without imitating a whole competition platform.

Public XPRIZE material describes expert judging and evaluation against established criteria. The sample therefore assists preparation for human review rather than presenting an automated leaderboard. Its water-access theme is illustrative; it does not reproduce XPRIZE Water Scarcity's rules. Sources: [XPRIZE's introduction to its Water Scarcity judges](https://www.xprize.org/news/meet-the-judges-experts-shaping-the-future-of-water-with-xprize-water-scarcity) and [public competition guidelines](https://assets-us-01.kc-usercontent.com/5cb25086-82d2-4c89-94f0-8450813a0fd3/9e1a75d3-563c-49f0-9933-8eb8426a47f5/XPRIZE%20Water%20Scarcity%20Guidelines%20v3.0.pdf).

Matthew Gaiser's [2020 MindSumo guide](https://gaiser.io/blog/how-to-win-at-mindsumo/) describes assessing more than 400 entries for ATB and the value of ideas borrowed across domains. Its ranking statements are dated, self-authored claims. [HeroX's Writers' Bench results](https://www.herox.com/results-WritersBenchChallenge) independently list Matthew Gaiser in third place. These experiences informed two choices: the unconventional leak-repair entry must receive the same rubric-based treatment as desalination, and missing evidence should produce a concrete question rather than a dismissal based on writing style.

## Interaction system

The three steps are **Read submission**, **Review evidence**, and **Score & recommend**. New users get a useful example and one obvious next action; an optional four-card walkthrough can be replayed. The queue supports comparison without replacing unsaved work. The original narrative is never rewritten by AI.

Evidence links highlight the exact source passage in yellow and focus it. Evidence review shows one criterion at a time, with Previous/Next, a direct selector, and a page count. Status badges combine distinct colors, icons, and explicit labels. On desktop, a bounded sticky control panel keeps review actions beside the submission. On phones, the queue starts collapsed and source passages can be opened when needed. The assessment has two pages: four scores, then rationale and recommendation. Score criteria use native accordions, radio groups, and a shared scale. Both pages support saving, preserve typed work, and offer a direct route to missing scores before finalization. Secondary history and provenance stay collapsed until requested.

The [interface system](design-system.md) documents the official XPRIZE palette, component ownership, and copy rules. `web/tokens.css` owns shared visual values; `web/styles.css` applies them to controls and responsive layouts. The visual hierarchy reserves the strongest treatment for the next action. Labels describe an action or consequence; avoid decorative corner notes and repeating warnings. Keep guidance that helps someone judge or recover, such as explaining that an export includes saved work only.

Every mutation has an observable result: pending analysis, cancellation feedback, saved-draft state, immutable final state, revision number, or export confirmation. Errors remain available until dismissed. Toast expiration pauses on hover or focus. Dialogs restore focus; source links work repeatedly. Dirty scorecards survive step changes and warn before leaving the entry.

Automated axe checks target WCAG A/AA rules at narrow and desktop sizes. Browser checks also cover keyboard focus, modal escape, source links, reflow, save/reload, and conflicts. These checks are evidence for tested states, not a full accessibility conformance audit or a replacement for testing with assistive technology users.
