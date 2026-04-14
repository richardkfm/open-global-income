import { describe, it, expect } from 'vitest';
import {
  expandPresetToRules,
  populationFactorFromRules,
  applyRulesToRecipients,
} from './targeting.js';
import type { RecipientProfile, TargetGroup, TargetingRules } from './types.js';

// ── expandPresetToRules ───────────────────────────────────────────────────────

describe('expandPresetToRules', () => {
  it('wraps preset in a TargetingRules object', () => {
    const rules = expandPresetToRules('bottom_quintile');
    expect(rules).toEqual({ preset: 'bottom_quintile' });
  });

  it('works for all preset values', () => {
    const presets: TargetGroup[] = ['all', 'bottom_decile', 'bottom_quintile', 'bottom_third', 'bottom_half'];
    for (const p of presets) {
      expect(expandPresetToRules(p)).toEqual({ preset: p });
    }
  });
});

// ── populationFactorFromRules ─────────────────────────────────────────────────

describe('populationFactorFromRules', () => {
  it('returns 1.0 for empty rules (default all)', () => {
    expect(populationFactorFromRules({})).toBe(1.0);
  });

  it('returns 1.0 for preset=all', () => {
    expect(populationFactorFromRules({ preset: 'all' })).toBe(1.0);
  });

  it('returns 0.1 for preset=bottom_decile', () => {
    expect(populationFactorFromRules({ preset: 'bottom_decile' })).toBe(0.1);
  });

  it('returns 0.2 for preset=bottom_quintile', () => {
    expect(populationFactorFromRules({ preset: 'bottom_quintile' })).toBe(0.2);
  });

  it('returns 1/3 for preset=bottom_third', () => {
    expect(populationFactorFromRules({ preset: 'bottom_third' })).toBeCloseTo(1 / 3, 10);
  });

  it('returns 0.5 for preset=bottom_half', () => {
    expect(populationFactorFromRules({ preset: 'bottom_half' })).toBe(0.5);
  });

  it('ignores non-preset fields for simulation factor', () => {
    // Other fields are disbursement-time filters — they do not change the estimate
    const rules: TargetingRules = {
      preset: 'bottom_quintile',
      ageRange: [18, 65],
      maxMonthlyIncomePppUsd: 300,
      identityProviders: ['kyc-provider-a'],
      excludeIfPaidWithinDays: 30,
    };
    expect(populationFactorFromRules(rules)).toBe(0.2);
  });

  it('is consistent with expandPresetToRules', () => {
    const factor = populationFactorFromRules(expandPresetToRules('bottom_decile'));
    expect(factor).toBe(0.1);
  });
});

// ── applyRulesToRecipients ────────────────────────────────────────────────────

function makeRecipient(overrides: Partial<RecipientProfile> = {}): RecipientProfile {
  return {
    id: 'r-' + Math.random().toString(36).slice(2),
    countryCode: 'KE',
    accountHash: null,
    identityProvider: null,
    verifiedAt: null,
    paymentMethod: null,
    routingRef: null,
    status: 'verified',
    pilotId: null,
    apiKeyId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('applyRulesToRecipients — identityProviders filter', () => {
  it('passes all recipients when no identityProviders rule set', () => {
    const recipients = [
      makeRecipient({ identityProvider: 'kyc-a' }),
      makeRecipient({ identityProvider: 'kyc-b' }),
      makeRecipient({ identityProvider: null }),
    ];
    const { eligible, stats } = applyRulesToRecipients(recipients, {});
    expect(eligible.length).toBe(3);
    expect(stats.length).toBe(0);
  });

  it('filters recipients not verified by allowed providers', () => {
    const allowed = makeRecipient({ identityProvider: 'kyc-a' });
    const notAllowed = makeRecipient({ identityProvider: 'kyc-b' });
    const noProvider = makeRecipient({ identityProvider: null });

    const { eligible, stats } = applyRulesToRecipients(
      [allowed, notAllowed, noProvider],
      { identityProviders: ['kyc-a'] },
    );

    expect(eligible.length).toBe(1);
    expect(eligible[0].id).toBe(allowed.id);
    expect(stats).toHaveLength(1);
    expect(stats[0].rule).toBe('identityProviders');
    expect(stats[0].recipientsFiltered).toBe(2);
  });

  it('allows multiple providers', () => {
    const recipients = [
      makeRecipient({ identityProvider: 'kyc-a' }),
      makeRecipient({ identityProvider: 'kyc-b' }),
      makeRecipient({ identityProvider: 'kyc-c' }),
    ];
    const { eligible } = applyRulesToRecipients(recipients, { identityProviders: ['kyc-a', 'kyc-b'] });
    expect(eligible.length).toBe(2);
  });

  it('returns all filtered if no recipients match any allowed provider', () => {
    const recipients = [
      makeRecipient({ identityProvider: 'other' }),
      makeRecipient({ identityProvider: null }),
    ];
    const { eligible, stats } = applyRulesToRecipients(recipients, { identityProviders: ['kyc-a'] });
    expect(eligible.length).toBe(0);
    expect(stats[0].recipientsFiltered).toBe(2);
  });
});

describe('applyRulesToRecipients — non-evaluable rules produce notes', () => {
  it('ageRange produces a stat with notes, no filtering', () => {
    const recipients = [makeRecipient(), makeRecipient()];
    const { eligible, stats } = applyRulesToRecipients(recipients, { ageRange: [18, 65] });
    expect(eligible.length).toBe(2);
    const stat = stats.find((s) => s.rule === 'ageRange');
    expect(stat).toBeDefined();
    expect(stat!.recipientsFiltered).toBe(0);
    expect(stat!.notes).toBeTruthy();
  });

  it('urbanRural produces a stat with notes, no filtering', () => {
    const recipients = [makeRecipient()];
    const { eligible, stats } = applyRulesToRecipients(recipients, { urbanRural: 'rural' });
    expect(eligible.length).toBe(1);
    const stat = stats.find((s) => s.rule === 'urbanRural');
    expect(stat).toBeDefined();
    expect(stat!.recipientsFiltered).toBe(0);
  });

  it('maxMonthlyIncomePppUsd produces a stat with notes, no filtering', () => {
    const recipients = [makeRecipient()];
    const { eligible, stats } = applyRulesToRecipients(recipients, { maxMonthlyIncomePppUsd: 300 });
    expect(eligible.length).toBe(1);
    const stat = stats.find((s) => s.rule === 'maxMonthlyIncomePppUsd');
    expect(stat!.recipientsFiltered).toBe(0);
    expect(stat!.notes).toBeTruthy();
  });

  it('excludeIfPaidWithinDays produces a stat with notes, no filtering', () => {
    const recipients = [makeRecipient()];
    const { eligible, stats } = applyRulesToRecipients(recipients, { excludeIfPaidWithinDays: 30 });
    expect(eligible.length).toBe(1);
    const stat = stats.find((s) => s.rule === 'excludeIfPaidWithinDays');
    expect(stat!.recipientsFiltered).toBe(0);
    expect(stat!.notes).toBeTruthy();
  });

  it('regionIds produces a stat with notes, no filtering', () => {
    const recipients = [makeRecipient()];
    const { eligible, stats } = applyRulesToRecipients(recipients, { regionIds: ['KE-NAI', 'KE-MOM'] });
    expect(eligible.length).toBe(1);
    const stat = stats.find((s) => s.rule === 'regionIds');
    expect(stat!.recipientsFiltered).toBe(0);
    expect(stat!.notes).toBeTruthy();
  });

  it('non-all preset produces an informational stat', () => {
    const recipients = [makeRecipient()];
    const { eligible, stats } = applyRulesToRecipients(recipients, { preset: 'bottom_quintile' });
    expect(eligible.length).toBe(1);
    const stat = stats.find((s) => s.rule === 'preset');
    expect(stat).toBeDefined();
    expect(stat!.recipientsFiltered).toBe(0);
  });

  it('preset=all does not produce a stat', () => {
    const recipients = [makeRecipient()];
    const { stats } = applyRulesToRecipients(recipients, { preset: 'all' });
    expect(stats.find((s) => s.rule === 'preset')).toBeUndefined();
  });
});

describe('applyRulesToRecipients — combined rules', () => {
  it('applies identityProviders filter and records all other rule stats', () => {
    const eligible1 = makeRecipient({ identityProvider: 'kyc-a' });
    const filtered1 = makeRecipient({ identityProvider: 'kyc-b' });

    const { eligible, stats } = applyRulesToRecipients([eligible1, filtered1], {
      preset: 'bottom_quintile',
      identityProviders: ['kyc-a'],
      ageRange: [18, 65],
      maxMonthlyIncomePppUsd: 500,
      excludeIfPaidWithinDays: 30,
      regionIds: ['KE-NAI'],
    });

    expect(eligible.length).toBe(1);
    expect(eligible[0].id).toBe(eligible1.id);

    const ruleNames = stats.map((s) => s.rule);
    expect(ruleNames).toContain('identityProviders');
    expect(ruleNames).toContain('ageRange');
    expect(ruleNames).toContain('maxMonthlyIncomePppUsd');
    expect(ruleNames).toContain('excludeIfPaidWithinDays');
    expect(ruleNames).toContain('regionIds');
    expect(ruleNames).toContain('preset');
  });

  it('returns empty eligible list and correct filter count for empty recipient list', () => {
    const { eligible, stats } = applyRulesToRecipients([], { identityProviders: ['kyc-a'] });
    expect(eligible.length).toBe(0);
    expect(stats[0].recipientsFiltered).toBe(0);
  });
});
