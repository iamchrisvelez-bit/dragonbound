# Asset drop-in convention

`AssetLoader` (`src/core/AssetLoader.ts`) looks for real glTF assets at
fixed paths and silently falls back to a procedural placeholder mesh when
they're missing. Drop CC0 assets in with these exact names and a page
refresh will pick them up automatically - **no code changes required**.

```
assets/
  models/
    knight.glb      # player character, ideally rigged + skinned
    dragon.glb      # dragon enemy/mount, ideally rigged + skinned
  animations/
    knight-idle.glb # optional: separate animation-only clips for retargeting
    knight-run.glb
    knight-attack.glb
    dragon-idle.glb
    ...
  textures/
    (referenced by your .glb's embedded or external texture paths)
```

Notes:

- `models/*.glb` is loaded via `GLTFLoader` and cloned per-instance with
  `SkeletonUtils.clone` so skinned meshes work correctly if multiple
  copies are ever spawned.
- `animations/*.glb` is for the common CC0 workflow where a character mesh
  and its animation clips ship as separate files (e.g. Mixamo exports
  retargeted separately). `AssetLoader.loadAnimationClips(name)` returns
  the clips array from that file.
- Nothing under `/assets` is committed by default (see root `.gitignore`)
  except this README and a `.gitkeep` per folder, so the repo stays small
  until real art is dropped in.
- Recommended CC0 sources: Kenney.nl (kenney.nl/assets), Quaternius
  (quaternius.com), and Mixamo (mixamo.com, free account required, CC0-like
  license for the rigs/animations) for a knight + dragon starting point.
