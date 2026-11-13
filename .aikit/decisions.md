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

### ADR-004: Add Stamp Visible layer command, and Sepia & Emboss filters
- **Date**: 2026-11-13
- **Status**: Accepted
- **Context**: Palette lacked a non-destructive way to merge visible layers into a fresh composite layer without destroying the underlying layer stack, as well as classic vintage sepia and 3D relief emboss filters.
- **Decision**: Add `stampVisible` to `src/ui/editor.js` with button `#btn-stamp-visible` and shortcut `Ctrl+Alt+Shift+E`; add `applySepia` and `applyEmboss` (convolution with neutral gray bias) to `src/core/filters.js` with buttons `#btn-filter-sepia` and `#btn-filter-emboss`; bump Palette to 0.17.0; verify with 105 unit tests and headless browser dogfood.
- **Consequences**: Retouchers and artists can create non-destructive composite layers instantly and apply vintage warmth and 3D embossing with full undo/redo and selection clipping.

### ADR-005: Add Selection Expand/Contract and Destructive Brightness/Contrast Filter
- **Date**: 2026-11-13
- **Status**: Accepted
- **Context**: Palette lacked marquee boundary expansion/contraction for refining selections by fixed margins (e.g., expanding a feathered border or shrinking an object mask), as well as a destructive Brightness/Contrast filter applicable directly to pixel buffers or selected regions.
- **Decision**: Add pure function `expandSelection(selection, delta, width, height)` to `src/core/geometry.js` preserving selection kind/invert flags with boundary clamping and empty guard; add pure function `applyBrightnessContrast(pixels, { brightness, contrast })` to `src/core/filters.js` using photographic contrast curve `(259 * (contrast + 255)) / (255 * (259 - contrast))` and linear brightness shift; expose buttons `#btn-expand-selection` (`data-ui="expand-selection"`) and `#btn-contract-selection` (`data-ui="contract-selection"`), sliders `#filter-brightness` and `#filter-contrast`, and button `#btn-filter-bc` (`data-ui="filter-bc"`) in `index.html`; wire undoable commands and dynamic disabled toggling in `src/ui/editor.js`; bump Palette to 0.18.0; verify via 107 unit tests and headless browser dogfood.
- **Consequences**: Users can incrementally grow or shrink active selections by 5px increments with document clamping and apply tone curve adjustments to layers or bounded selections with full undo/redo support.

### ADR-006: Add Destructive Color Balance and Add Noise Filters
- **Date**: 2026-11-13
- **Status**: Accepted
- **Context**: Palette lacked professional color grading for balancing RGB channels (Cyan/Red, Magenta/Green, Yellow/Blue) with perceptual luminance preservation, as well as an Add Noise / grain filter for eliminating 8-bit gradient banding and adding photographic texture.
- **Decision**: Add pure functions `applyColorBalance(pixels, { cyanRed, magentaGreen, yellowBlue, preserveLuminosity })` (with ITU-R BT.709 luminance preservation) and `applyNoise(pixels, { amount, monochrome, seed })` (with PRNG seed support for deterministic tests) to `src/core/filters.js`; expose sliders `#filter-cb-cr`, `#filter-cb-mg`, `#filter-cb-yb`, checkbox `#filter-cb-preserve`, button `#btn-filter-color-balance`, slider `#filter-noise-amount`, checkbox `#filter-noise-monochrome`, and button `#btn-filter-noise` in `index.html`; wire undoable commands and event bindings in `src/ui/editor.js`; bump Palette to 0.19.0; verify via 109 unit tests and headless browser dogfood.
- **Consequences**: Users can perform color grading, white-balance correction, and film-grain texturing on active layers or active selections with full undo/redo support and preserved alpha transparency.

### ADR-007: Add Destructive High Pass and Photo Tint Filters
- **Date**: 2026-11-13
- **Status**: Accepted
- **Context**: Palette lacked high-frequency spatial separation for micro-contrast texture sharpening without edge halos, as well as an optical lens color tinting filter with variable density and luminance preservation.
- **Decision**: Add pure functions `applyHighPass(pixels, radius)` (using separable $O(W \times H)$ box blur with boundary clamping and 128 neutral gray bias) and `applyTint(pixels, { color, density, preserveLuminosity })` (with ITU-R BT.709 perceptual luminance matching) to `src/core/filters.js`; expose slider `#filter-high-pass-radius`, button `#btn-filter-high-pass` (`data-ui="filter-high-pass"`), color input `#filter-tint-color`, slider `#filter-tint-density`, checkbox `#filter-tint-preserve`, and button `#btn-filter-tint` (`data-ui="filter-tint"`) in `index.html`; wire undoable commands and event listeners in `src/ui/editor.js`; bump Palette to 0.20.0; verify via 111 unit tests and headless browser dogfood.
- **Consequences**: Photographers and digital artists can perform frequency-separation edge sharpening and optical gelatin color tints directly on layers or bounded selections with full undo/redo support and preserved alpha transparency.

### ADR-008: Add Find Edges and Solarize Filters, and Flip Layer Commands
- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**: Palette lacked contour sketch extraction, darkroom Sabattier solarization, and 1-click active layer horizontal/vertical flipping.
- **Decision**: Add pure functions `applyFindEdges` (Sobel 3x3 inverted magnitude) and `applySolarize` (Sabattier triangular curve) to `src/core/filters.js`; add `flipActiveLayer(axis)` with buttons `#btn-layer-flip-h` and `#btn-layer-flip-v` to `src/ui/editor.js` and `index.html`; bump Palette to 0.21.0; verify via 113 unit tests and headless browser dogfood.
- **Consequences**: Artists can extract line contours, create solarized darkroom imagery, and flip individual active layers directly with full undo/redo and selection clipping.






