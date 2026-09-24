# Dragonbound

A mobile-first 3D fantasy action-RPG: knights who fight and eventually tame
dragons. Built to run entirely in the browser — no desktop game editor,
just Vite + TypeScript + Three.js + Rapier physics, installable as a PWA.

## Stack

- **Three.js** — rendering
- **Vite** — dev server / bundling
- **TypeScript** (strict)
- **@dimforge/rapier3d-compat** — physics (WASM, base64-inlined by the
  compat build, so it works offline with no extra fetch)
- **glTF** — models/animations. The knight is a real rigged CC0 asset
  (see "What's built"); the dragon is still a placeholder mesh, with the
  same drop-in-and-it-just-works path the knight took
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
| Mount toggle (start taming a wary dragon / mount or dismount a tamed one) | Mount button | F | RB / R1 |
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
- **Tame it**: once the dragon's HP drops below 30%, its AI state machine
  (`feral → wary → bonding → tamed`, `src/taming/DragonAI.ts`) flips to
  `wary` and stops attacking. Walk up and press Mount to start a timed
  tap-sequence minigame (`src/taming/TamingMinigame.ts`) driving a
  `BondMeter`; tap the Attack button on each prompt. Success flags the
  dragon `tamed` and adds it to `PlayerStable`, plus grants a skill point
  and a rolled gear item as a reward.
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
  letting them run long and get cut off. The dragon is still the
  procedural placeholder - see "What's stubbed".
- **Quest tracker + dialogue box**: a small always-on HUD panel
  (`src/ui/QuestTracker.ts`) tracks the active `QuestLog` quest live, and
  a tap-to-advance dialogue box (`src/ui/DialogueBox.ts`) renders
  `DialogueSystem` lines - both just thin UI over the existing systems,
  not new game logic. A short intro dialogue plays on boot to exercise it.
- **Richer inventory screen**: the skill tree renders as a radial "wheel"
  per branch (nodes arranged in a circle around a hub, prerequisite lines
  colored by unlocked state) instead of a flat list, plus a paper-doll
  equipment row and pointer-based drag-to-equip for gear cards (tap still
  works too) - see `src/ui/InventoryScreen.ts`.
- **Mounted riding has its own camera framing**: `CameraRig.mounted`
  pulls the camera back and up while riding, and the HUD shows a
  "Riding: `<name>`" badge - the ride mechanics themselves (drive the
  dragon from input, dismount placement, settle delay) shipped in the
  previous round; this is the visual polish pass on top.

## What's stubbed / simplified

- **The dragon is still a placeholder**: no rigged CC0 dragon (or
  wyvern/drake stand-in) with a usable animation set was reachable from
  this dev environment - Quaternius, Kenney, Gobkit, Sketchfab, and
  itch.io are all blocked by this sandbox's network egress policy, and
  no GitHub-hosted official CC0 dragon pack turned up in a fairly
  thorough search (the KayKit org that the knight came from has no
  monster/creature pack at all). The knight proves the pipeline works
  end-to-end; the dragon just needs an asset. Fastest path: you download
  a CC0-licensed rigged dragon/wyvern yourself (Quaternius's "Animated
  Monster Pack" or similar) and drop it in as `public/assets/models/dragon.glb`
  - `AssetLoader`/`Dragon.ts` will pick it up with no code changes, same
  as the knight did. See `public/assets/CREDITS.md`.
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
  dragons fresh; only the `PlayerStable` record persists.
- **Single zone, no zone transitions.**
- **Knight's animation set is a subset of the pack**: only the 9 clips
  the state graph actually needs are wired up (see `ANIMATION_CLIP_NAMES`
  in `Knight.ts`); the other 66 clips in `knight.glb` (ranged/spellcasting/
  sitting/jumping/dual-wield/etc., meant for the pack's other classes)
  are unused dead weight in the file.

## Suggested follow-up prompts

1. **"Source and wire a dragon asset"** — once you've got a CC0 rigged
   dragon/wyvern `.glb` (see "what's stubbed" above for why this
   session couldn't fetch one itself), drop it into
   `public/assets/models/dragon.glb` and build `Dragon.ts` an animation
   state graph the same way `Knight.ts` has one now (idle/fly-or-walk/the
   3 attack patterns/hit/death), replacing the eye-flash telegraph with
   real wind-up animations.
2. **"Add more active abilities and turn the Ability Wheel into a real
   radial menu"** — give Blade/Ward/Bond a couple of tap-to-activate
   abilities beyond Riposte, and build the actual wheel UI to pick
   between them.
3. **"Add dragon flight"** — a proper flight/altitude control scheme for
   mounted dragons instead of ground-only riding (probably wants a
   dedicated up/down input and a different camera mode).
4. **"Add more zones and a zone transition system"** — a second zone
   definition, a loading/transition flow in `ZoneLoader`, and travel
   points or a portal to move between them.
