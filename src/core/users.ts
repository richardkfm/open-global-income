import { randomUUID } from 'node:crypto';
import type { User, CountryCode } from './types.js';

/**
 * Simple in-memory user store.
 * Phase 3 only — will be replaced with a real persistence layer later.
 */
const store = new Map<string, User>();

export function createUser(countryCode: CountryCode): User {
  const user: User = {
    id: randomUUID(),
    countryCode: countryCode.toUpperCase(),
    createdAt: new Date().toISOString(),
  };
  store.set(user.id, user);
  return user;
}

export function getUserById(id: string): User | undefined {
  return store.get(id);
}

/** Reset store — for testing only */
export function clearUsers(): void {
  store.clear();
}
