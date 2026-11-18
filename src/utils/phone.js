'use strict';

class PhoneValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

/**
 * Normaliza telefone brasileiro/internacional para formato canonico E.164.
 */
function normalizePhoneE164(raw) {
  const input = String(raw || '').trim();
  if (!input) {
    throw new PhoneValidationError('Telefone/WhatsApp e obrigatorio.');
  }

  if (input.startsWith('+')) {
    const cleanIntl = '+' + input.slice(1).replace(/\D/g, '');
    if (!/^\+\d{10,15}$/.test(cleanIntl)) {
      throw new PhoneValidationError('Telefone internacional invalido para padrao E.164.');
    }
    return cleanIntl;
  }

  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('00') && digits.length >= 12) {
    const intl = '+' + digits.slice(2);
    if (/^\+\d{10,15}$/.test(intl)) return intl;
  }

  if ((digits.length === 11 || digits.length === 12) && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    return '+' + digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    const ddd = Number(digits.slice(0, 2));
    if (ddd < 11 || ddd > 99) {
      throw new PhoneValidationError('DDD brasileiro invalido.');
    }
    return '+55' + digits;
  }

  throw new PhoneValidationError('Informe o WhatsApp/Telefone com DDD valido (10 ou 11 digitos).');
}

/**
 * Formata telefone E.164 brasileiro para exibicao legivel no balcao.
 */
function formatPhoneBr(e164) {
  const clean = String(e164 || '').trim();
  if (!clean) return '';
  if (clean.startsWith('+55')) {
    const local = clean.slice(3);
    if (local.length === 11) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    }
    if (local.length === 10) {
      return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    }
  }
  return clean;
}

/**
 * Normaliza CEP para XXXXX-XXX ou string vazia se omitido.
 */
function normalizeCep(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 8) {
    throw new PhoneValidationError('CEP deve conter exatamente 8 digitos.');
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/**
 * Formata CPF (11 digitos) ou CNPJ (14 digitos) quando preenchido.
 */
function normalizeCpfCnpj(raw) {
  const input = String(raw || '').trim();
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  throw new PhoneValidationError('CPF deve ter 11 digitos ou CNPJ 14 digitos.');
}

module.exports = {
  normalizePhoneE164,
  formatPhoneBr,
  normalizeCep,
  normalizeCpfCnpj
};
