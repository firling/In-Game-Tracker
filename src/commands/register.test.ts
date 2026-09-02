import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRiotId } from './register';

describe('parseRiotId', () => {
  it('parses a standard Riot ID', () => {
    assert.deepEqual(parseRiotId('Faker#KR1'), { gameName: 'Faker', tagLine: 'KR1' });
  });

  it('accepts spaces in the game name', () => {
    assert.deepEqual(parseRiotId('Mon Pseudo#EUW'), { gameName: 'Mon Pseudo', tagLine: 'EUW' });
  });

  it('trims surrounding whitespace', () => {
    assert.deepEqual(parseRiotId('  Faker  #  KR1  '), { gameName: 'Faker', tagLine: 'KR1' });
  });

  it('splits on the last # so the name may contain one', () => {
    assert.deepEqual(parseRiotId('Hash#Tag#EUW'), { gameName: 'Hash#Tag', tagLine: 'EUW' });
  });

  it('rejects malformed input', () => {
    assert.equal(parseRiotId('Faker'), null, 'sans séparateur');
    assert.equal(parseRiotId('#KR1'), null, 'sans pseudo');
    assert.equal(parseRiotId('Faker#'), null, 'sans tag');
    assert.equal(parseRiotId(''), null, 'vide');
    assert.equal(parseRiotId('ab#EUW'), null, 'pseudo trop court');
    assert.equal(parseRiotId('a'.repeat(17) + '#EUW'), null, 'pseudo trop long');
    assert.equal(parseRiotId('Faker#E'), null, 'tag trop court');
    assert.equal(parseRiotId('Faker#TOOLONG'), null, 'tag trop long');
  });
});
