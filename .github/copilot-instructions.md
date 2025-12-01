## Purpose

This file gives concise, repo‑specific guidance for AI coding assistants. Read this first to understand how this app is structured and how to make safe changes quickly.

## Quick repo snapshot
- Type: Single‑page React app (Vite)
- Entry: `index.html` → `/src/main.jsx`
- App root: `src/main.jsx` mounts React and renders `App` from `src/App.jsx`
- Scope: Pure frontend (no backend, no external API code)
- State/persistence: React Context in `src/state/PaletteContext.jsx`, auto‑saved to `localStorage` under `patlang:v1`

## What this app does
A small visual node/flow editor:
- Left sidebar: a palette with sections for Diagrams, Wires, Boxes, and Equations
- Center canvas: an interactive graph powered by `@xyflow/react` (ReactFlow‑like)
- Drag a Box from the palette to the canvas to create a node
- Nodes expose input/output handles; edges may connect only when the wire types match; edges are colored using the wire type’s color
- Diagrams capture a specific canvas state (nodes/edges) and can be switched via the palette
- Top menu supports exporting/importing JSON and clearing local data

## Tech & libraries
- Build tool/dev server: Vite
- Canvas/graph: `@xyflow/react` (CSS import is required in the canvas component)
- UI: Material UI (`@mui/material`, `@mui/icons-material`), `mui-color-input`
- React 19, ESM modules, `.jsx` components

## Key files to open first
- `package.json` — scripts and dependencies
- `vite.config.js` — Vite config and React plugin
- `index.html` — HTML entry
- `src/main.jsx` — app bootstrap (imports `index.css` and renders `<App />`)
- `src/App.jsx` — top‑level app with initial palette sections and layout wiring
- `eslint.config.js` — lint rules and ignores

Core app components
- `src/state/PaletteContext.jsx` — global palette/canvas state (sections, nodes, edges), autosave to localStorage, and helper `findItemByType(sectionKey, type)`
- `src/components/Layout/Layout.jsx` — page layout shell (header + sidebar + main)
- `src/components/Layout/TopMenu.jsx` — top menu bar; it now delegates dialog UIs to small focused components (Save/Load/Clear/Generate)
- `src/components/Layout/GenerateCodeDialog.jsx` — dialog for generating code from diagrams/equations (includes validation UI and a Generate action)
  - Notes: the Generate Code dialog now keeps an in-memory `wizardState` that includes per-wire configuration: `wireDims`, `wireSelects` and `wireOneHot` (boolean flags indicating if a wire should be treated as one-hot). The dialog reconciles these mappings when the available wire types change (preserves existing values, defaults `wireOneHot` to `false` for new wires) and passes them into the step components.

  - `src/components/Layout/GenerateSteps/` — a small folder of step components used by `GenerateCodeDialog`. Each step is a focused, mostly presentational component; the dialog owns the in-memory `wizardState` and passes controlled props + callbacks into the steps.
    - `ValidationStep.jsx` — computes validation errors for the current diagrams/equations and reports them back via `onValidationChange(errors)`. Shown as the first step to prevent advancing when there are blocking issues.
    - `DimensionsStep.jsx` — controlled UI for assigning per-wire dimensions and a one-hot flag. Contract:
      - Props: `wires`, `value` (wireDims map), `selects` (wireSelects map), `oneHot` (wireOneHot map), `onChange(nextWireDims, nextWireSelects, nextWireOneHot)`, `onValidityChange(valid)`.
      - Behavior: fully controlled (no local state). `onChange` is called whenever the dimension or one-hot toggles change. Validation (numeric > 0) is computed from `value` and reported via `onValidityChange`.
    - `ArchitectureStep.jsx` — UI to configure learner-specific architectures and settings. Receives `learners`, `value` (learnerConfigs), `onChange` and `onValidityChange` and is responsible for validating learner configuration.
  - `EquationsStep.jsx` — interactive UI for configuring loss functions and training options per equation. It lists equations from the palette and for each lets you set a numeric weight, choose which learner nodes should be trained, and pick a per-output-wire loss (L2, SSIM, BCE, CE) with sensible defaults (one-hot wires default to CE). Used on the final step to configure loss/learner settings before generating.
    - `WizardStepper.jsx` — bottom-aligned stepper/navigation used by the dialog. Props: `steps`, `activeStep`, `onBack`, `onNext`, `onClose`, `canAdvance`.
- `src/components/Layout/SaveDialog.jsx` — export JSON dialog (generates payload and supports copy/download)
- `src/components/Layout/LoadDialog.jsx` — import JSON dialog (file chooser, example loader, parsing/validation, calls back to apply imported data)
- `src/components/Layout/ClearDialog.jsx` — clear-confirmation dialog (performs localStorage clear and reload by default)
- `src/components/Sidebar/Sidebar.jsx` — renders palette sections
- `src/components/Sidebar/PaletteSection.jsx` — section UI, expand/collapse, add/edit dialogs
- `src/components/Sidebar/PaletteItem.jsx` — item row, drag source, delete/edit, double‑click to open diagrams
- `src/components/Sidebar/AddWireDialog.jsx` — create/edit wire type `{ type, label, color }`
- `src/components/Sidebar/AddBoxDialog.jsx` — create/edit box `{ type, label, color, kind, inputs[], outputs[] }` with drag‑and‑drop wire ports and reordering
- `src/components/Sidebar/AddDiagramDialog.jsx` — create/edit diagram `{ type, label, nodes, edges }`
- `src/components/Sidebar/AddEquationDialog.jsx` — create/edit equation `{ type, label, 'lhs-type', 'rhs-type' }` with validation across two diagrams (now uses shared validation helpers)
- `src/components/Canvas/Canvas.jsx` — ReactFlow integration: drag‑drop from palette, connect rules, connection preview color, debounced persist to the opened diagram
- `src/components/Canvas/CustomNode.jsx` — node renderer; fills defaults from the box palette; draws `in-*` and `out-*` handles with wire colors
- `src/index.css` — global and custom node styles

Helper utilities
- `src/utils/validation.js` — shared validation helpers used by `AddEquationDialog` and `GenerateCodeDialog` (analyze output nodes, collect node instances, detect missing input connections)

## Data model overview
Palette sections (stored in Context):
- Diagrams (`key: 'diagrams'`): items like `{ type, label, opened?, nodes, edges }`
- Wires (`key: 'wires'`): items `{ type, label, color }`
- Boxes (`key: 'boxes'`): items `{ type, label, color, kind, inputs[], outputs[] }`
- Equations (`key: 'equations'`): items `{ type, label, 'lhs-type', 'rhs-type' }`

Canvas state (also in Context and in the opened diagram):
- Nodes: ReactFlow nodes with shape `{ id, type: 'custom', position, data: { type: <boxType>, label?, color?, inputs?, outputs? } }`
- Edges: ReactFlow edges; allowed connections only when output wire type equals input wire type. One edge per target input handle.

Important conventions
- Handle IDs must stay as `in-<index>` or `out-<index>`; connection and validation logic depends on this pattern
- `CustomNode` chooses final values from explicit node `data` first, then falls back to the box palette definition
- Edges are styled with the wire color from the Wires section

## Interaction and rules
Drag and drop
- `PaletteItem` sets `DataTransfer` with `application/x-node-type` when dragging a Box
- `Canvas.jsx` reads that MIME type on drop, creates a node at the dropped position via `screenToFlowPosition`

Connections and coloring
- `onConnect` in `Canvas.jsx` finds the source/target box types, compares the selected handle’s wire type entries, and rejects mismatches
- Only one edge may connect to a given input handle (target side)
- Edge color and connection preview color are taken from the Wire definition (`color`)

Diagram management
- Double‑click a diagram item to “open” it, which also loads its stored `nodes/edges` into the shared canvas state
- `Canvas.jsx` debounces persisting the current `nodes/edges` back into the currently opened diagram item
- Top menu can export/import `{ sections, nodes, edges }` and clear local data (localStorage)

## Running and verifying changes
- Start dev server:
  ```bash
  npm install
  npm run dev
  ```
  The app will hot‑reload; this is sufficient to verify code changes. A production build is NOT required when changing code.

- Optional linting (run if needed):
  ```bash
  npm run lint
  ```
  Lint config ignores `dist` and uses a custom `no-unused-vars` pattern that ignores names matching `^[A-Z_]`.

- Optional production build/preview (not needed for typical edits):
  ```bash
  npm run build
  npm run preview
  ```

## Manual test checklist
1. Run `npm run dev` and open the app (usually http://localhost:5173)
2. In the palette, add at least one Wire and one Box; drag a Box onto the canvas → a node appears at the drop point
3. Connect compatible handles (matching wire types) → connection succeeds and edge is colored
4. Attempt a mismatched connection → connection is rejected
5. Double‑click a diagram to open/switch; verify canvas loads saved nodes/edges
6. Use Top menu Save to export JSON; Load to import JSON; Clear to wipe local storage and reload

## Editing guidance for assistants
- Make small, focused changes under `src/`
- Keep `@xyflow/react/dist/style.css` import in `src/components/Canvas/Canvas.jsx`
- Preserve handle ID format `in-<i>` and `out-<i>`
- When changing components or behavior, the main places to edit are `PaletteContext.jsx`, `Canvas.jsx`, `CustomNode.jsx`, and the Sidebar files
- If you add dependencies, update `package.json` and run `npm install`
- To validate coding style, run the linter as needed; a build is not required to verify code edits

## Notes / limitations
- No automated tests or CI configured
- Pure frontend app; avoid introducing server dependencies without discussion
