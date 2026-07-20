# Plan: Phase 2: Add Color/Visibility to "total this run"
Implement the color/styling enhancement to make the "total this run" output prominently visible in the UI or terminal output.

### Phase 2: Add Color/Visibility to "total this run"
Implement the color/styling enhancement to make the "total this run" output prominently visible in the UI or terminal output.

Context from previous phases:

### Phase 1: Investigate Current "total this run" Output
Locate where "total this run" is generated in the codebase, understand its current formatting, and identify where color/styling can be added to make it more visible.
Phase 1 investigated the "total this run" output in `src/core/consoleReporter.ts`, locating it at line 144 within the `reportUsage()` function. The current formatting applies `ANSI.dim` to the entire line, making the total less visible, while the `color()` helper and full ANSI palette are already available for styling. The next phase can proceed with implementation, knowing the change is localized to a single line and that TTY detection and graceful degradation are already handled.

_Phase report: tasks/total-this-run-add-color-to-this-so-it-is-visibe-rca-you-sto-phase-1.md_


Complete this phase. Do not work on future phases — focus only on what this phase requires.

- [ ] Read the Phase 1 report (`tasks/total-this-run-add-color-to-this-so-it-is-visibe-rca-you-sto-phase-1.md`) to understand the exact location and current formatting of "total this run"
- [ ] Read `src/core/consoleReporter.ts` around line 144 to see the current `ANSI.dim` usage and available `color()` helper
- [ ] Design the styling change: replace `ANSI.dim` with a more visible color (e.g., `ANSI.bold` + `ANSI.fg.green` or `ANSI.fg.cyan`) while keeping the existing TTY detection and graceful degradation
- [ ] Implement the change in `src/core/consoleReporter.ts` — modify the "total this run" line to use the chosen color/styling
- [ ] Run the test suite to verify no regressions
- [ ] Verify the output visually by running the application or a relevant test that triggers `reportUsage()`
