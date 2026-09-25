# Asset drop-in convention

`AssetLoader` (`src/core/AssetLoader.ts`) looks for real glTF assets at
fixed paths and silently falls back to a procedural placeholder mesh when
they're missing. Drop CC0 assets in with these exact names and a page
refresh will pick them up automatically - **no code changes required**.

This directory lives under `public/` (not a bare top-level `/assets`) so
Vite's production build actually copies it into `dist/` - see
`vite.config.ts`'s `build.assetsDir` comment if you're wondering why that
doesn't collide with Vite's own bundled JS/CSS output, which normally
also wants `dist/assets/`.

```
public/assets/
  models/
    knight.glb      # player character, rigged + skinned - already present (see CREDITS.md)
    dragon.glb      # dragon enemy/mount, rigged + skinned - already present (see CREDITS.md)
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
- Nothing under here is committed by default (see root `.gitignore`)
  except this README, `CREDITS.md`, a `.gitkeep` per folder, and any
  specific file explicitly allow-listed (like `models/knight.glb`, a
  verified CC0 asset, and `models/dragon.glb`, provided directly by the
  project owner with its license not yet confirmed - see `CREDITS.md`
  for both) - so the repo stays small until real, properly-licensed art
  is dropped in.
- Recommended CC0 sources: KayKit (kaylousberg.itch.io, also mirrored on
  GitHub under the `KayKit-Game-Assets` org - reachable even from
  network-restricted environments where itch.io/Quaternius/Kenney
  aren't), Quaternius (quaternius.com), and Kenney.nl (kenney.nl/assets).
