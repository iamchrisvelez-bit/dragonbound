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

Not sourced yet - see the session notes / README for why (no rigged CC0
dragon was reachable from this environment; the dragon still renders as
the procedural placeholder mesh in `src/entities/Dragon.ts`).
