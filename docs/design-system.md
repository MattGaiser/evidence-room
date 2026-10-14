# Interface system

## Brand palette

The colors come from the official [XPRIZE Brand Manual](https://styleguide.xprize.org/) and its [core palette artwork](https://styleguide.xprize.org/wp-content/uploads/2020/05/01-CorePalette-02.png).

| Color          | Hex       | Use                                  |
| -------------- | --------- | ------------------------------------ |
| XPRIZE Black   | `#151515` | Text, primary actions, notices       |
| Off-white      | `#F6F6F6` | Workspace and secondary surfaces     |
| XPRIZE Grey    | `#D4D3D9` | Dividers and neutral borders         |
| Future Fuchsia | `#DD00F0` | Selected navigation, progress, focus |
| Radical Red    | `#F00048` | Error and attention borders          |

Keep most of the interface monochrome, with color reserved for a meaningful state. White and accessible darker neutral text complete the UI palette. Bright brand colors are not body-text colors. Helvetica with Arial fallback follows the manual's fallback typography guidance, without requiring proprietary font files.

Functional colors distinguish evidence states and make source quotations easy to find:

| Meaning            | Foreground | Background | Additional cue                     |
| ------------------ | ---------- | ---------- | ---------------------------------- |
| Evidence described | `#176044`  | `#E7F4ED`  | Check icon and written label       |
| Needs detail       | `#784500`  | `#FFF1CF`  | Attention icon and written label   |
| Not provided       | `#9F2434`  | `#FFEBEE`  | Question icon and written label    |
| Source quotation   | `#151515`  | `#FFEB80`  | Passage focus and source reference |

These text/background pairs exceed WCAG AA's 4.5:1 threshold for normal text. Color is never the only evidence-status cue. Automated browser checks verify the rendered pairs and axe rules; keyboard, reflow, and focus checks cover the paginated workflow. These checks do not constitute a full accessibility conformance audit.

## Ownership

`web/tokens.css` owns color values, spacing, radii, type, shadows, and control height. `web/styles.css` owns shared controls, component layouts, and responsive rules. Components use semantic classes instead of inline colors or local theme objects. Use the existing spacing scale and shared button, field, panel, and dialog treatments when adding a control.

| Component           | Responsibility                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| `App`               | Selected entry, pending operations, navigation, mutation guards, API coordination |
| `SubmissionQueue`   | Queue display, filtering controls, disclosure state                               |
| `SubmissionReader`  | Original passages and exact citation highlights                                   |
| `EvidenceReview`    | Findings, source links, provenance disclosure, analysis controls                  |
| `Scorecard`         | Unsaved scores and reasoning, draft/final actions                                 |
| `Dialog` / `Notice` | Focus restoration and accessible feedback                                         |

The scorecard remains mounted across workflow steps so navigation preserves typed work. Passage IDs remain stable within a submission version. Workspace responses are applied only if no newer read or accepted mutation has superseded them.

## Copy and layout rules

- Give the first screen one clear next action. Keep the optional walkthrough in one place, with one card at a time.
- Use concrete action labels and explanations. Keep sample-data and affiliation context in the README; do not repeat it around the workspace. Preserve accurate analysis-source labels and actionable reasons for unavailable controls.
- Place short metadata and related actions on the same row where they fit. Keep original text beside evidence and scoring on desktop; allow normal document flow on phones.
- Show one evidence criterion per page, with Previous/Next, a direct selector, and a page count. Separate scores from recommendation details; preserve inputs across pages. Use native accordions for scoring and secondary detail. Keep every filter available at the widths where its results are visible.
- Preserve pending, success, failure, cancellation, and unsaved states. Page buttons focus the visible destination heading; native selectors retain keyboard focus. Finalization focuses its recorded result.
- Check keyboard focus, contrast, narrow reflow, enlarged text, short screens, and access to the bottom of sticky panels after layout changes.
