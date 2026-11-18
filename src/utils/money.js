'use strict';

/**
 * Arredonda valores monetarios deterministicamente para 2 casas decimais.
 */
function roundMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new RangeError('Valor monetario invalido.');
  }
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Formata valor em Real Brasileiro (R$ 1.234,56) com espaco ASCII regular.
 */
function formatBrl(value) {
  const rounded = roundMoney(value || 0);
  const absVal = Math.abs(rounded);
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absVal);
  return (rounded < 0 ? '-R$ ' : 'R$ ') + formatted;
}

/**
 * Converte cor hex (#RGB ou #RRGGBB) e calcula luminancia Y = 0.299R + 0.587G + 0.114B.
 * Garante contraste WCAG AAA sobre botoes e badges de acento White-Label.
 */
function computeLuminance(hexColor) {
  if (typeof hexColor !== 'string') {
    throw new TypeError('Cor de destaque deve ser uma string hexadecimal.');
  }
  const clean = hexColor.trim();
  const matchShort = /^#([0-9a-fA-F]{3})$/.exec(clean);
  let normalized = clean;
  if (matchShort) {
    const [, c] = matchShort;
    normalized = `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`.toUpperCase();
  }
  const matchFull = /^#([0-9a-fA-F]{6})$/.exec(normalized);
  if (!matchFull) {
    throw new RangeError(`Cor hexadecimal invalida: ${hexColor}`);
  }
  const hex = matchFull[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = roundMoney(0.299 * r + 0.587 * g + 0.114 * b);
  const contrastText = luminance >= 155 ? '#121316' : '#FFFFFF';
  return {
    hex: `#${hex.toUpperCase()}`,
    r,
    g,
    b,
    luminance,
    contrastText,
    focusRing: `rgba(${r}, ${g}, ${b}, 0.16)`,
    softBg: `rgba(${r}, ${g}, ${b}, 0.10)`
  };
}

/**
 * Remove tags e atributos perigosos de SVGs inseridos pelo usuario no White-Label.
 */
function sanitizeSvg(rawSvg) {
  if (typeof rawSvg !== 'string') return '';
  const trimmed = rawSvg.trim();
  if (!trimmed.toLowerCase().startsWith('<svg')) return '';
  return trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/javascript:/gi, '');
}

module.exports = {
  roundMoney,
  formatBrl,
  computeLuminance,
  sanitizeSvg
};
