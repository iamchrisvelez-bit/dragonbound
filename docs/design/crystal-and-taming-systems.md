# DRAGONBOUND — CRYSTAL & TAMING SYSTEMS
### Design document · drafted 2026-09-28
### Stack: Three.js + Vite + TypeScript + Rapier · glTF assets · installable PWA · mobile-first

---

## 0. DECISION ON RECORD

**Dragonbound is independent of Emittime.** No shared lore, continuity, characters or cosmology. The
only thing carried across is the **mechanical idea** of a creature held in crystal and released by
intent rather than force — an idea, not a canon.

Consequences, all good: the bestiary can go as wide as you want, nothing here can contradict the
comic, and Emittime's "no unresolved contradictions" claim stays intact for the raise.

**Two acquisition systems, deliberately different in feel:**
- **Crystals** → starter dragons, the rare tier. Finite, discovered, opened.
- **Crystal tech** → wild dragons, the main loop. Repeatable, skill-gated, scaling.

---

## 1. THE ONE IDEA THAT MAKES A WIDE BESTIARY POSSIBLE

"All types of dragons" and "mobile PWA on Three.js" are in direct tension. A collection game is
judged on roster size; a browser game on a mid-range Android dies on asset weight and draw calls.
**Fifty bespoke dragons is not shippable by a solo developer on this stack.**

So don't enumerate the bestiary. **Generate it.**

> **A small number of rigged body archetypes, combined with modular parts, tintable materials and
> proportion offsets, yields hundreds of visually distinct dragons from a handful of skeletons.**

This is the whole engineering strategy, and the reason to commit to it now is that it has to shape
the art direction from the first asset — you cannot retrofit modularity onto bespoke models.

**And it is not a compromise, because the fiction already justifies it.** Crystals hold different
lineages; the way a crystal opens determines what comes out. **The combinatorial system is the
worldbuilding.** Players reading variation as meaningful is exactly what you want in a collection
game, and here the variation is literally systematic.

---

## 2. THE BESTIARY SYSTEM — FOUR LAYERS

### Layer 1 — Body archetypes (the expensive layer)

Each archetype is **one skeleton plus one animation set**, reused by every dragon built on it. This
is the only layer with real cost, so it is the only layer to be strict about.

| Archetype | Form | Locomotion | Notes |
|---|---|---|---|
| **Wyrm** | Serpentine, limbless or vestigial | Undulation, burrow, swim | Cheapest to animate. Very distinctive. Good first archetype. |
| **Drake** | Quadruped, wingless | Run, pounce, climb | The eastern *long* / lindwurm silhouette. Reuses standard quadruped locomotion. |
| **Wyvern** | Two legs, wings as forelimbs | Flight-dominant, awkward on ground | The most iconic flight silhouette. Bat-like. |
| **True dragon** | Four legs **plus** wings | Flight and ground both fluent | The heraldic form. Most expensive rig. Reserve for high tiers. |
| **Leviathan** | Paddle limbs, finned | Swim, surface, no true flight | Water content, and a genuinely underused shape in this genre. |
| *(stretch)* **Plumed** | Avian-adjacent, feathered | Glide, perch | Only if v1 ships well. |

**Budget: 3 for v1, 5 by launch, 6 as a post-launch beat.** Every additional archetype is a full
animation set, which is the real spend.

### Layer 2 — Modular attachments (the cheap variety layer)

Small meshes socketed to named joints on the shared skeleton. Swapping is nearly free.

- **Head:** horn sets (6–8), crests, frills, jaw types, eye configurations
- **Spine:** ridge lines, plating, sail membranes
- **Tail:** tip types — club, blade, fan, spine cluster, fluke
- **Wings:** membranous / feathered / finned, plus span and shape variants
- **Limbs:** talon vs paw vs hoof-like

Ten to fifteen small meshes per slot covers the whole game. **Keep every attachment on the same
socket naming convention across all archetypes** so a horn set authored once works everywhere.

### Layer 3 — Material and palette (the highest variety-per-byte layer)

One albedo per archetype plus a **mask texture** whose channels isolate scales, belly, crest and
membrane. Tint each channel at runtime.

This is where you get the most visual difference for the least memory, and it is how you express
"regional variation" without new geometry. A single wyrm mesh reads as a different animal in
marsh-green with an amber belly than in ash-grey with a red crest.

### Layer 4 — Proportion and scale

Bone-scale offsets applied at spawn: neck length, limb length, skull size, overall scale 0.7×–1.5×.
A compact heavy build and an elongated slender one on the same rig read as two species.

### The arithmetic

3 archetypes × ~8 attachment combinations × ~6 palettes × 3 proportion sets = **well over 400
distinct-looking dragons** from roughly 3 skeletons, 3 animation sets and 40–50 small meshes. That
is a shippable PWA payload and a bestiary that looks bottomless.

**[Design rule] Name and stat only a curated subset.** Hundreds of *possible* dragons, maybe 60
*named species* with identity, lore blurbs and stat profiles. The rest are regional variants of
those. Players want a filled-in index, not infinite noise.

---

## 3. SYSTEM A — CRYSTALS (STARTERS, RARE TIER)

**What it is:** a sealed, opaque crystal with a dragon inside. The player cannot see what it holds.

**The interaction — and this is the best thing in the design.** Not a tap. Not a break. **Hold and
attune.** The player maintains contact; the crystal begins to resonate; a resonance meter fills
slowly. On completion the crystal **evaporates** — it does not shatter — and the dragon is released
already bonded.

### The rarity mechanic is the interaction

**If the player rushes, forces, or breaks contact early, the crystal *fractures* instead.**

A fractured crystal still yields the dragon. But a degraded one:

| | **Evaporated** (patient) | **Fractured** (rushed) |
|---|---|---|
| Stat ceiling | Full | Reduced |
| Ability slots | All | Fewer |
| Palette | Full saturation | Dulled, visibly lesser |
| Bond | Immediate | Must be built |

**Why this is worth building properly:**

1. **Rarity becomes player-determined rather than RNG.** Nobody feels cheated by the dice; they feel
   responsible. That is a much healthier relationship with a rare tier.
2. **It teaches the game in ninety seconds.** The first crystal tells the player, without a line of
   tutorial text, that this game rewards restraint over force. That is your whole tonal thesis
   delivered as a verb.
3. **It creates real regret, which creates retention.** A fractured rare is a permanent, visible
   reminder in the player's roster. They will want to do better on the next one.
4. **It is unusual.** Gacha and combat-capture dominate this genre. A patience mechanic is
   differentiated, and it demos well in a thirty-second video.

**Tuning notes.** The hold should be long enough to feel like a commitment — five to eight seconds —
with escalating feedback (light, audio, controller-less haptics via the Vibration API where
available). Add a mid-hold **destabilisation** the player must ride out rather than react to, so it
requires nerve and not just waiting.

### Distribution

- **Finite and hand-placed.** Not drops, not rewards, not purchasable. Twenty to forty across the
  whole game.
- **Onboarding:** present three, let the player open one. The other two become visible long-term
  goals they already know the location of.
- **Discovery is content.** A crystal in the world is a landmark, and finding one should feel like
  finding a vista, not a loot box.

---

## 4. SYSTEM B — CRYSTAL TECH (TAMING WILD DRAGONS)

**What it is:** a device built from crystal fragments. Working names: **the Resonator**, a **tuning
core**, a **shard-lens**. It does not capture. **It projects the resonance the crystal produced
naturally, and makes a wild dragon willing.**

### The loop — approach, read, match, hold

1. **Approach.** Each wild dragon has an awareness state. Get inside range without spooking it —
   stealth, wind direction, terrain cover, or a lure.
2. **Read.** The device reveals the dragon's **resonance signature**: a pattern the player must
   reproduce. Displayed as a visual waveform or pattern, not a number.
3. **Match.** A short active skill test. Two options worth prototyping:
   - **Tuning:** drag to align a moving waveform against the target. Analogue, calm, thematic.
   - **Rhythm:** tap the signature back. Snappier, more mobile-native, more legible on a phone.
   *(Prototype both. Tuning suits the tone; rhythm suits the platform. Test on a phone before
   deciding — this is the one mechanic that must feel good under a thumb.)*
4. **Hold.** Once matched, maintain it while the dragon reacts — it tests the bond, moves, flares.
   Sustain to completion.

### Failure is a spooked dragon, not a lost one

**No consumables destroyed, no dragon deleted.** A failed attempt causes it to flee — and it becomes
**warier**, with a harder signature next time. Persistent per-dragon world state.

**Why:** it makes named wild dragons feel individual and remembered, it converts failure into a story
instead of a punishment, and it produces the "there's a drake in the eastern marsh I still haven't
gotten" attachment that keeps players in a world.

### Progression gating

Device tiers unlock signature complexity. Higher archetypes — **True dragon**, **Leviathan**,
ancients — require better cores. **That is your progression gate instead of level walls**, and it is
skill-expressive: a good player with a mid-tier core can attempt something above their station and
feel it.

---

## 5. THE ASYMMETRY WORTH KEEPING

Do not let the two systems converge. They should feel like different relationships.

| | **Crystalborn** | **Tamed** |
|---|---|---|
| State when acquired | Asleep, and yours | Awake, and it agreed |
| Bond | Immediate, unconditional | Earned, and maintainable |
| Emotional register | Inheritance | Negotiation |
| Animation on acquisition | Wakes, orients, chooses you | Holds ground, assesses, relents |
| Mechanical hook | Fixed high ceiling | Grows with continued investment |

**[Design proposal]** Give them different long-term systems: crystalborn dragons have a **fixed
ceiling reached through use**, while tamed dragons have a **loyalty value that can rise or fall**
with how you treat them. Two progression curves, two reasons to keep both kinds in a roster.

---

## 6. RARITY AND PROGRESSION STRUCTURE

| Tier | Source | Supply | Feel |
|---|---|---|---|
| **Crystalborn — whole** | Evaporated crystal | Very finite | The centrepiece of a roster |
| **Crystalborn — fractured** | Rushed crystal | Same crystals, worse outcome | A scar you keep |
| **Elite wild** | High-tier device on rare wild dragons | Scarce, respawning slowly | The aspirational grind |
| **Common wild** | The main loop | Plentiful | Roster depth, experimentation |
| *(later)* **Hatched** | Breeding two bonded dragons | Player-generated | Long-tail economy — **do not design for v1** |

---

## 7. STACK AND PERFORMANCE NOTES

Being direct: **60 fps 3D with physics in a mobile browser is hard.** Three.js plus Rapier on a
mid-range Android is a real constraint and it should shape scope, not be discovered late.

- **Textures: KTX2 / Basis compressed** via the `KHR_texture_basisu` glTF extension and Three's
  `KTX2Loader`. On mobile this is the single biggest win available — uncompressed PNGs in glTF will
  sink the payload and the GPU memory budget.
- **Draw calls:** share materials aggressively, atlas attachment textures, and instance repeated
  parts. Mobile GPUs care far more about draw-call count than triangle count.
- **Rapier colliders: simplified capsules or compound shapes, never per-bone.** One capsule for the
  body, maybe one for the head. Dragons do not need accurate physics bodies; they need believable
  ones.
- **Animation:** author clips **once per archetype** and share across every dragon on that skeleton.
  Never author per-species animation.
- **LOD:** aggressive and early. Two or three levels per archetype.
- **On-screen budget:** design encounters for **one to three dragons visible**, not swarms. Build the
  camera and encounter design around that from day one.
- **PWA asset strategy:** bundle **per region**, load on demand, cache in the service worker. Do not
  ship the whole bestiary in the initial payload — a collection game's install size is a churn
  factor.
- **Test on a real mid-range Android throughout**, not a desktop browser at a phone resolution. They
  are not the same machine and the gap will surprise you.

---

## 8. V1 SCOPE — WHAT TO BUILD FIRST

The temptation is the bestiary. **The bet is the crystal moment.** If holding a crystal until it
evaporates feels good on a phone, this game works. If it does not, no amount of roster fixes it.

**Ship this and nothing else:**

1. **One region.** Small, hand-built, beautiful.
2. **Two archetypes** — **Wyrm** and **Drake**. Cheapest rigs, most distinct from each other.
3. **Eight visual variants** across those two, using all four bestiary layers, to prove the
   combinatorial pipeline end to end.
4. **System A, complete:** one crystal, both outcomes — evaporated and fractured — fully felt.
5. **System B, complete:** the device at tier one, three wild dragons, the wariness state persisting.
6. **No breeding, no PvP, no economy, no meta-progression.**

**The single success test:** hand it to someone with no explanation. If they hold the first crystal
too briefly, fracture it, and are visibly annoyed at *themselves* — the design works and the rest is
production.

---

## 9. OPEN DECISIONS

1. **Tuning or rhythm** for the match step. Prototype both on a phone; do not decide on paper. §4
2. **The device's name**, and whether the player builds, finds or inherits it.
3. **Where crystals come from in-world.** They need no cosmology, but they need an *aesthetic*
   explanation a player can feel — fallen, grown, buried, or made.
4. **How many named species** the index should target. **[Suggested]** 60 by launch, 12 in v1.
5. **Whether crystalborn dragons can be fractured *deliberately*** for a different reward. Probably
   not — it undercuts the lesson — but it is worth one conversation.
6. **Does the player character have a role in the fiction at all**, or is the dragon the protagonist?
   This decides camera, animation priorities and the art budget, so it should be settled before the
   first rig.
7. **Whether "knights" survives** as the player fantasy now that the Babylon framing is gone. It is
   free again — nothing constrains it.

---

## 10. IMPLEMENTATION NOTES (this codebase, added 2026-09-28)

What actually shipped in `iamchrisvelez-bit/dragonbound` against this doc, and what's still a gap.
See the top-level README's "What's built" / "What's stubbed" sections for the authoritative,
maintained status — this section is a one-time snapshot of the mapping from doc to code.

**Built, for real, against the existing single-archetype asset:**
- System A (crystals): `src/world/Crystal.ts` + `src/taming/CrystalController.ts` implement the
  hold-and-attune interaction verbatim — a continuous hold (not a tap), a resonance meter, a mid-hold
  destabilisation beat with Vibration API feedback, evaporate-on-patience vs fracture-on-early-release,
  a dulled palette tint on fracture, and a real (if reduced) stat-ceiling difference. Two crystals are
  hand-placed in `ZoneLoader.ts`'s starting zone.
- System B (wild taming) rework: `src/taming/ResonanceMinigame.ts` (was `TamingMinigame.ts`) replaces
  the old plain tap-sequence with reading → matching (rhythm-tap, chosen over tuning per §4's "rhythm
  suits the platform" — this is a touch-first game, and a continuous drag-to-align gesture was judged
  worse on a phone than tap-on-beat) → holding. Failure now flees the dragon (a real velocity impulse,
  not a teleport) and increments a persisted-for-the-session `wariness` counter that tightens the next
  attempt's signature, per §4's "failure is a spooked dragon, not a lost one."
- The crystalborn/tamed asymmetry (§5): `origin` and `loyalty` are now real fields on
  `SavedStabledDragon`, with a stat-ceiling multiplier formula in `DragonLeveling.ts`.

**Explicitly not built (needs new art, not just code):**
- The Layer 1-4 bestiary generator (§2) — multiple rigged archetypes, modular socketed attachments,
  mask-texture tinting, proportion offsets. This game still has exactly one dragon archetype (the
  user-provided `dragon.glb` whelp model, animation-limited to Idle/Walk/Flap/Roar). Building the
  generator pipeline without a second archetype to prove it against would be speculative work; it's
  flagged as a follow-up once more rigged CC0 (or otherwise cleared) creature assets are available.
  Crystalborn palette variation is approximated today with a flat material-color multiply on
  fracture, not the described mask-texture system.
- KTX2/Basis texture compression, LOD levels, per-region asset bundling (§7) — this is still a
  single-zone vertical slice with one dragon model; these are real concerns once the game has enough
  assets for payload size to matter.
- Device tiers gating signature complexity by archetype (§4's progression gating) — meaningless with
  only one archetype today; `wariness`-based difficulty scaling is the one axis of difficulty that
  exists right now.
- Dragon ability slots as part of the crystalborn/tamed asymmetry — dragons (as opposed to the
  player Knight) have no ability-unlock system in this codebase at all yet, so "fewer ability slots"
  on a fractured crystalborn dragon isn't modeled.
