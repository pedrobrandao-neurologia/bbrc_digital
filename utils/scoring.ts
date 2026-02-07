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

// Cache normalized animal set (keyed by reference to avoid re-normalizing)
let cachedAnimalSource: Set<string> | null = null;
let cachedNormalizedAnimals: Set<string> | null = null;
const getNormalizedAnimals = (validAnimals: Set<string>): Set<string> => {
  if (cachedAnimalSource !== validAnimals || !cachedNormalizedAnimals) {
    cachedNormalizedAnimals = new Set<string>();
    for (const animal of validAnimals) {
      cachedNormalizedAnimals.add(normalize(animal));
    }
    cachedAnimalSource = validAnimals;
  }
  return cachedNormalizedAnimals;
};

/**
 * Scores a verbal fluency utterance, supporting multi-word animal names.
 *
 * Strategy: Try to match trigrams first, then bigrams, then unigrams against
 * the animal dictionary. This handles names like "lobo guará", "urso polar",
 * "mico leão dourado", "bicho preguiça", etc.
 *
 * All lookups are accent-insensitive via normalize().
 */
export const scoreFluencyUtterance = (
  transcript: string,
  validAnimals: Set<string>,
  alreadyProduced: string[] = [],
): FluencyScore => {
  const normalizedLookup = getNormalizedAnimals(validAnimals);
  const seen = new Set(alreadyProduced.map(normalize));
  const words = tokenize(transcript);
  const tokens: SpokenToken[] = [];
  const animals: string[] = [];
  const invalid: SpokenToken[] = [];
  const repeats: SpokenToken[] = [];

  const consumed = new Set<number>();

  // Try trigrams first (e.g., "mico leão dourado")
  for (let i = 0; i < words.length - 2; i++) {
    if (consumed.has(i) || consumed.has(i + 1) || consumed.has(i + 2)) continue;
    const trigram = normalize(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    if (normalizedLookup.has(trigram)) {
      const raw = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const base: SpokenToken = { raw, normalized: trigram, timestamp: Date.now(), classification: 'intrusion' };
      if (seen.has(trigram)) {
        repeats.push({ ...base, classification: 'repeat', mappedId: trigram });
      } else {
        seen.add(trigram);
        animals.push(trigram);
        tokens.push({ ...base, classification: 'target', mappedId: trigram });
      }
      consumed.add(i);
      consumed.add(i + 1);
      consumed.add(i + 2);
    }
  }

  // Try bigrams (e.g., "lobo guará", "urso polar")
  for (let i = 0; i < words.length - 1; i++) {
    if (consumed.has(i) || consumed.has(i + 1)) continue;
    const bigram = normalize(`${words[i]} ${words[i + 1]}`);
    if (normalizedLookup.has(bigram)) {
      const raw = `${words[i]} ${words[i + 1]}`;
      const base: SpokenToken = { raw, normalized: bigram, timestamp: Date.now(), classification: 'intrusion' };
      if (seen.has(bigram)) {
        repeats.push({ ...base, classification: 'repeat', mappedId: bigram });
      } else {
        seen.add(bigram);
        animals.push(bigram);
        tokens.push({ ...base, classification: 'target', mappedId: bigram });
      }
      consumed.add(i);
      consumed.add(i + 1);
    }
  }

  // Try unigrams for remaining words
  for (let i = 0; i < words.length; i++) {
    if (consumed.has(i)) continue;
    const norm = normalize(words[i]);
    const raw = words[i];
    const base: SpokenToken = { raw, normalized: norm, timestamp: Date.now(), classification: 'intrusion' };

    if (normalizedLookup.has(norm)) {
      if (seen.has(norm)) {
        repeats.push({ ...base, classification: 'repeat', mappedId: norm });
      } else {
        seen.add(norm);
        animals.push(norm);
        tokens.push({ ...base, classification: 'target', mappedId: norm });
      }
    } else {
      invalid.push(base);
      tokens.push(base);
    }
    consumed.add(i);
  }

  return { tokens, animals, invalid, repeats };
};
