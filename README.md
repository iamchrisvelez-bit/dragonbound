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
- **glTF** — models/animations, with a placeholder-mesh fallback so the
  game runs today and real assets drop in later with zero code changes
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
| Ability wheel | Ability button | Q | Y / Triangle |
| Mount toggle / taming interact | Mount button | F | RB / R1 |
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
  hit detection (`src/combat/CombatSystem.ts`) against a capsule-mesh
  placeholder dragon. Dodge and block are also stamina-gated and dodging
  grants brief invulnerability.
- **Weaken the dragon**: landing hits reduces its HP; Rapier physics
  drives both entities' movement/collision.
- **Tame it**: once the dragon's HP drops below 30%, its AI state machine
  (`feral → wary → bonding → tamed`, `src/taming/DragonAI.ts`) flips to
  `wary` and stops attacking. Walk up and press Mount to start a timed
  tap-sequence minigame (`src/taming/TamingMinigame.ts`) driving a
  `BondMeter`; tap the Attack button on each prompt. Success flags the
  dragon `tamed` and adds it to `PlayerStable`, plus grants a skill point
  and a rolled gear item as a reward.
- **Progression data models**: a 3-branch skill tree (Blade/Ward/Bond,
  `src/progression/SkillTree.ts`) and a rarity-based gear roll system
  (`src/progression/Gear.ts`) — both pure data, read by
  `ProgressionManager` and the inventory UI, not hardcoded logic.
- **Persistence**: player state, stable, and progression save to
  IndexedDB (`src/core/SaveManager.ts`) on a 20s autosave timer, on key
  events (taming success), and on page hide; loaded on boot.
- **PWA**: `public/manifest.json` + hand-generated placeholder icons
  (`scripts/gen-icons.mjs`), service worker via `vite-plugin-pwa`
  (`generateSW`, `registerType: autoUpdate`), works offline after first
  load, installable to a phone home screen.

## What's stubbed / simplified

- **Placeholder art everywhere**: knight and dragon are procedural
  low-poly THREE meshes (capsule + primitives), not real models. Drop a
  matching `.glb` into `/assets/models` (see `assets/README.md`) and
  `AssetLoader` picks it up automatically — no code changes.
- **No real animation system yet**: `AssetLoader` returns any
  `AnimationClip[]` a dropped-in glTF carries, but nothing currently
  builds an `AnimationMixer`/state graph from them.
- **Ability wheel** is wired as an input button and held-action state,
  but nothing consumes it yet — no actual abilities are implemented, so
  `unlock-ability` skill nodes (Riposte, Evasive Roll, Wyrmspeaker,
  Saddle-Ready) are recorded as unlocked but don't change behavior yet.
- **`stat`-type skill nodes and gear stats *are* applied**: unlocked
  Blade/Ward/Bond `stat` effects and every equipped item's `rolledStats`
  feed `ProgressionManager.getModifiers()`, which `Knight` recomputes
  live (on construction and on every unlock/equip event) into actual
  attack damage, max health/stamina, stamina regen rate, and BondMeter
  gain rate — see `src/progression/ProgressionManager.ts`. Gear's
  `armor` stat is rolled but not applied yet (no incoming-damage
  mitigation system exists).
- **Dragon AI is a single lunge-attack pattern** on a cooldown — no
  attack variety, no ranged/breath attack, no group/pack behavior.
- **Taming a zone's dragon doesn't persist that specific dragon as
  "already tamed"** across reloads — the zone always spawns its feral
  dragons fresh; only the `PlayerStable` record persists. A tamed dragon
  isn't yet rideable/mountable in the world (mount toggle sets a flag on
  Knight but there's no mounted-camera/movement mode built).
- **QuestLog/DialogueSystem** are minimal (a status map and a line
  queue) with no UI rendering wired up yet — HUD doesn't show quest
  progress or dialogue text on screen.
- **Single zone, no zone transitions.**

## Suggested follow-up prompts

1. **"Wire skill tree and gear stats into combat"** — make unlocked
   Blade/Ward/Bond nodes and equipped gear actually modify Knight's
   attack damage, max health/stamina, regen rate, and BondMeter gain
   rate, instead of just being recorded.
2. **"Flesh out dragon AI and combat variety"** — add more attack
   patterns (breath attack, tail sweep), a real aggro/pack system for
   multiple dragons, and hook the Ability Wheel button up to real
   player abilities (including the `riposte`/`evasive-roll`/etc. skill
   unlocks that are currently just flags).
3. **"Wire real CC0 assets"** — source a rigged knight + dragon (Mixamo /
   Quaternius / Kenney), drop them into `/assets/models` +
   `/assets/animations` per `assets/README.md`, and build the
   `AnimationMixer` state graph (idle/run/attack/dodge/hit/death) that
   `AssetLoader` is already structured to support.
4. **"Build the skill tree / inventory UI further and make mounting
   real"** — richer `InventoryScreen` visuals (radial ability wheel,
   drag-to-equip), a mounted-dragon camera/movement mode once `Knight`
   is mounted, and quest/dialogue UI panels backed by the existing
   `QuestLog`/`DialogueSystem`.
