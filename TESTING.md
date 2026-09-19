# Validation

## Completed

- JavaScript syntax checks for `engine.js` and `game.js`.
- Five regressions reproduced in the supplied original: combat healing, walking healing, sacrifice without selection, healing after fatal recoil, and the large dictionary cache round-trip.
- **62 regression checks passed** against this update, using the actual source with Happy DOM and deterministic random boards.
- Checks include combat/healing/cost order, boss phase changes, curse expiry, phasing, VOID, all four biome transitions, the final crossroads, endless-mode isolation, paused and dead-state input, keyboard DOM events, saving/reloading, malformed saves, blocked storage, legacy high scores and referenced assets.
- The tests make no network requests. The complete dictionary is loaded from the packaged local file.

## Limits of these checks

A real browser preview was unavailable because this environment would not open the local game files. No desktop/phone screenshot, real Web Audio output, screen-lock recovery or mobile touch-layout result is claimed. The tests replace drawing and audio with stubs; they validate game and DOM behavior, not rendered pixels.

Before replacing the popular live build, give this candidate a real-browser playtest. Keep the old deployment available while testing.

## Short manual acceptance run

1. Extract every file, open the game in Chrome/Firefox and Safari if available. Confirm the title, logo and all 64 tiles fit the screen. On a phone, try portrait, landscape and a small viewport.
2. Start with sound on, then mute/unmute. Confirm music survives pause/resume and returning from another tab or screen lock.
3. Make a normal attack, a healing word while hurt, and a corrupted word. Confirm HP, enemy HP and the preview agree.
4. Sacrifice with no tiles selected: the whole board should change and health should fall by the displayed amount.
5. Pause a boss fight. Leave the tab for at least ten seconds. Resume: health and the attack timer should not have advanced.
6. Choose letters, save to title, continue, then refresh. Check that the board, selected letters, health, enemy and curses are preserved.
7. Complete a biome, continue into the next, and finish or surrender a run. Check the summary and retry. Full campaign and endless runs should then be assessed for difficulty balance.
8. If deploying, verify all companion files are served and use the existing game URL if you want the previous local depth record to remain accessible.

## Repeat the automated suite

```sh
npm install
npm test
```

Test framework dependency: Happy DOM 20.14.5. Node.js 20 or later is required. No development dependency is needed to play or host the game.