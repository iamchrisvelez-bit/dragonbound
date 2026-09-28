# Dragonbound

A mobile-first 3D fantasy action-RPG: knights who fight and eventually tame
dragons. Built to run entirely in the browser — no desktop game editor,
just Vite + TypeScript + Three.js + Rapier physics, installable as a PWA.

**Design doc:** [`docs/design/crystal-and-taming-systems.md`](docs/design/crystal-and-taming-systems.md)
is the canonical design reference for the two dragon-acquisition systems
(sealed crystals vs. taming wild dragons) and the wider "generated
bestiary" vision for the game. Its §10 tracks exactly what's implemented
against the doc vs. still a gap; this README's "What's built"/"What's
stubbed" sections below are the maintained, authoritative status.

## Stack

- **Three.js** — rendering
- **Vite** — dev server / bundling
- **TypeScript** (strict)
- **@dimforge/rapier3d-compat** — physics (WASM, base64-inlined by the
  compat build, so it works offline with no extra fetch)
- **glTF** — models/animations. Both the knight and dragon are real
  rigged assets now (see "What's built"), driven by per-entity
  `AnimationMixer` state graphs
- **vite-plugin-pwa** — installable, offline-capable PWA

## Running it

```bash
npm install
npm run dev
```

`vite.config.ts` sets `server.host = true`, so Vite prints both a
`localhost` URL and a LAN URL (`http://<your-machine-lan-ip>:5173`). Open
the LAN URL on your phone (same Wi-Fi network) to test touch controls
immediately — no build/deploy step needed.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm run build        # typecheck + production build to /dist
npm run preview      # serve the production build (also host:true)
```

### Controls

| Action | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Move | Left-thumb virtual joystick (spawns where you touch down) | WASD / arrows | Left stick |
| Camera look / orbit | Drag anywhere on the right half of the screen | Drag with mouse | Right stick |
| Attack | Attack button | Space / J | A / Cross |
| Dodge | Dodge button | Shift / K | B / Circle |
| Block (hold) | Block button | Ctrl / L | LT / L2 |
| Ability wheel (Riposte parry, if Blade's "Riposte" is unlocked) | Ability button | Q | Y / Triangle |
| Mount toggle (tap: start taming a wary dragon / mount or dismount a tamed one · hold: attune a nearby sealed crystal) | Mount button | F | RB / R1 |
| Lock-on toggle | — (bind a button if desired) | C | Left stick click |
| Inventory / skill tree | "Menu" button (top center) | I | — |

Touch is the primary path; keyboard/gamepad are secondary dev-testing
paths — both drive the same `InputManager`, so gameplay code never knows
which one is in use.

## What's built (playable vertical slice)

- **Move** around a small zone with a third-person spring-arm camera
  (drag to orbit, raycast collision avoidance against scene props, lock-on
  toggle that snaps to face the nearest dragon).
- **Attack**: a 3-hit light/heavy combo chain (data-driven —
  `src/combat/ComboSystem.ts`), stamina-gated, with real sphere-overlap
  hit detection (`src/combat/CombatSystem.ts`). Dodge grants brief
  invulnerability (extended further by Ward's "Evasive Roll"); Block
  reduces incoming damage by 65% while held.
- **Three dragons, three attack patterns each**: `src/combat/DragonAttacks.ts`
  is a data table (like the combo system) of Bite Lunge (fast gap-closer),
  Tail Sweep (short-range, wide arc), and Ember Breath (a ranged
  projectile) - each with its own range band, windup/active/recovery
  timing, and eye-flash telegraph color so a dragon visibly (and
  distinctly) winds up before it hits. `src/entities/AggroManager.ts`
  gives dragons individual detection ranges plus pack behavior: aggroing
  one wakes any feral packmate within its alert radius, even if the
  player hasn't entered that packmate's own range yet (see the two
  "Pack Wyrmling" spawns in `ZoneLoader.ts`).
- **Weaken the dragon**: landing hits reduces its HP; Rapier physics
  drives both entities' movement/collision.
- **Tame it (System B - "crystal tech")**: once the dragon's HP drops
  below 30%, its AI state machine (`feral → wary → bonding → tamed`,
  `src/taming/DragonAI.ts`) flips to `wary` and stops attacking. Walk up
  and press Mount to start `ResonanceMinigame` (`src/taming/ResonanceMinigame.ts`,
  orchestrated by `TamingController.ts`): a brief **reading** pause, then
  **matching** (tap the Attack button on the beat - a rhythm test, per
  [the design doc](docs/design/crystal-and-taming-systems.md#4-system-b--crystal-tech-taming-wild-dragons)),
  then **holding** (hold Mount through the dragon "testing" the bond).
  Success flags the dragon `tamed` and adds it to `PlayerStable` with a
  starting `loyalty` value, plus grants a skill point and a rolled gear
  item. **Failure flees the dragon** (a real velocity impulse away from
  the player, not a teleport) instead of an instant do-over, and grows its
  `wariness` (`Dragon.ts`) so the next attempt's signature has more beats
  and tighter tap windows - per the design doc's "failure is a spooked
  dragon, not a lost one."
- **Sealed crystals (System A)**: two hand-placed, glowing crystals
  (`src/world/Crystal.ts`) sit in the zone from the start - one near
  spawn, one farther out. Hold Mount near one to attune
  (`src/taming/CrystalController.ts`); a resonance meter fills over ~6.5
  seconds with escalating Vibration-API feedback (light ticks, a stronger
  mid-hold "destabilizing" buzz). **Let go before it finishes and the
  crystal fractures instead of evaporating** - either way it still yields
  a dragon, added directly to the stable and spawned live (so it's
  immediately part of the world and rideable), but a fractured one is
  visibly dulled (`applyFracturedTint` in `Dragon.ts`) and has a lower
  permanent stat ceiling (see the asymmetry bullet below). Rushing or
  releasing the hold is entirely the player's own choice - rarity here is
  player-determined, not RNG. Opened crystals are tracked in save data
  (`openedCrystalIds`) so they don't respawn as a free reroll on reload.
- **Crystalborn vs. tamed dragons are mechanically different, on purpose**:
  every stable dragon (`SavedStabledDragon` in `SaveManager.ts`) now
  carries an `origin` (`'tamed' | 'crystalborn-whole' | 'crystalborn-fractured'`).
  `DragonLeveling.originStatMultiplier()` gives crystalborn dragons a
  **fixed stat ceiling** set the moment the crystal resolved (higher if it
  evaporated, a permanent "scar" if it fractured), while tamed dragons
  instead get a **loyalty value (0-100) that can rise** - it grows slowly
  while you ride one (`PlayerStable.adjustLoyalty`, in `GameManager.tick`)
  - **or just start lower** and stay there if you never do. The
  Inventory screen's new Stable section shows every dragon's origin badge
  and (for tamed dragons) its loyalty bar.
- **Ride it**: press Mount again near a tamed dragon to hop on (Bond's
  "Saddle-Ready" skips the ~6s settle delay a freshly tamed dragon
  otherwise needs) - WASD/joystick then drives the dragon directly and
  the camera follows it; press Mount again to dismount. Ground riding
  only for now (see "what's stubbed" below).
- **Skill tree and gear actually do something**: unlocked Blade/Ward/Bond
  `stat` nodes and every equipped item's `rolledStats` feed
  `ProgressionManager.getModifiers()`, which `Knight` recomputes live
  (on construction and on every unlock/equip event) into real attack
  damage, max health/stamina, stamina regen rate, and BondMeter gain
  rate. The tree's `unlock-ability` nodes are real too: **Riposte**
  (Ability Wheel opens a brief parry window - a hit landing inside it is
  negated and countered for bonus damage), **Evasive Roll** (dodge
  i-frames last 50% longer), **Wyrmspeaker** (widens the taming
  minigame's tap windows), and **Saddle-Ready** (instant mounting, above).
- **Persistence**: player state, stable, and progression save to
  IndexedDB (`src/core/SaveManager.ts`) on a 20s autosave timer, on key
  events (taming success), and on page hide; loaded on boot.
- **PWA**: `public/manifest.json` + hand-generated placeholder icons
  (`scripts/gen-icons.mjs`), service worker via `vite-plugin-pwa`
  (`generateSW`, `registerType: autoUpdate`), works offline after first
  load, installable to a phone home screen.
- **A real rigged knight**: `public/assets/models/knight.glb` is KayKit's
  CC0 Adventurers-pack Knight (75 animation clips, one skeleton - see
  `public/assets/CREDITS.md`). `Knight.ts` drives a real animation state
  graph off it (idle/run/the 3 combo attacks/dodge/block/hit/death),
  crossfading between clips and speeding up the ~1s stock attack/dodge
  clips to match the game's much snappier combat timing rather than
  letting them run long and get cut off.
- **A real rigged dragon**: `public/assets/models/dragon.glb` (provided
  directly by the project owner - see `public/assets/CREDITS.md` for the
  still-unconfirmed license/source caveat) replaces the procedural
  placeholder. It ships only 4 clips (Idle, Walk, Flap, Roar), so
  `Dragon.ts`'s state graph reuses Roar as the attack windup telegraph
  and Flap as the active-attack pose (sped up per-attack via the same
  `timeScale` trick `Knight.ts` uses), alongside real Idle/Walk for
  everything else - crossfaded the same way as the knight. The model's
  own geometry is a genuinely tiny "whelp" size, so it's rendered at a
  fixed 2.2x visual-only scale (`DRAGON_VISUAL_SCALE` in `Dragon.ts`) to
  stay legible at normal third-person combat distance; the Rapier
  collider and hurtbox radius are untouched by that scale-up.
- **Quest tracker + dialogue box**: a small always-on HUD panel
  (`src/ui/QuestTracker.ts`) tracks every not-yet-complete `QuestLog`
  quest live as its own card (there are two from the start now: tame a
  dragon, open a crystal), and a tap-to-advance dialogue box
  (`src/ui/DialogueBox.ts`) renders `DialogueSystem` lines - both just
  thin UI over the existing systems, not new game logic. A short intro
  dialogue plays on boot to exercise it.
- **Richer inventory screen**: a Stable section (dragon name, origin
  badge, loyalty bar for tamed dragons) sits above the skill tree, which
  renders as a radial "wheel" per branch (nodes arranged in a circle
  around a hub, prerequisite lines colored by unlocked state) instead of
  a flat list, plus a paper-doll equipment row and pointer-based
  drag-to-equip for gear cards (tap still works too) - see
  `src/ui/InventoryScreen.ts`.
- **Mounted riding has its own camera framing**: `CameraRig.mounted`
  pulls the camera back and up while riding, and the HUD shows a
  "Riding: `<name>`" badge - the ride mechanics themselves (drive the
  dragon from input, dismount placement, settle delay) shipped in the
  previous round; this is the visual polish pass on top.

## What's stubbed / simplified

- **The dragon asset's license/source isn't confirmed**: it was provided
  directly by the project owner rather than sourced from a verified CC0
  pack (Quaternius, Kenney, Gobkit, Sketchfab, and itch.io were all
  blocked by this sandbox's network egress policy, and no GitHub-hosted
  official CC0 dragon pack turned up in a fairly thorough search - the
  KayKit org that the knight came from has no monster/creature pack at
  all). Confirm licensing with the project owner before redistributing
  this repository publicly. See `public/assets/CREDITS.md`.
- **The dragon has no dedicated attack/hit/death animation clips** - only
  Idle/Walk/Flap/Roar exist in the file, so the combat state graph reuses
  Roar and Flap for those beats (see `Dragon.ts`). A richer dragon rig
  with real attack/hit/death clips would read better.
- **Gear's `armor` stat** is rolled but not applied yet (no incoming-damage
  mitigation system beyond Block exists).
- **Mounted riding is ground-only** — no flight, no stamina cost, no
  dragon-specific abilities while mounted; it reuses Knight's move-speed
  math at a flat faster speed. Dismounting always drops you beside the
  dragon rather than checking for clear ground.
- **The Ability Wheel only opens Riposte's parry stance** right now -
  it's built to be a small dispatch point (see
  `Knight.tryActivateRiposteParry`) rather than a real radial menu, since
  there's only one activated ability to pick from so far.
- **Taming a zone's dragon doesn't persist that specific dragon as
  "already tamed"** across reloads — the zone always spawns its feral
  dragons fresh; only the `PlayerStable` record persists. (Crystals don't
  have this gap - `openedCrystalIds` is real save state, so an opened
  crystal stays gone.)
- **Single zone, no zone transitions.**
- **The generated-bestiary pipeline from the design doc isn't built**
  (§2/§7/§10 there): this is still one dragon archetype (the whelp
  `dragon.glb`), so there's no second rig to prove a modular
  attachment/mask-texture/proportion system against yet, and no
  KTX2/LOD/per-region-bundle pipeline (moot with one small model). A
  fractured crystal's "dulled palette" is approximated with a flat
  material-color multiply (`applyFracturedTint` in `Dragon.ts`), not the
  doc's mask-texture tinting.
- **Wariness/loyalty/origin-stat-ceiling don't touch live combat stats
  yet**: `DragonLeveling.originStatMultiplier()` and dragon XP/leveling
  (`PlayerStable.addXp`, itself already-unused scaffolding before this
  round) aren't wired into a ridden/summoned Dragon's actual
  maxHealth/attackDamage - the formula and the data exist, but nothing
  re-applies them onto the live entity yet.
- **Device tiers / signature complexity gating by archetype** (design doc
  §4's progression-gating idea) isn't modeled - meaningless with only one
  archetype; `Dragon.wariness` is the one difficulty axis that exists.
- **No dragon ability-slot system** - "fewer ability slots" on a
  fractured crystalborn dragon (design doc §3's table) isn't modeled,
  since dragons (unlike the player Knight) have no ability-unlock system
  at all in this codebase.
- **The match step is rhythm-tap only** - the design doc's other
  prototype option (drag-to-align a waveform, "Tuning") wasn't built; §4
  frames this as a real open decision to prototype both and pick on a
  phone, and this round picked rhythm on the doc's own "suits the
  platform" reasoning rather than building and comparing both.
- **Knight's animation set is a subset of the pack**: only the 9 clips
  the state graph actually needs are wired up (see `ANIMATION_CLIP_NAMES`
  in `Knight.ts`); the other 66 clips in `knight.glb` (ranged/spellcasting/
  sitting/jumping/dual-wield/etc., meant for the pack's other classes)
  are unused dead weight in the file.

## Suggested follow-up prompts

1. **"Source a fuller dragon animation set (or confirm/replace the
   current asset's license)"** — the current `dragon.glb` covers
   idle/walk/attack-telegraph/active-attack reasonably well but has no
   dedicated hit/death clip and an unconfirmed license (see "what's
   stubbed"); either get licensing confirmed from the project owner, or
   swap in a fuller-featured CC0 rigged dragon/wyvern and extend
   `Dragon.ts`'s state graph to match.
2. **"Wire dragon origin/loyalty into live combat stats"** — apply
   `DragonLeveling.originStatMultiplier()` and the (currently unused)
   XP/leveling system onto a ridden/summoned Dragon's actual
   maxHealth/attackDamage, so the crystalborn/tamed asymmetry and a
   dragon's level are more than stored numbers.
3. **"Prototype the tuning (drag-to-align) match step and compare it to
   rhythm-tap"** — the design doc frames this as a real open decision
   (§4/§9.1) to test on a phone, not something to decide on paper; this
   round shipped rhythm-tap only.
4. **"Start the generated-bestiary pipeline with a second archetype"** —
   once a second rigged CC0 (or otherwise cleared) creature asset is
   available, use it to prove out the design doc's Layer 1-4 modular
   attachment/palette/proportion system (§2) against something beyond a
   single hard-coded model.
5. **"Add more active abilities and turn the Ability Wheel into a real
   radial menu"** — give Blade/Ward/Bond a couple of tap-to-activate
   abilities beyond Riposte, and build the actual wheel UI to pick
   between them.
6. **"Add dragon flight"** — a proper flight/altitude control scheme for
   mounted dragons instead of ground-only riding (probably wants a
   dedicated up/down input and a different camera mode).
7. **"Add more zones and a zone transition system"** — a second zone
   definition, a loading/transition flow in `ZoneLoader`, and travel
   points or a portal to move between them.
