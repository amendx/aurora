/**
 * Paleta de Cores do App Aurora
 * 
 * Cores principais baseadas na paleta profissional:
 * - Charcoal Blue: #34495e (texto principal, elementos críticos)
 * - Jet Black: #31373d (texto secundário, sombras)
 * - Blue Slate: #49627a (bordas, elementos intermediários)
 * - Baby Blue Ice: #97cafc (destaques, elementos suaves)
 * - Mint Leaf: #41b883 (sucesso, confirmações, elementos positivos)
 */

export const COLORS = {
  // Cores principais
  CHARCOAL_BLUE: '#34495e',
  JET_BLACK: '#31373d', 
  BLUE_SLATE: '#49627a',
  BABY_BLUE_ICE: '#97cafc',
  MINT_LEAF: '#41b883',
  
  // Cores semânticas
  PRIMARY: '#41b883',        // Mint Leaf
  SECONDARY: '#49627a',      // Blue Slate
  BACKGROUND: '#3e556c',     // Intermediário entre Charcoal Blue e Blue Slate
  TEXT_PRIMARY: '#34495e',   // Charcoal Blue
  TEXT_SECONDARY: '#31373d', // Jet Black
  ACCENT: '#97cafc',         // Baby Blue Ice
  
  // Cores de status
  SUCCESS: '#41b883',        // Verde - Sucesso
  WARNING: '#f39c12',        // Laranja - Aviso
  ERROR: '#e74c3c',          // Vermelho - Erro
  INFO: '#97cafc',           // Azul - Informação
  
  // Backgrounds
  CARD_BACKGROUND: '#f8f9fa', // Fundo de cartões
  SEPARATOR_COLOR: '#e9ecef', // Cor dos separadores
  INPUT_BACKGROUND: '#ffffff', // Fundo de inputs
  
  // Modo escuro
  BACKGROUND_DARK: '#1a1a1a',
  CARD_BACKGROUND_DARK: '#2d2d2d',
  TEXT_PRIMARY_DARK: '#ffffff',
  TEXT_SECONDARY_DARK: '#b0b0b0',
  TEXT_DISABLED: '#999999',
  TEXT_DISABLED_DARK: '#666666',
  SEPARATOR_COLOR_DARK: '#404040',
  INPUT_BACKGROUND_DARK: '#404040',
  SHADOW_COLOR: '#000000',
  
  // Estados de plantões (por quantidade)
  SHIFTS_1: '#41b883',       // Mint Leaf - 1 plantão
  SHIFTS_2: '#97cafc',       // Baby Blue Ice - 2 plantões
  SHIFTS_3: '#31373d',       // Blue Slate - 3 plantões
  SHIFTS_4_PLUS: '#34495e',  // Charcoal Blue - 4+ plantões
  
  // Backgrounds suaves
  BG_SHIFTS_1: '#e8f5e8',    // Verde suave
  BG_SHIFTS_2: '#f0f7fe',    // Azul suave  
  BG_SHIFTS_3: '#eaeff4',    // Cinza-azul suave
  BG_SHIFTS_4_PLUS: '#e6e9ed', // Cinza suave
  
  // Cores básicas
  WHITE: '#ffffff',
  BLACK: '#000000',
  TRANSPARENT: 'transparent',
  
  // Sombras e overlays
  SHADOW: '#000000',
  OVERLAY: 'rgba(49, 55, 61, 0.3)',
};

// Configuração da paleta completa para referência
export const COLOR_PALETTE = {
  'Charcoal Blue': {
    hex: '#34495e',
    rgb: [52, 73, 94],
    name: 'Charcoal Blue'
  },
  'Jet Black': {
    hex: '#31373d', 
    rgb: [49, 55, 61],
    name: 'Jet Black'
  },
  'Blue Slate': {
    hex: '#49627a',
    rgb: [73, 98, 122], 
    name: 'Blue Slate'
  },
  'Baby Blue Ice': {
    hex: '#97cafc',
    rgb: [151, 202, 252],
    name: 'Baby Blue Ice' 
  },
  'Mint Leaf': {
    hex: '#41b883',
    rgb: [65, 184, 131],
    name: 'Mint Leaf'
  }
};

// Array simples para iteração
export const COLOR_ARRAY = ['#34495e', '#31373d', '#49627a', '#97cafc', '#41b883'];

export default COLORS;