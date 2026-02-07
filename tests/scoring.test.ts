import { describe, expect, it } from 'vitest';
import { scoreRecallUtterance, scoreRecognitionUtterance, scoreFluencyUtterance } from '../utils/scoring';
import { ANIMAL_LIST } from '../constants';

describe('scoreRecallUtterance', () => {
  it('deduplicates targets and flags intrusions', () => {
    const result = scoreRecallUtterance('sapato casa casa caminhão');
    expect(result.hits).toEqual(['sapato', 'casa']);
    expect(result.repeats.length).toBe(1);
    expect(result.intrusions.map((i) => i.normalized)).toContain('caminhao');
  });

  it('recognizes synonyms and accent variations', () => {
    const result = scoreRecallUtterance('aviao arvore tênis jabuti');
    expect(result.hits).toContain('avião');
    expect(result.hits).toContain('árvore');
    expect(result.hits).toContain('sapato'); // tênis is synonym
    expect(result.hits).toContain('tartaruga'); // jabuti is synonym
  });

  it('tracks already-hit words across calls', () => {
    const result = scoreRecallUtterance('sapato casa', ['sapato']);
    expect(result.hits).toEqual(['casa']);
    expect(result.repeats.length).toBe(1);
  });
});

describe('scoreRecognitionUtterance', () => {
  it('counts targets and separates distractors', () => {
    const result = scoreRecognitionUtterance('avião chaleira árvore avião');
    expect(result.hits).toEqual(['avião', 'árvore']);
    expect(result.distractorHits.map((d) => d.normalized)).toContain('chaleira');
    expect(result.repeats.length).toBe(1);
  });

  it('classifies recognition distractors correctly', () => {
    const result = scoreRecognitionUtterance('bicicleta banana porco carro');
    expect(result.hits.length).toBe(0);
    expect(result.distractorHits.length).toBe(4);
  });
});

describe('scoreFluencyUtterance', () => {
  it('handles animal validation with repeats', () => {
    const result = scoreFluencyUtterance('gato cachorro gato pedra', ANIMAL_LIST);
    expect(result.animals).toEqual(['gato', 'cachorro']);
    expect(result.repeats.length).toBe(1);
    expect(result.invalid.map((i) => i.raw)).toContain('pedra');
  });

  it('matches multi-word animal names (bigrams)', () => {
    const result = scoreFluencyUtterance('lobo guará urso polar gato', ANIMAL_LIST);
    expect(result.animals).toContain('lobo guara');
    expect(result.animals).toContain('urso polar');
    expect(result.animals).toContain('gato');
    expect(result.animals.length).toBe(3);
  });

  it('matches trigram animal names', () => {
    const result = scoreFluencyUtterance('mico leão dourado cachorro', ANIMAL_LIST);
    expect(result.animals).toContain('mico leao dourado');
    expect(result.animals).toContain('cachorro');
    expect(result.animals.length).toBe(2);
  });

  it('prefers longer n-gram matches over shorter ones', () => {
    // "lobo guará" should match as bigram, not as separate "lobo" + invalid "guará"
    const result = scoreFluencyUtterance('lobo guará', ANIMAL_LIST);
    expect(result.animals.length).toBe(1);
    expect(result.animals[0]).toBe('lobo guara');
    expect(result.invalid.length).toBe(0);
  });

  it('handles already-produced animals for deduplication', () => {
    const result = scoreFluencyUtterance('gato leão', ANIMAL_LIST, ['gato']);
    expect(result.animals).toEqual(['leao']);
    expect(result.repeats.length).toBe(1);
  });
});
