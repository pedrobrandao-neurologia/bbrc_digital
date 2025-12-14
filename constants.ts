import { EducationLevel } from "./types";

export const TARGET_WORDS = [
  "sapato", "balde", "casa", "tartaruga", "pente", "livro", "chave", "colher", "avião", "árvore"
];

export const TARGET_SYNONYMS: Record<string, string[]> = {
  sapato: ["sapatos", "sapatinho", "sapatilha"],
  balde: ["baldes", "baldinho"],
  casa: ["casinha", "lar"],
  tartaruga: ["jabuti", "tartaruguinha"],
  pente: ["pentes", "pente de cabelo"],
  livro: ["livros", "caderneta"],
  chave: ["chaves"],
  colher: ["colheres", "colherzinha"],
  "avião": ["aviao", "avion", "aeroplano"],
  "árvore": ["arvore", "arvorezinha"],
};

export const DISTRACTOR_WORDS = [
  "caminhão", "ferro", "folha", "chaleira", "bicicleta", "banana", "navio", "porco", "casaco", "carro" 
];

export const RECOGNITION_ITEMS = [
  { id: 'sapato', label: 'Sapato', isTarget: true, synonyms: TARGET_SYNONYMS['sapato'] },
  { id: 'balde', label: 'Balde', isTarget: true, synonyms: TARGET_SYNONYMS['balde'] },
  { id: 'casa', label: 'Casa', isTarget: true, synonyms: TARGET_SYNONYMS['casa'] },
  { id: 'tartaruga', label: 'Tartaruga', isTarget: true, synonyms: TARGET_SYNONYMS['tartaruga'] },
  { id: 'pente', label: 'Pente', isTarget: true, synonyms: TARGET_SYNONYMS['pente'] },
  { id: 'livro', label: 'Livro', isTarget: true, synonyms: TARGET_SYNONYMS['livro'] },
  { id: 'chave', label: 'Chave', isTarget: true, synonyms: TARGET_SYNONYMS['chave'] },
  { id: 'colher', label: 'Colher', isTarget: true, synonyms: TARGET_SYNONYMS['colher'] },
  { id: 'avião', label: 'Avião', isTarget: true, synonyms: TARGET_SYNONYMS['avião'] },
  { id: 'árvore', label: 'Árvore', isTarget: true, synonyms: TARGET_SYNONYMS['árvore'] },
  { id: 'caminhão', label: 'Caminhão', isTarget: false, synonyms: ['caminhao', 'caminhonete'] },
  { id: 'ferro', label: 'Ferro de passar', isTarget: false, synonyms: ['ferro'] },
  { id: 'folha', label: 'Folha', isTarget: false },
  { id: 'chaleira', label: 'Chaleira', isTarget: false },
  { id: 'bicicleta', label: 'Bicicleta', isTarget: false, synonyms: ['bike'] },
  { id: 'banana', label: 'Banana', isTarget: false },
  { id: 'navio', label: 'Navio', isTarget: false, synonyms: ['barco'] },
  { id: 'porco', label: 'Porco', isTarget: false, synonyms: ['porquinho'] },
  { id: 'casaco', label: 'Casaco', isTarget: false, synonyms: ['paletó', 'blazer'] },
  { id: 'carro', label: 'Carro', isTarget: false },
];

export const CUTOFF_SCORES = {
  incidentalMemory: 4,
  immediateMemory: 6,
  learning: 6,
  delayedMemory: 5,
  recognition: 7,
};

export const FLUENCY_CUTOFFS = {
  [EducationLevel.ILLITERATE]: 8,
  [EducationLevel.LOW]: 11, // 1-7 years
  [EducationLevel.HIGH]: 12, // >= 8 years
};

export const ANIMAL_LIST = new Set([
  "cachorro", "gato", "cavalo", "vaca", "porco", "ovelha", "bode", "cabra", "galinha", "pato", "ganso", "peru",
  "pombo", "pardal", "canário", "papagaio", "arara", "águia", "falcão", "coruja", "tigre", "leão", "onça",
  "elefante", "rinoceronte", "hipopótamo", "girafa", "zebra", "urso", "canguru", "coala", "macaco", "gorila",
  "chimpanzé", "orangotango", "babuíno", "mandril", "lêmure", "morcego", "tamanduá", "tatu", "capivara", "guaxinim",
  "raposa", "lobo", "lobo-guará", "gato-do-mato", "panda", "panda-vermelho", "golfinho", "baleia", "tubarão", "peixe",
  "polvo", "lula", "caranguejo", "lagosta", "camarão", "tartaruga", "jabuti", "jacaré", "crocodilo", "lagartixa",
  "camaleão", "cobra", "salamandra", "rã", "sapo", "perereca", "formiga", "abelha", "vespa", "borboleta", "mariposa",
  "grilo", "gafanhoto", "louva-a-deus", "besouro", "joaninha", "vagalume", "libélula", "mosca", "mosquito", "pulga",
  "aranha", "escorpião", "carrapato", "centopeia", "minhoca", "lesma", "caracol", "ostra", "mexilhão", "água-viva", "coral",
  "ostra", "mexilhão", "enguia", "arraia", "piranha", "sardinha", "bacalhau", "peixe-boi", "pinguim", "avestruz", "ema",
  "garça", "cisne", "pavão", "tucano", "beija-flor", "andorinha", "sabiá", "pica-pau", "corvo", "gralha", "mico-leão-dourado",
  "bicho-preguiça", "quati", "javali", "ouriço", "esquilo", "lontra", "texugo", "suricato", "lhama", "alpaca", "vicunha"
]);
