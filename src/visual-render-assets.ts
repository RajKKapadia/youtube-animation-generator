import {createHash} from 'node:crypto';
import {copyFile, readFile} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {existsSync} from 'node:fs';
import type {GeneratedVisualAssets} from './generated-visuals.js';
import {
  assetFilePath,
  brandAssetForLabel,
  iconAssetForId,
  loadAssetRegistry,
  normalizeAssetLabel,
} from './asset-registry.js';
import {semanticIconDefinitionFor} from './icon-catalog.js';
import type {
  LocalBrandAsset,
  LocalIconAsset,
  NarratedMediaAsset,
  RenderAspectRatio,
  RenderableVisualScene,
  SelectedMotionAsset,
  TechnologyBrandIcon,
} from './types.js';

export interface StagedVisualAssets {
  foregroundAssets: Record<RenderAspectRatio, Record<string, string>>;
  localBrandAssets: Record<string, LocalBrandAsset>;
  localIconAssets: Record<string, LocalIconAsset>;
  motionAssets: Record<string, SelectedMotionAsset>;
  technologyIcons: Record<string, TechnologyBrandIcon>;
}

export const stageVisualRenderAssets = async ({
  foregroundAssets,
  mediaAssets,
  planDirectory,
  profiles,
  publicDirectory,
  scenes,
  sourceTextForScene,
}: {
  foregroundAssets?: GeneratedVisualAssets | undefined;
  mediaAssets: NarratedMediaAsset[];
  planDirectory: string;
  profiles: Array<{aspectRatio: RenderAspectRatio}>;
  publicDirectory: string;
  scenes: RenderableVisualScene[];
  sourceTextForScene: (scene: RenderableVisualScene) => string;
}): Promise<StagedVisualAssets> => {
  const publicForegroundAssets: StagedVisualAssets['foregroundAssets'] = {
    '16:9': {},
    '9:16': {},
  };
  const copiedForegroundFiles = new Set<string>();
  for (const profile of profiles) {
    for (const scene of scenes) {
      if (scene.visual.kind !== 'image-focus') continue;
      const mediaId = scene.visual.mediaId;
      const media = mediaAssets.find(({id}) => id === mediaId);
      if (!media) throw new Error(`Visual plan is missing foreground media ${mediaId}.`);
      const sourcePath = media.source === 'local'
        ? resolve(planDirectory, media.file)
        : foregroundAssets?.[profile.aspectRatio]?.[media.id];
      if (!sourcePath || !existsSync(sourcePath)) {
        throw new Error(
          `${media.source === 'local' ? 'Local' : 'Generated'} foreground image does not exist for ${scene.id} (${profile.aspectRatio}).`,
        );
      }
      if (media.source === 'local') {
        const hash = createHash('sha256').update(await readFile(sourcePath)).digest('hex');
        if (hash !== media.sha256) {
          throw new Error(`Local foreground image hash does not match the saved plan: ${media.file}`);
        }
      }
      const publicName = `foreground-${media.id}-${basename(sourcePath)}`;
      if (!copiedForegroundFiles.has(publicName)) {
        await copyFile(sourcePath, resolve(publicDirectory, publicName));
        copiedForegroundFiles.add(publicName);
      }
      publicForegroundAssets[profile.aspectRatio][media.id] = publicName;
    }
  }

  const registry = await loadAssetRegistry();
  for (const warning of registry.warnings) {
    console.warn(`Asset registry warning: ${warning}`);
  }

  const motionAssets: Record<string, SelectedMotionAsset> = {};
  for (const assetId of new Set(
    scenes.flatMap((scene) => scene.visual.assetId ? [scene.visual.assetId] : []),
  )) {
    const asset = registry.motionAssets.find(({id}) => id === assetId);
    if (!asset) {
      throw new Error(
        `Visual plan references unregistered motion asset "${assetId}". Add it to assets/motion/manifest.json before rendering.`,
      );
    }
    const publicName = `motion-${asset.id}.json`;
    await copyFile(assetFilePath(registry, asset.file), resolve(publicDirectory, publicName));
    motionAssets[asset.id] = {
      id: asset.id,
      file: publicName,
      loop: asset.loop,
      playbackRate: asset.playbackRate,
      colorMap: asset.colorMap,
    };
  }

  const allLabels = scenes.flatMap((scene) => [
    ...scene.primaryItems,
    ...scene.secondaryItems,
  ]);
  const brandLabels = new Set(
    scenes
      .filter((scene) => scene.visual.kind === 'brand-showcase')
      .flatMap((scene) => [...scene.primaryItems, ...scene.secondaryItems]),
  );
  const diagramLabels = new Set(
    scenes
      .filter((scene) => scene.visual.kind === 'diagram')
      .flatMap((scene) => [...scene.primaryItems, ...scene.secondaryItems]),
  );
  const sourceBackedBrandLabels = new Set(
    scenes
      .filter((scene) => scene.visual.kind === 'brand-showcase')
      .flatMap((scene) => {
        const source = ` ${normalizeAssetLabel(sourceTextForScene(scene))} `;
        return [...scene.primaryItems, ...scene.secondaryItems].filter((label) =>
          source.includes(` ${normalizeAssetLabel(label)} `),
        );
      }),
  );
  const {
    exactTechnologyBrandIconFor,
    technologyBrandIconFor,
  } = await import('./technology-catalog.js');
  const technologyIcons = Object.fromEntries(
    [...new Set(allLabels)].flatMap((label) => {
      const icon = brandLabels.has(label)
        ? sourceBackedBrandLabels.has(label)
          ? exactTechnologyBrandIconFor(label)
          : undefined
        : diagramLabels.has(label)
          ? technologyBrandIconFor(label)
          : exactTechnologyBrandIconFor(label);
      return icon ? [[label, icon] as const] : [];
    }),
  );

  const copiedBrands = new Map<string, string>();
  const localBrandAssets: Record<string, LocalBrandAsset> = {};
  for (const label of new Set(allLabels)) {
    if (technologyIcons[label]) continue;
    if (brandLabels.has(label) && !sourceBackedBrandLabels.has(label)) continue;
    const asset = brandAssetForLabel(registry, label);
    if (!asset) continue;
    const publicName = copiedBrands.get(asset.id) ?? `brand-${asset.id}.svg`;
    if (!copiedBrands.has(asset.id)) {
      await copyFile(assetFilePath(registry, asset.file), resolve(publicDirectory, publicName));
      copiedBrands.set(asset.id, publicName);
    }
    localBrandAssets[label] = {
      id: asset.id,
      title: asset.canonicalName,
      file: publicName,
      colorPolicy: asset.colorPolicy,
    };
  }

  const localIconAssets: Record<string, LocalIconAsset> = {};
  const selectedIconIds = new Set(
    scenes.flatMap((scene) => [
      ...(scene.icons.focal ? [scene.icons.focal] : []),
      ...scene.icons.primary.flatMap((id) => id ? [id] : []),
      ...scene.icons.secondary.flatMap((id) => id ? [id] : []),
    ]),
  );
  for (const iconId of selectedIconIds) {
    if (semanticIconDefinitionFor(iconId)) continue;
    const asset = iconAssetForId(registry, iconId);
    if (!asset) {
      throw new Error(
        `Visual plan references unregistered icon "${iconId}". Add it to assets/icons/manifest.json before rendering.`,
      );
    }
    const publicName = `icon-${asset.id}.svg`;
    await copyFile(assetFilePath(registry, asset.file), resolve(publicDirectory, publicName));
    localIconAssets[asset.id] = {
      id: asset.id,
      file: publicName,
      colorPolicy: asset.colorPolicy,
    };
  }

  return {
    foregroundAssets: publicForegroundAssets,
    localBrandAssets,
    localIconAssets,
    motionAssets,
    technologyIcons,
  };
};
