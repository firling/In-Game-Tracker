import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { absoluteLp, formatDivision, formatLpChange, lpProgressBar, rankDelta, tierColor } from './rank';

describe('absoluteLp', () => {
  it('orders divisions inside a tier', () => {
    assert.ok(absoluteLp('GOLD', 'I', 0) > absoluteLp('GOLD', 'II', 99));
    assert.ok(absoluteLp('GOLD', 'IV', 0) < absoluteLp('GOLD', 'III', 0));
  });

  it('orders tiers', () => {
    assert.ok(absoluteLp('PLATINUM', 'IV', 0) > absoluteLp('GOLD', 'I', 99));
    assert.ok(absoluteLp('EMERALD', 'IV', 0) > absoluteLp('PLATINUM', 'I', 99));
  });

  it('places every apex tier on the same floor plus raw LP', () => {
    assert.equal(absoluteLp('MASTER', 'I', 500), absoluteLp('GRANDMASTER', 'I', 500));
    assert.equal(absoluteLp('CHALLENGER', 'I', 1200), absoluteLp('MASTER', 'I', 1200));
    assert.ok(absoluteLp('MASTER', 'I', 0) > absoluteLp('DIAMOND', 'I', 99));
  });

  it('treats an unknown tier as the bottom of the ladder', () => {
    assert.equal(absoluteLp('', '', 0), 0);
  });
});

describe('rankDelta', () => {
  it('computes a plain LP gain inside a division', () => {
    const delta = rankDelta(
      { tier: 'GOLD', rank: 'II', leaguePoints: 40 },
      { tier: 'GOLD', rank: 'II', leaguePoints: 62 }
    );
    assert.equal(delta.lp, 22);
    assert.equal(delta.divisionChanged, false);
    assert.equal(delta.promoted, false);
  });

  it('computes a loss inside a division', () => {
    const delta = rankDelta(
      { tier: 'GOLD', rank: 'II', leaguePoints: 40 },
      { tier: 'GOLD', rank: 'II', leaguePoints: 22 }
    );
    assert.equal(delta.lp, -18);
  });

  it('handles a promotion across divisions', () => {
    // 88 LP + 24 LP win = promoted to the next division at 12 LP.
    const delta = rankDelta(
      { tier: 'GOLD', rank: 'II', leaguePoints: 88 },
      { tier: 'GOLD', rank: 'I', leaguePoints: 12 }
    );
    assert.equal(delta.lp, 24);
    assert.equal(delta.promoted, true);
    assert.equal(delta.demoted, false);
  });

  it('handles a promotion across tiers', () => {
    const delta = rankDelta(
      { tier: 'GOLD', rank: 'I', leaguePoints: 92 },
      { tier: 'PLATINUM', rank: 'IV', leaguePoints: 10 }
    );
    assert.equal(delta.lp, 18);
    assert.equal(delta.promoted, true);
  });

  it('handles a demotion across tiers', () => {
    const delta = rankDelta(
      { tier: 'PLATINUM', rank: 'IV', leaguePoints: 0 },
      { tier: 'GOLD', rank: 'I', leaguePoints: 75 }
    );
    assert.equal(delta.lp, -25);
    assert.equal(delta.demoted, true);
    assert.equal(delta.promoted, false);
  });

  it('diffs apex LP without inventing a division change', () => {
    const delta = rankDelta(
      { tier: 'MASTER', rank: 'I', leaguePoints: 120 },
      { tier: 'MASTER', rank: 'I', leaguePoints: 145 }
    );
    assert.equal(delta.lp, 25);
    assert.equal(delta.divisionChanged, false);
  });

  it('reports the Master to Grandmaster jump as a promotion', () => {
    const delta = rankDelta(
      { tier: 'MASTER', rank: 'I', leaguePoints: 480 },
      { tier: 'GRANDMASTER', rank: 'I', leaguePoints: 502 }
    );
    assert.equal(delta.lp, 22);
    assert.equal(delta.divisionChanged, true);
  });

  it('reports the Diamond to Master promotion', () => {
    const delta = rankDelta(
      { tier: 'DIAMOND', rank: 'I', leaguePoints: 95 },
      { tier: 'MASTER', rank: 'I', leaguePoints: 8 }
    );
    assert.equal(delta.lp, 13);
    assert.equal(delta.promoted, true);
  });
});

describe('formatting', () => {
  it('drops the division for apex tiers', () => {
    assert.equal(formatDivision('MASTER', 'I'), 'Maître');
    assert.equal(formatDivision('DIAMOND', 'II'), 'Diamant II');
  });

  it('signs LP changes', () => {
    assert.equal(formatLpChange(18), '+18 LP');
    assert.equal(formatLpChange(-18), '−18 LP');
    assert.equal(formatLpChange(0), '±0 LP');
  });

  it('renders a progress bar only below Master', () => {
    assert.equal(lpProgressBar({ tier: 'GOLD', rank: 'II', leaguePoints: 50 }, 10), '▰▰▰▰▰▱▱▱▱▱');
    assert.equal(lpProgressBar({ tier: 'GOLD', rank: 'II', leaguePoints: 0 }, 10), '▱▱▱▱▱▱▱▱▱▱');
    assert.equal(lpProgressBar({ tier: 'MASTER', rank: 'I', leaguePoints: 500 }), '');
  });

  it('clamps the bar for LP above a division cap', () => {
    assert.equal(lpProgressBar({ tier: 'GOLD', rank: 'I', leaguePoints: 140 }, 10), '▰▰▰▰▰▰▰▰▰▰');
  });

  it('gives every tier a distinct colour', () => {
    const colors = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND'].map(tierColor);
    assert.equal(new Set(colors).size, colors.length);
  });
});
