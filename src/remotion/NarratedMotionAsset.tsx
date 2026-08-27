import {Lottie, type LottieAnimationData} from '@remotion/lottie';
import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
} from 'remotion';
import type {SelectedMotionAsset, VideoPalette} from '../types.js';
import {videoPaletteFor} from '../visual-palettes.js';

const colorToHex = (color: number[]): string | undefined => {
  if (color.length < 3 || color.slice(0, 3).some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  const values = color.slice(0, 3).map((value) =>
    Math.round((value <= 1 ? value * 255 : value)),
  );
  if (values.some((value) => value < 0 || value > 255)) return undefined;
  return `#${values.map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

const hexToLottieColor = (hex: string, alpha = 1): number[] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha,
  ];
};

const recolorValue = (
  value: unknown,
  replacements: Record<string, string>,
): unknown => {
  if (Array.isArray(value)) return value.map((child) => recolorValue(child, replacements));
  if (!value || typeof value !== 'object') return value;

  const source = value as Record<string, unknown>;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    clone[key] = recolorValue(child, replacements);
  }
  if (
    (source.ty === 'fl' || source.ty === 'st') &&
    source.c &&
    typeof source.c === 'object'
  ) {
    const color = source.c as Record<string, unknown>;
    if (color.a === 0 && Array.isArray(color.k)) {
      const sourceHex = colorToHex(color.k.filter((item): item is number => typeof item === 'number'));
      const replacement = sourceHex ? replacements[sourceHex] : undefined;
      if (replacement) {
        clone.c = {
          ...color,
          k: hexToLottieColor(
            replacement,
            typeof color.k[3] === 'number' ? color.k[3] : 1,
          ),
        };
      }
    }
  }
  return clone;
};

export const recolorLottieAnimation = (
  animationData: LottieAnimationData,
  asset: SelectedMotionAsset,
  palette: VideoPalette,
): LottieAnimationData => {
  const theme = videoPaletteFor(palette);
  const replacements = Object.fromEntries(
    Object.entries(asset.colorMap).map(([source, token]) => [
      source.toUpperCase(),
      theme.accents[token],
    ]),
  );
  return recolorValue(animationData, replacements) as LottieAnimationData;
};

export const lottieSourceFrameAt = ({
  fps,
  frame,
  inPoint,
  loop,
  outPoint,
  playbackRate,
  sourceFps,
}: {
  fps: number;
  frame: number;
  inPoint: number;
  loop: boolean;
  outPoint: number;
  playbackRate: number;
  sourceFps: number;
}): number => {
  const duration = Math.max(1, outPoint - inPoint);
  const elapsed = Math.max(0, frame) * (sourceFps / fps) * playbackRate;
  return inPoint + (loop ? elapsed % duration : Math.min(duration - 1, elapsed));
};

export const NarratedMotionAsset = ({
  asset,
  palette,
  style,
}: {
  asset: SelectedMotionAsset;
  palette: VideoPalette;
  style?: CSSProperties;
}) => {
  const [animationData, setAnimationData] = useState<LottieAnimationData | null>(null);
  const [handle] = useState(() => delayRender(`Loading local Lottie ${asset.id}`));

  useEffect(() => {
    let cancelled = false;
    fetch(staticFile(asset.file))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load ${asset.file}.`);
        return response.json() as Promise<LottieAnimationData>;
      })
      .then((data) => {
        if (!cancelled) {
          setAnimationData(data);
          continueRender(handle);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          cancelRender(
            error instanceof Error
              ? error
              : new Error(`Could not load local Lottie ${asset.id}.`),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset.file, asset.id, handle]);

  const themedAnimation = useMemo(
    () => animationData
      ? recolorLottieAnimation(animationData, asset, palette)
      : null,
    [animationData, asset, palette],
  );

  if (!themedAnimation) return null;
  return (
    <Lottie
      animationData={themedAnimation}
      loop={asset.loop === 'loop'}
      playbackRate={asset.playbackRate}
      preserveAspectRatio="xMidYMid meet"
      renderer="svg"
      {...(style ? {style} : {})}
    />
  );
};
