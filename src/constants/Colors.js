/**
 * Paleta de Cores do App Aurora  (v2 — Dark Theme)
 *
 * Nova paleta cool-toned:
 *   Charcoal Blue  #3d4d5c  — superfícies profundas / bg principal
 *   Blue Slate     #49627a  — cards e superfícies elevadas
 *   Blue Grey      #7096bb  — elementos inativos / mid-tone
 *   Baby Blue Ice  #97cafc  — destaque / accent
 *   Tropical Teal  #6cc1c0  — ação primária / interação
 *   Mint Leaf      #41b883  — sucesso / confirmação
 */

export const COLORS = {
  // ── Palette tokens ──────────────────────────────────
  CHARCOAL_BLUE:  '#3d4d5c',
  BLUE_SLATE:     '#49627a',
  BLUE_GREY:      '#7096bb',
  BABY_BLUE_ICE:  '#97cafc',
  TROPICAL_TEAL:  '#6cc1c0',
  MINT_LEAF:      '#41b883',
  ABYSS:          '#263340',   // surface mais profunda (bg dark)

  // ── Semântica ────────────────────────────────────────
  PRIMARY:        '#6cc1c0',   // Tropical Teal — ação principal
  SECONDARY:      '#49627a',   // Blue Slate
  BACKGROUND:     '#3d4d5c',   // Charcoal Blue
  TEXT_PRIMARY:   '#E8F4FD',   // branco azulado
  TEXT_SECONDARY: '#97cafc',   // Baby Blue Ice
  ACCENT:         '#97cafc',   // Baby Blue Ice

  // ── Status ───────────────────────────────────────────
  SUCCESS: '#41b883',          // Mint Leaf
  WARNING: '#FFBB55',          // âmbar quente — legível no fundo azul
  ERROR:   '#FF6B6B',          // vermelho suave — não conflita com a paleta fria
  INFO:    '#97cafc',          // Baby Blue Ice

  // ── Backgrounds (light mode) ─────────────────────────
  CARD_BACKGROUND:   '#f8f9fa',
  SEPARATOR_COLOR:   '#e9ecef',
  INPUT_BACKGROUND:  '#ffffff',

  // ── Dark Mode ────────────────────────────────────────
  BACKGROUND_DARK:        '#263340',   // abyss
  CARD_BACKGROUND_DARK:   '#3d4d5c',   // charcoal-blue
  TEXT_PRIMARY_DARK:      '#E8F4FD',
  TEXT_SECONDARY_DARK:    '#97cafc',   // baby-blue-ice
  TEXT_DISABLED:          '#7096bb',   // blue-grey
  TEXT_DISABLED_DARK:     'rgba(112, 150, 187, 0.50)',
  SEPARATOR_COLOR_DARK:   'rgba(73, 98, 122, 0.55)',
  INPUT_BACKGROUND_DARK:  '#49627a',   // blue-slate
  SHADOW_COLOR:           '#263340',

  // ── Estados de plantões ──────────────────────────────
  SHIFTS_1:     '#41b883',   // Mint Leaf      — 1 plantão
  SHIFTS_2:     '#6cc1c0',   // Tropical Teal  — 2 plantões
  SHIFTS_3:     '#97cafc',   // Baby Blue Ice  — 3 plantões
  SHIFTS_4_PLUS:'#7096bb',   // Blue Grey      — 4+ plantões

  // ── Backgrounds suaves (indicadores no calendário) ───
  BG_SHIFTS_1:      'rgba(65,  184, 131, 0.18)',  // mint
  BG_SHIFTS_2:      'rgba(108, 193, 192, 0.18)',  // teal
  BG_SHIFTS_3:      'rgba(151, 202, 252, 0.18)',  // ice
  BG_SHIFTS_4_PLUS: 'rgba(112, 150, 187, 0.18)',  // grey

  // ── Básicas ──────────────────────────────────────────
  WHITE:       '#ffffff',
  BLACK:       '#000000',
  TRANSPARENT: 'transparent',

  // ── Sombras e overlays ───────────────────────────────
  SHADOW:  '#263340',
  OVERLAY: 'rgba(38, 51, 64, 0.65)',
};

// Referência completa da paleta
export const COLOR_PALETTE = {
  'Charcoal Blue': { hex: '#3d4d5c', rgb: [61,  77,  92],  name: 'Charcoal Blue' },
  'Blue Slate':    { hex: '#49627a', rgb: [73,  98,  122], name: 'Blue Slate'    },
  'Blue Grey':     { hex: '#7096bb', rgb: [112, 150, 187], name: 'Blue Grey'     },
  'Baby Blue Ice': { hex: '#97cafc', rgb: [151, 202, 252], name: 'Baby Blue Ice' },
  'Tropical Teal': { hex: '#6cc1c0', rgb: [108, 193, 192], name: 'Tropical Teal' },
  'Mint Leaf':     { hex: '#41b883', rgb: [65,  184, 131], name: 'Mint Leaf'     },
};

// Array simples para iteração
export const COLOR_ARRAY = ['#34495e', '#31373d', '#49627a', '#97cafc', '#41b883'];

export default COLORS;