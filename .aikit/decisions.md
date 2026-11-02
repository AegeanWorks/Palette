# Decisions

Why this project is built the way it is, oldest first. One entry per decision that changes a
contract, a dependency, a data format or the architecture; IDs are consecutive and never reused.

<!-- Entry format:
### ADR-NNN: <decision in one line>
- **Date**: YYYY-MM-DD
- **Status**: Accepted
- **Context**: <what forced the decision>
- **Decision**: <what was decided>
- **Consequences**: <what follows, including what it costs>
-->

### ADR-001: Re-take the welcome screenshot at current HEAD and add the export dialog
- **Date**: 2026-11-02
- **Status**: Accepted
- **Context**: The approved `2026-10-31-home.png` (commit `0e484e5`) predates 529 insertions across `editor.js`, `canvas.js`, `paint.js` and `document.js`; pixels still match but the currency commit is stale, and coverage was one view only.
- **Decision**: Keep the prior file as history; add `2026-11-02-home.png` (fresh welcome from `npm start` at `http://127.0.0.1:4176`, viewport 1440x900, commit `1bda086`) and `2026-11-02-export.png` (same build after clicking Export: name/format/scale/output readout). Approve the pending `social-preview.png` (pixel-identical to the approved SVG). Wire the `aegean:screenshots` and `aegean:brand-assets` blocks into the README.
- **Consequences**: README shows current proof with commit `1bda086`; the dossier keeps the old shot plus two ingests. Reproduce with: `npm start -- --port 4176`, open the URL, viewport screenshot, click Export, screenshot.
