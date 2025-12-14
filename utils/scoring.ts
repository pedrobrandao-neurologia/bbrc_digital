import { TARGET_WORDS, TARGET_SYNONYMS, DISTRACTOR_WORDS, RECOGNITION_ITEMS } from '../constants';
import { SpokenToken } from '../types';

export const normalize = (text: string) => text
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const allTargetForms = new Map<string, { id: string; canonical: string }>();
TARGET_WORDS.forEach((target) => {
  const canonical = normalize(target);
  allTargetForms.set(canonical, { id: target, canonical });
  const synonyms = TARGET_SYNONYMS[target] || [];
  synonyms.forEach((syn) => allTargetForms.set(normalize(syn), { id: target, canonical }));
});

const distractorForms = new Set<string>();
DISTRACTOR_WORDS.forEach((d) => distractorForms.add(normalize(d)));

export const recognitionVocabulary = (() => {
  const map = new Map<string, { id: string; isTarget: boolean }>();
  RECOGNITION_ITEMS.forEach((item) => {
    const key = normalize(item.id);
    map.set(key, { id: item.id, isTarget: item.isTarget });
    if (item.synonyms) {
      item.synonyms.forEach((syn) => map.set(normalize(syn), { id: item.id, isTarget: item.isTarget }));
    }
  });
  return map;
})();

const tokenize = (transcript: string) => transcript
  .split(/[\s,.;!?]+/)
  .map((w) => w.trim())
  .filter(Boolean);

const classifyToken = (
  token: string,
  seenTargets: Set<string>,
  allowDistractors = false,
): SpokenToken => {
  const normalized = normalize(token);
  const base: SpokenToken = {
    raw: token,
    normalized,
    timestamp: Date.now(),
    classification: 'intrusion',
  };

  const target = allTargetForms.get(normalized);
  if (target) {
    if (seenTargets.has(target.canonical)) {
      return { ...base, classification: 'repeat', mappedId: target.id };
    }
    seenTargets.add(target.canonical);
    return { ...base, classification: 'target', mappedId: target.id };
  }

  if (allowDistractors) {
    const vocabHit = recognitionVocabulary.get(normalized);
    if (vocabHit) {
      return { ...base, classification: vocabHit.isTarget ? 'target' : 'distractor', mappedId: vocabHit.id };
    }
    if (distractorForms.has(normalized)) {
      return { ...base, classification: 'distractor', mappedId: normalized };
    }
  }

  if (distractorForms.has(normalized)) {
    return { ...base, classification: 'intrusion', mappedId: normalized };
  }

  return base;
};

export interface RecallScore {
  tokens: SpokenToken[];
  hits: string[];
  intrusions: SpokenToken[];
  repeats: SpokenToken[];
}

export const scoreRecallUtterance = (
  transcript: string,
  alreadyHit: string[] = [],
): RecallScore => {
  const seen = new Set(alreadyHit.map(normalize));
  const tokens = tokenize(transcript).map((token) => classifyToken(token, seen));

  const hits = tokens.filter((t) => t.classification === 'target').map((t) => t.mappedId!)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  const intrusions = tokens.filter((t) => t.classification === 'intrusion');
  const repeats = tokens.filter((t) => t.classification === 'repeat');

  return {
    tokens,
    hits,
    intrusions,
    repeats,
  };
};

export interface RecognitionScore {
  tokens: SpokenToken[];
  hits: string[];
  distractorHits: SpokenToken[];
  intrusions: SpokenToken[];
  repeats: SpokenToken[];
}

export const scoreRecognitionUtterance = (
  transcript: string,
  alreadyHit: string[] = [],
): RecognitionScore => {
  const seen = new Set(alreadyHit.map(normalize));
  const tokens = tokenize(transcript).map((token) => classifyToken(token, seen, true));

  const hits = tokens.filter((t) => t.classification === 'target').map((t) => t.mappedId!)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  const distractorHits = tokens.filter((t) => t.classification === 'distractor');
  const intrusions = tokens.filter((t) => t.classification === 'intrusion');
  const repeats = tokens.filter((t) => t.classification === 'repeat');

  return {
    tokens,
    hits,
    distractorHits,
    intrusions,
    repeats,
  };
};

export interface FluencyScore {
  tokens: SpokenToken[];
  animals: string[];
  invalid: SpokenToken[];
  repeats: SpokenToken[];
}

export const scoreFluencyUtterance = (
  transcript: string,
  validAnimals: Set<string>,
  alreadyProduced: string[] = [],
): FluencyScore => {
  const seen = new Set(alreadyProduced.map(normalize));
  const tokens = tokenize(transcript).map((raw) => {
    const normalized = normalize(raw);
    const base: SpokenToken = {
      raw,
      normalized,
      timestamp: Date.now(),
      classification: 'intrusion',
    };
    if (validAnimals.has(normalized)) {
      if (seen.has(normalized)) {
        return { ...base, classification: 'repeat', mappedId: normalized };
      }
      seen.add(normalized);
      return { ...base, classification: 'target', mappedId: normalized };
    }
    return base;
  });

  const animals = tokens.filter((t) => t.classification === 'target').map((t) => t.mappedId!)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  const invalid = tokens.filter((t) => t.classification === 'intrusion');
  const repeats = tokens.filter((t) => t.classification === 'repeat');

  return { tokens, animals, invalid, repeats };
};

