const LEGACY_HUMAN_BADGE_FLAIRS = new Set([
  '🌐 Human Checked',
  '🌐 human',
  ':unique_human: human',
]);

export function isLegacyHumanBadgeFlair(flairText: string | undefined): boolean {
  return Boolean(flairText && LEGACY_HUMAN_BADGE_FLAIRS.has(flairText.trim()));
}
