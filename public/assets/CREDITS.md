# Asset credits

## `models/knight.glb`

**KayKit — Adventurers Character Pack (1.0)**, by Kay Lousberg
(www.kaylousberg.com / kaylousberg.itch.io/kaykit-adventurers).

- License: [CC0 1.0 Universal](http://creativecommons.org/publicdomain/zero/1.0/)
  — free for personal, educational, and commercial use. Attribution isn't
  required by the license; it's included here anyway as thanks.
- Source: [KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0](https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
  on GitHub (the pack's official distribution repo).
- Contains 75 animation clips on a single skeleton; Knight.ts currently
  drives a subset of them (Idle, Walking_A, 1H_Melee_Attack_Chop/
  Slice_Diagonal/Slice_Horizontal, Dodge_Forward/Backward/Left/Right,
  Block/Blocking, Hit_A, Death_A) - see `AnimationState` in
  `src/entities/Knight.ts`. The rest (ranged/spellcasting/sitting/jumping/
  etc., meant for the pack's other character classes and broader use
  cases) are unused but still embedded in the file.

## `models/dragon.glb`

Created by the project owner via an AI-run generation script (the file's
generator tag reads `build_dragon_whelp.py`) - not sourced from any
third-party pack, so there's no external rightsholder's terms to clear.

- **Ownership/license**: under current U.S. Copyright Office guidance,
  copyright requires meaningful human authorship - a work produced by a
  generative process with no substantive human creative input generally
  isn't eligible for copyright at all. Two outcomes are both fine for
  this project's purposes: if the project owner's direction over the
  generation (design choices, iteration, selection) rises to the level of
  human authorship, the project owner holds whatever copyright exists,
  same as anything else they made; if it doesn't, the asset simply has no
  rightsholder and is unencumbered. Either way, the project owner is
  clear to use it here. (This read is jurisdiction-specific - e.g. the UK
  has a distinct "computer-generated works" rule - and isn't legal
  advice; it's a documentation note, not a warranty, and matters more the
  more this repository's public/commercial distribution scales up.)
- Contains 1 skinned mesh, 1 skin, 4 animation clips (Idle, Walk, Flap,
  Roar) - see the animation mapping in `src/entities/Dragon.ts`. There's
  no dedicated attack/hit/death clip; the state graph reuses Roar as an
  attack telegraph and Flap as the active-attack pose (see that file's
  comments for the exact mapping).

## `models/dragon-quaternius.glb`

**Quaternius — "Animated Monster Pack"**, the "Dragon" model (one of four
monsters in that pack: Bat, Dragon, Skeleton, Slime).

- License: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
  — Public Domain Dedication. Free for personal, educational, and
  commercial use, no attribution required (credited here anyway).
- **Sourcing note**: quaternius.com, itch.io, Sketchfab, and OpenGameArt
  (this pack's original distribution points) are all blocked by this
  sandbox's network egress policy. This file was instead retrieved from
  [BastiaanOlij/godot_dungeon](https://github.com/BastiaanOlij/godot_dungeon)
  on GitHub, a public repo that vendors the pack unmodified at
  `assets/quaternius.com/Animated Monster Pack/`, complete with
  Quaternius's own `License.txt` sitting next to the model - saved
  verbatim in this repo as
  [`quaternius-animated-monster-pack-License.txt`](quaternius-animated-monster-pack-License.txt)
  for provenance. The CC0 licensing of
  this specific pack was independently corroborated across several other
  unrelated public repos' own asset audits during sourcing (e.g. citing
  the same pack, under the same name, as CC0/public domain, some
  referencing its original OpenGameArt mirror at
  `opengameart.org/content/lowpoly-animated-monsters`) - multiple
  independent confirmations, not just one repo's unverified claim.
- Contains 1 skinned mesh, 1 skin, only 2 animation clips (`Dragon_Flying`,
  `Dragon_Hit`) - no idle/walk/death, and no dedicated attack clip either.
  `Dragon.ts`'s `QUATERNIUS_DRAKE_CONFIG` reuses `Dragon_Flying` for every
  state except a damage reaction (idle, chase, windup, and the
  active-attack pose all play the same flying/hovering loop - a real,
  visible limitation, not hidden), and `Dragon_Hit` for a brief on-damage
  flinch - the one animated hit-reaction any dragon has in this game.
- Native geometry is ~3.85 units tall (a full adult dragon, not a whelp) -
  scaled down 0.6x in `Dragon.ts` to read as bigger-but-comparable to the
  knight rather than a tower. Purely a visual scale; the Rapier collider
  is untouched, same as `dragon.glb`'s scale-up.
- Used for the "Feral Drake" pair in `ZoneLoader.ts`'s starting zone
  (`archetype: 'quaternius-drake'`), distinct from the solo "Feral
  Wyrmling" which still uses `dragon.glb`.
