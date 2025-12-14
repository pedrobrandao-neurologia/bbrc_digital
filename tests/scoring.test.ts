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
});

describe('scoreRecognitionUtterance', () => {
  it('counts targets and separates distractors', () => {
    const result = scoreRecognitionUtterance('avião chaleira árvore avião');
    expect(result.hits).toEqual(['avião', 'árvore']);
    expect(result.distractorHits.map((d) => d.normalized)).toContain('chaleira');
    expect(result.repeats.length).toBe(1);
  });
});

describe('scoreFluencyUtterance', () => {
  it('handles animal validation with repeats', () => {
    const result = scoreFluencyUtterance('gato cachorro gato pedra', ANIMAL_LIST);
    expect(result.animals).toEqual(['gato', 'cachorro']);
    expect(result.repeats.length).toBe(1);
    expect(result.invalid.map((i) => i.raw)).toContain('pedra');
  });
});
