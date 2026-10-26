import { describe, expect, it } from 'vitest';
import { generateCard, hasBingo } from '../src/round.js';
import { defaultSquares } from '../src/squares.js';

describe('generateCard', () => {
  it('makes 24 unique pool squares and a FREE centre', () => {
    const card = generateCard(defaultSquares, 'viewer-seed');
    expect(card).toHaveLength(25);
    expect(card[12]).toBe('FREE');
    expect(card.filter((id) => id !== 'FREE')).toHaveLength(24);
    expect(new Set(card.filter((id) => id !== 'FREE')).size).toBe(24);
    expect(card.filter((id) => id !== 'FREE').every((id) => defaultSquares.some((square) => square.id === id))).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    expect(generateCard(defaultSquares, 'same-seed')).toEqual(generateCard(defaultSquares, 'same-seed'));
    expect(generateCard(defaultSquares, 'same-seed')).not.toEqual(generateCard(defaultSquares, 'other-seed'));
  });
});

describe('hasBingo', () => {
  const card = Array.from({ length: 25 }, (_, index) => index === 12 ? 'FREE' : `s${index}`);

  it('detects rows and does not win before a line is complete', () => {
    expect(hasBingo(card, new Set(['s0', 's1', 's2', 's3']))).toBe(false);
    expect(hasBingo(card, new Set(['s0', 's1', 's2', 's3', 's4']))).toBe(true);
  });

  it('detects columns', () => {
    expect(hasBingo(card, new Set(['s0', 's5', 's10', 's15', 's20']))).toBe(true);
  });

  it('detects both diagonals with FREE counting as marked', () => {
    expect(hasBingo(card, new Set(['s0', 's6', 's18', 's24']))).toBe(true);
    expect(hasBingo(card, new Set(['s4', 's8', 's16', 's20']))).toBe(true);
  });

  it('rejects malformed grids', () => {
    expect(hasBingo(['FREE'], new Set())).toBe(false);
  });
});
