import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Wraps glTF loading so entities never care whether a real asset exists yet.
 * Drop a matching .glb into /assets/models (or /assets/animations) and the
 * next load will pick it up automatically - no code changes required. Until
 * then, callers get a low-poly placeholder mesh built from THREE primitives.
 *
 * Expected layout (see /assets/README.md):
 *   /assets/models/knight.glb
 *   /assets/models/dragon.glb
 *   /assets/animations/knight-*.glb  (separate animation-only clips, optional)
 */
export interface LoadedModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export class AssetLoader {
  private loader = new GLTFLoader();
  private gltfCache = new Map<string, Promise<GLTF | null>>();

  /**
   * Loads /assets/models/<name>.glb if present; otherwise returns null so
   * the caller can build its placeholder. Result is cached per name.
   */
  private loadGltf(url: string): Promise<GLTF | null> {
    let pending = this.gltfCache.get(url);
    if (!pending) {
      pending = this.loader
        .loadAsync(url)
        .then((gltf) => gltf)
        .catch((err) => {
          console.info(`[AssetLoader] no asset at ${url}, using placeholder. (${err?.message ?? err})`);
          return null;
        });
      this.gltfCache.set(url, pending);
    }
    return pending;
  }

  /**
   * Load a named model with graceful fallback. `placeholderFactory` builds
   * a procedural stand-in mesh; it is only invoked if the real asset is
   * missing or fails to parse.
   */
  async loadModel(name: string, placeholderFactory: () => LoadedModel): Promise<LoadedModel> {
    const gltf = await this.loadGltf(`/assets/models/${name}.glb`);
    if (!gltf) return placeholderFactory();
    return {
      scene: cloneSkinned(gltf.scene) as THREE.Object3D,
      animations: gltf.animations,
    };
  }

  /** Loads a standalone animation-only glb (common CC0 retargeting workflow). */
  async loadAnimationClips(name: string): Promise<THREE.AnimationClip[]> {
    const gltf = await this.loadGltf(`/assets/animations/${name}.glb`);
    return gltf?.animations ?? [];
  }
}

export const assetLoader = new AssetLoader();
