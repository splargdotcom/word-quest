# Where Word Quest could go

The strongest part of this design is that the same letter board gives you several competing priorities: find a damaging word, include a healing tile, clear a bad letter, obey the boss, or pay to start the board again. Build the next version around those decisions.

My first choice is **a small relic system between biomes**, followed by a **daily seeded descent**. Keep the word board and short, readable actions central.

## 1. Relics: give each run a different vocabulary

Offer three relics after clearing a biome and let the player take one. Start with six carefully balanced relics and a maximum of three equipped. Make the effect visible in the cast preview.

Prototype examples, with numbers to be tuned:

| Relic | Benefit | Cost or condition |
|---|---|---|
| The Long Sentence | Extra damage for words of six or more letters | No benefit on short words |
| Rare Tongue | A larger bonus for J, Q, X and Z | Each qualifying cast adds a small recoil cost |
| Blood Dictionary | Corrupted tiles add damage | Their existing HP cost remains |
| Quiet Scholar | Stronger words with no repeated letters | Repeated-letter words lose some power |
| Last Word | Damage increases below one-quarter health | Encourages staying close to death |
| Green Ink | Healing words also deal a small amount of damage | Reduce their healing output |

These create recognizable runs without requiring equipment screens or a large permanent progression system. The immediate design question becomes: “What sort of words does this run reward?”

First implementation slice: three relics, one choice after the first boss, one clear sentence per relic, with the added effect shown in the existing preview. Compare completion rate and playtime with the current game before expanding it.

## 2. A daily descent: a reason to return and compare

Everyone gets the same daily starting board, encounter sequence and reward choices, with a short shareable result showing depth, strongest word and relics. Keep unrestricted normal play alongside it.

A seed alone is insufficient for a fair shared challenge. Simulation randomness must be isolated from animation and audio randomness; the current game uses Math.random for both. Also define one difficulty, one dictionary version, a date/timezone convention and a consistent scoring rule. Because players act at different times, decide explicitly whether the daily mode keeps real-time pressure or uses turns.

Start with a local daily challenge and a copyable result. A public competitive leaderboard is a separate project: client-side scores alone are easy to alter, so trustworthy rankings would need server validation or replay verification.

## 3. More distinctive bosses and short narrative encounters

The existing bosses already influence spelling, but a stronger presentation could make those mechanics memorable. Add readable silhouettes/animations, an introductory tell, and one visible rule at a time.

Examples for a later prototype:

- A Collector that rewards a letter it names before its next strike.
- An Echo that resists the previous word length, encouraging a different rhythm.
- An Editor that progressively crosses out letters until a qualifying word releases them.
- A door that offers a short optional word challenge for a reward, with no punishment for declining.

Keep the rules visible before the player commits. A difficult word decision is more satisfying than a hidden penalty.

## 4. Installable phone version

Add a web app manifest and a versioned service worker once real Android/iPhone testing is complete. Cache the shell and bundled dictionary together, and activate updates between runs. Include portrait/landscape checks, audio recovery after screen lock, safe-area checks and a save migration strategy.

The current update includes an offline dictionary and local saves. It does not yet include a PWA install flow or server-backed accounts.

## What to learn from the next playtest

Watch a few existing players use this build. Note which words they expect to count, whether the healing/attack distinction is clear, when they sacrifice, where they die, whether they notice enrage, and whether they understand each boss rule. Fix those points before adding more content.

Then compare the first relic prototype against this version. The useful signal is whether players make different word choices and want another run, not simply whether the new mechanic sounds appealing.