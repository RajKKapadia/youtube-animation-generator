import type {RenderProfile} from '../types.js';

export const COVER_PANEL_PADDING = 24;
export const COVER_BORDER = 2;
export const COMPARISON_PADDING = 18;

export const publishCoverLayout = (profile: RenderProfile) => {
  const vertical = profile.aspectRatio === '9:16';
  const contentWidth = profile.width - profile.safeArea.left - profile.safeArea.right;
  const gap = vertical ? 84 : 56;
  const panelWidth = vertical ? contentWidth : Math.round((contentWidth - gap) * 0.42);
  return {
    vertical,
    gap,
    contentWidth,
    titleWidth: vertical ? contentWidth : contentWidth - gap - panelWidth,
    panelWidth,
    panelContentWidth: panelWidth - 2 * (COVER_PANEL_PADDING + COVER_BORDER),
  };
};

export const publishCardLayout = (width: number, compact: boolean) => {
  const stacked = width < 260;
  const paddingX = stacked ? 12 : compact ? 16 : 20;
  const paddingY = stacked ? 12 : compact ? 14 : 17;
  const iconSize = stacked ? 40 : compact ? 56 : 68;
  const gap = stacked ? 10 : compact ? 14 : 18;
  const textHeight = stacked ? 76 : compact ? 70 : 88;
  return {
    stacked,
    paddingX,
    paddingY,
    iconSize,
    gap,
    textWidth: width - 2 * (paddingX + COVER_BORDER) - (stacked ? 0 : iconSize + gap),
    textHeight,
    height: (stacked ? iconSize + gap + textHeight : Math.max(iconSize, textHeight))
      + 2 * (paddingY + COVER_BORDER),
    fontSize: stacked ? 22 : compact ? 30 : 38,
    maxLines: stacked ? 3 : 2,
  };
};

const PUBLISH_UNIT = '(?:%|Cr|crores?|lakhs?|thousand|million|billion|k|m|bn|ms|seconds?|GB|MB)';
const publishAmountTokens = new RegExp(
  String.raw`(?:[+−-]\s*)?(?:(?:[₹$€£]|INR|USD|EUR|GBP|Rs\.?)\s*)?(?:[+−-]\s*)?\d[\d,]*(?:\.\d+)?(?:\s*${PUBLISH_UNIT})?[.,;:!?)]?(?=\s|$)|\S+`,
  'giu',
);
const publishUnitToken = new RegExp(String.raw`^${PUBLISH_UNIT}[.,;:!?)]*$`, 'iu');

/** Keep display amounts intact. This tokenizer is opt-in for covers only. */
export const publishTextTokens = (text: string): string[] => {
  const tokens = text.trim().replace(/\s+/gu, ' ').match(publishAmountTokens) ?? [];
  const groups: string[] = [];
  for (const token of tokens) {
    const previous = groups.at(-1);
    // A label or opening parenthesis can be attached to the amount without a space.
    if (previous && /\d$/u.test(previous) && publishUnitToken.test(token)) {
      groups[groups.length - 1] = `${previous} ${token}`;
    } else {
      groups.push(token);
    }
  }
  return groups;
};
