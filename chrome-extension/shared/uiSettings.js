export const THEME_OPTIONS = [
  { value: 'default', label: '默认蓝' },
  { value: 'claude-light', label: 'Claude浅色' },
  { value: 'claude-dark', label: 'Claude深色' },
  { value: 'midnight-blue', label: '午夜蓝' },
  { value: 'graphite-black', label: '石墨黑' },
  { value: 'glass-blue', label: '玻璃蓝' },
  { value: 'paper-cream', label: '纸张奶油' },
  { value: 'amethyst', label: '紫晶' },
  { value: 'win11', label: 'Win11' },
  { value: 'sunset-orange', label: '日落橙' },
  { value: 'mint-light', label: '薄荷浅色' }
];

export const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '标准' },
  { value: 'large', label: '大' },
  { value: 'xlarge', label: '特大' }
];

const THEME_VALUES = new Set(THEME_OPTIONS.map((item) => item.value));
const FONT_VALUES = new Set(FONT_SIZE_OPTIONS.map((item) => item.value));
const DIVIDER_STYLES = new Set(['solid','dashed','dotted','double','gradient','shadow','glow','soft-card','left-accent','stamp']);

export function safeTheme(value) {
  return THEME_VALUES.has(value) ? value : 'default';
}

export function safeFontSize(value) {
  return FONT_VALUES.has(value) ? value : 'xlarge';
}

export function safeDividerThickness(value) {
  const n = Number(value);
  return [0,1,2,3,4,6,8].includes(n) ? n : 1;
}

export function safeDividerStyle(value) {
  return DIVIDER_STYLES.has(value) ? value : 'solid';
}

export function applyVisualSettings(settings, target = document.body) {
  target.dataset.theme = safeTheme(settings && settings.theme);
  target.dataset.fontSize = safeFontSize(settings && settings.fontSize);
  target.dataset.mailDividerStyle = safeDividerStyle(settings && settings.mailDividerStyle);
  target.style.setProperty('--mail-divider-size', `${safeDividerThickness(settings && settings.mailDividerThickness)}px`);
}
