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

| Component                                  | Responsibility                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `App`                                      | Queue visibility, navigation, focus, mutation guards, analysis coordination       |
| `useWorkspace`                             | Selected entry, cancelable reads, accepted responses, queue/detail consistency    |
| `useSavedAction`                           | Save-before-action gate, registered persistence, pending action identity          |
| `useAnalysis`                              | Analysis request lifetime, cancellation, stale response rejection                 |
| `SubmissionQueue`                          | Queue display and filtering controls                                              |
| `SubmissionReader`                         | Original passages and exact citation highlights                                   |
| `EvidenceReview`                           | Findings, source links, provenance disclosure, analysis controls                  |
| `ReviewProcess`                            | Criterion selection, validation guidance, confirmation and recovery focus         |
| `useAssessmentDraft`                       | Keyed draft fields, autosave coordination, final request and acknowledged version |
| `RecommendationFields` / `DraftSaveStatus` | Recommendation inputs, score summary, save feedback and recovery controls         |
| `Dialog` / `Notice`                        | Focus restoration and accessible feedback                                         |
| `ActionButton`                             | Guarded unavailable actions with hover, keyboard, and touch explanations          |

ReviewProcess remains mounted across workflow steps and owns one draft, so navigation preserves typed work. CriterionScore renders the current score controls and shared scale. Passage IDs remain stable within a submission version. Workspace responses are applied only if no newer read or accepted mutation has superseded them.

The queue closes when evidence review or scoring begins, reclaiming its entire column. The labeled Show review queue control reopens it and focuses the filter without resetting the current review, filter, or unsaved assessment. Each criterion displays its evidence and human score together. Selecting a score keeps the current criterion and keyboard focus intact; Next criterion is explicit. The recommendation summarizes all scores, with Edit score returning to the corresponding evidence. The selected scale meaning remains visible beneath its radio group.

Draft edits save after a short pause. The writer serializes requests and drains newer edits before navigation or export. Inputs stay editable during background saves. Show Saving changes and All changes saved inline; reserve retry and reload actions for failures. Header actions show local pending feedback when waiting for a save, and keyboard retry retains a stable focus target. Finalization remains explicit.

Unavailable Finalize and AI actions remain keyboard discoverable with `aria-disabled` and guarded activation. Hover or focus reveals their reason below the button without moving it; touch can request the same guidance. Escape dismisses it, returning focus to the trigger if a guidance link was focused. For incomplete finalization, use the semantic error color on missing labels, borders, and score rows, paired with specific written requirements and direct links to each field or criterion. Mark invalid controls with `aria-invalid` and associate the explanation through `aria-describedby`. Keep completed inputs unmarked, clear each requirement as it is corrected, and explain operational waits without inventing field errors.

Each extracted quote is a figure with a distinct commentary caption labeled Why this matters. Keep the verbatim words inside the source button and put the criterion-specific explanation outside it. Associate the caption using `aria-describedby`; returning from the source restores the exact triggering quote. Reuse neutral surfaces and borders instead of adding another evidence-status color.

Cloud startup feedback uses the existing warning palette in a prominent full-width panel. Show it after a delayed initial connection, remove it on success, and replace it with recovery on error. A normal fast response should never leave a startup notice behind. The shared-workspace label states a consequence that affects visitors' work; do not scatter hosting details elsewhere in the loaded interface.

## Copy and layout rules

- Give the first screen one clear next action. Keep the optional walkthrough in one place, with one card at a time.
- Use concrete action labels and explanations. Keep sample-data and affiliation context in the README; do not repeat it around the workspace. Preserve accurate analysis-source labels and actionable reasons for unavailable controls.
- Place short metadata and related actions on the same row where they fit. Keep original text beside evidence and scoring on desktop; allow normal document flow on phones.
- Show one evidence criterion per page, with Previous/Next, a direct selector, and a page count. Place score controls beside the current evidence and preserve inputs across criteria. Keep the final recommendation focused on the score summary and decision. Use native accordions for secondary detail. Keep every filter available at the widths where its results are visible.
- Preserve pending, success, failure, cancellation, and unsaved states. Page buttons focus the visible destination heading; native selectors retain keyboard focus. Finalization focuses its recorded result.
- Give source inspection a return path to the originating quotation. Clear the highlighted passage when changing criteria or workflow steps.
- Check keyboard focus, contrast, narrow reflow, enlarged text, short screens, and access to the bottom of sticky panels after layout changes.
