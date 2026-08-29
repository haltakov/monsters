import { BadRequestException } from '@nestjs/common';
import { decodeMonsterDna, encodeMonsterDna } from '@monsters/game-core';
import type { MonsterDna } from '@monsters/game-core';

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 24;

/** C0 controls, DEL and the C1 range. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]');

/**
 * Trims, length-limits and rejects control characters. Used for both guest
 * display names and monster names so nothing unprintable reaches other players.
 */
export function normalizeDisplayName(value: unknown, field = 'name'): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string`);
  }
  if (CONTROL_CHARACTERS.test(value)) {
    throw new BadRequestException(
      `${field} must not contain control characters`,
    );
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_NAME_LENGTH) {
    throw new BadRequestException(
      `${field} must be at least ${MIN_NAME_LENGTH} characters`,
    );
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new BadRequestException(
      `${field} must be at most ${MAX_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
}

/** Database key used to enforce globally unique player monster nicknames. */
export function normalizeNicknameKey(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-US');
}

/** Accepts only a DNA string the shared codec can decode. */
export function parseDna(value: unknown): {
  dna: MonsterDna;
  encoded: string;
} {
  if (typeof value !== 'string' || value.length > 512) {
    throw new BadRequestException('dna must be a DNA string');
  }
  try {
    const dna = decodeMonsterDna(value);
    return { dna, encoded: encodeMonsterDna(dna) };
  } catch (error) {
    throw new BadRequestException(
      `Invalid DNA: ${error instanceof Error ? error.message : 'unparseable'}`,
    );
  }
}
