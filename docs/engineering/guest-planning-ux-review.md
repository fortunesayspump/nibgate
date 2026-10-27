# Guest-planning UX review

## Basis and scope

This is a bounded review of the implemented flow, not a claim that functional tests prove product polish or WCAG conformance. We preserved Nibgate's existing typography, monochrome palette and layout. No new icon library, stock artwork, decorative motion or brand system was introduced. The existing decorative concentric loading pulse was removed in favor of clear progress text.

The independent reviewer checked leading-product and service-design references online:

- [Miro's online whiteboard / Miro Lite](https://miro.com/online-whiteboard/) demonstrates useful work before registration, temporary autosave, visible lifetime and an account-save prompt. We adopt that progression, not its retention semantics: Miro's temporary board lifetime is not Nibgate's guest-compute expiry, and Nibgate does not claim browser ciphertext is deleted at that time.
- [GOV.UK One Login: save progress](https://www.sign-in.service.gov.uk/documentation/design-recommendations/save-progress) supports completing part of a journey before an account prompt to finish later. This informs the contextual save action, not any identity assurance or implementation equivalence.

Official accessibility guidance:

- [W3C status messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html): announce asynchronous progress without forcing users to discover changed content.
- [WAI radio pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/): single-choice groups need checked state and keyboard operation. We use native radios rather than reimplementing that behavior.
- [WAI form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/): explain errors and provide a concrete next action while preserving entered data.
- [W3C timeouts](https://www.w3.org/WAI/WCAG22/Understanding/timeouts.html): explain time constraints. This is AAA guidance, not a claim of AA failure or compliance.

## Concrete fixes

- Guest review has a single primary sign-in action, not a competing permanently disabled approval button. Source summaries distinguish a text-only plan from uploaded files and future funded web research.
- Guest configuration clearly separates sponsored, limited planning from later research payment. Controls lock while their submitted request is pending; a status explains why.
- Free/Other answers are labeled and visibly focusable. Answer choices and report length use native radios/checkboxes; multiple-choice Other no longer hides selected standard choices. Output toggles expose pressed state.
- Phase changes focus the relevant heading; intake/planning progress is announced. No background sign-in, funding or execution is introduced.
- The sign-in button distinguishes waiting for authentication from saving/checking the account plan. Cancellation confirms that the retained draft remains available.
- Saved-state copy is tied to the last persisted snapshot, not an outdated saved flag. Storage errors remain visible. An explicit account-storage alternative is available only before a guest project exists, preserving the question and avoiding a silent guest reset.
- Session expiry/limits are taken from server-issued metadata. Expiry ends guest computation, not local draft deletion. Expired draft reads/adoption remain possible; no fabricated plan deadline is shown.
- Recovery distinguishes an explicit read retry from sign-in/save; permanent expiry is not presented as an endless reconnect loop. A blocked restore message is not erased by unrelated successful autosaves.
- Saving an edited single plan step now persists it instead of silently discarding the edit.

## Evidence and limits

The test harness renders the real research page and real production CSS at desktop/mobile widths. Auth, APIs, worker output and payment controls are explicitly synthetic boundaries, not real accounts or research. Separate browser tests exercise actual IndexedDB/WebCrypto/Web Locks. Visual checks include loading, planning, errors, cancellation and storage failure, not only the successful plan screen. Native radio/checkbox keyboard paths, configuration locking and single-step edits have regression coverage.

This review is not a full-app navigation audit, assistive-technology certification, user study or production Phala/OAuth verification. The feature remains default-off pending the documented operator rollout gates.
