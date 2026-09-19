# Changes — 18 September 2026

## Confirmed against the supplied build

The first five problems below were reproduced by running the original JavaScript in an isolated DOM harness.

| Problem | Original result | Updated behavior |
|---|---|---|
| Green words did not heal during combat | A healing cast at 100 HP left the player at 100 HP | Healing restores HP in combat and while walking |
| Ordinary walking words acted as heals | Casting CAT at 100 HP produced 105 HP | Attack words stay prepared until there is a live enemy |
| Sacrifice charged for an empty reroll | With no selected tiles the board was unchanged | All 64 tiles are replaced, whether or not a word is selected |
| Fatal recoil could revive the player | A 4 HP player using a corrupted healing word ended up at 13 HP after the death transition | Fatal costs end the run immediately; no later healing or attack runs |
| Compressed dictionary cache did not round-trip | Encoding and decoding the complete list changed the contents | Removed the overflowing 16-bit LZW cache; included the dictionary locally |

## Other fixes

- Every action checks the active run, pause status and whether its enemy is still alive.
- Enemy defeat transitions use the game clock, so they freeze when paused and cannot fire into a later run.
- Boss fights can be paused with the visible button or Esc. Tab/window focus loss pauses automatically.
- Inactivity/enrage time uses active play time; menus and pause time do not count.
- Cast previews refresh after health and curse changes, and every cast is recalculated at submission.
- Silence removes already-selected vowels and blocks their reselection until it expires.
- Boss phase curses apply after used tiles refill, so a newly silenced vowel cannot escape consumption.
- Phasing dodges enemy attacks, but does not waive sacrifice or self-damage costs.
- Vowel tax cannot create negative attack power.
- Wildcards have a consistent base value rather than an invisible random letter's score.
- Wildcard matching searches words of the appropriate length; it no longer enumerates all alphabet combinations.
- Endless mode uses its own rule copy and cannot change the Void rules in a subsequent campaign.
- Restart clears enemies, curses, pause state, transition delays and the VOID healing penalty.
- Ascending records depth as well as dying; difficulty-specific records are also retained.
- Storage and unavailable audio no longer prevent starting a game.
- Fixed combat music tempo reading the wrong object's property.
- Curse rendering updates on changes/glitch ticks instead of rebuilding 64 tiles every animation frame.
- Epitaph timing and the main animation clock are based on elapsed seconds rather than monitor refresh rate.
- The copied Cloudflare beacon was blocked by the original page's content-security policy. It has been removed from this offline package; hosting-level analytics can be managed at the host.

## Added

- Local automatic saves, Continue, and Save & Title.
- Save validation, including rejection of corrupt or impossible encounter states.
- Keyboard letter selection, undo, clear, keyboard board navigation and visible selection order.
- How to Play from both the title and pause menu.
- Visible enemy HP, attack timer, damage, boss rules and curse countdowns.
- Damage/healing previews and explicit recoil/fatal-cost warnings.
- Run summaries: depth, score, words cast, foes defeated, strongest and longest words.
- Remembered sound and difficulty settings.
- Responsive desktop/portrait/landscape styles, focus outlines, dialog semantics and reduced-motion support for flashes/shakes.

## Deliberate behavior choices

- Words without a healing tile do not restore health while walking. They remain selected, ready for the next enemy.
- Healing at full health is disabled unless the word also has a health cost; healing scores only actual HP restored.
- VOID needs a live enemy and retains the existing third-biome unlock, 90% HP cost and lost next-biome heal.
- Rule labels describe the original soft penalties accurately: short words in the Archives and S-ending words in the Swamp are weakened, not outright prohibited.
- The original health totals, enemy pools, boss scaling and principal scoring formulas remain. Fixing healing and removing unintended free regeneration changes practical balance, which needs real playtesting.