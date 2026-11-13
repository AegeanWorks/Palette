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

### ADR-002: Add Paint Bucket tool, destructive Invert filter, and keyboard zoom shortcuts
- **Date**: 2026-11-13
- **Status**: Accepted
- **Context**: Palette lacked a rapid contiguous area flood fill / color replacement tool, destructive invert filter on selections/layers, and standard keyboard zoom (+/-) navigation.
- **Decision**: Add `src/core/fill.js` implementing scanline/BFS flood fill with tolerance, contiguous and non-contiguous modes, and selection clipping; add `applyInvert` to `src/core/filters.js`; wire the paint bucket tool (`K`), invert filter button, and keyboard zoom shortcuts into `editor.js`; bump Palette to 0.15.0; verify via 99 unit tests and headless browser dogfood.
- **Consequences**: Palette gains full flood fill and color replace capability without external dependencies, full shortcut parity in help dialog, and validated headless browser coverage.

### ADR-003: Add Desaturate, Threshold, and Posterize creative filters and quick color swatches
- **Date**: 2026-11-13
- **Status**: Accepted
- **Context**: Palette lacked destructive monochrome conversion, custom cutoff thresholding, and channel posterization applicable to layers and selections, as well as fast one-click color swatches.
- **Decision**: Add pure functions `applyDesaturate`, `applyThreshold`, and `applyPosterize` to `src/core/filters.js` operating on RGBA pixel buffers with alpha preservation and ITU-R BT.709 luminance; expose interactive filter controls and preset color swatches in `index.html` and `src/styles.css`; wire event handlers, undoable commands, and swatch buttons in `editor.js`; bump Palette to 0.16.0; verify with 103 unit tests and headless browser dogfood.
- **Consequences**: Users can apply stylized high-contrast monochrome and pop-art posterization with selection clipping and full undo/redo, and pick standard colors quickly without triggering the native OS color picker dialog.

