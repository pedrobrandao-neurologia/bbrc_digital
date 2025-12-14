import { EducationLevel } from "./types";

export const TARGET_WORDS = [
  "sapato", "casa", "pente", "chave", "avião",
  "balde", "tartaruga", "livro", "colher", "árvore"
];

// Items for the recognition phase (Targets + Distractors)
export const RECOGNITION_ITEMS = [
  { id: 'sapato', label: 'Sapato', isTarget: true },
  { id: 'gato', label: 'Gato', isTarget: false },
  { id: 'casa', label: 'Casa', isTarget: true },
  { id: 'caneta', label: 'Caneta', isTarget: false },
  { id: 'pente', label: 'Pente', isTarget: true },
  { id: 'escova', label: 'Escova', isTarget: false },
  { id: 'chave', label: 'Chave', isTarget: true },
  { id: 'moeda', label: 'Moeda', isTarget: false },
  { id: 'avião', label: 'Avião', isTarget: true },
  { id: 'carro', label: 'Carro', isTarget: false },
  { id: 'balde', label: 'Balde', isTarget: true },
  { id: 'bacia', label: 'Bacia', isTarget: false },
  { id: 'tartaruga', label: 'Tartaruga', isTarget: true },
  { id: 'jacare', label: 'Jacaré', isTarget: false },
  { id: 'livro', label: 'Livro', isTarget: true },
  { id: 'revista', label: 'Revista', isTarget: false },
  { id: 'colher', label: 'Colher', isTarget: true },
  { id: 'garfo', label: 'Garfo', isTarget: false },
  { id: 'arvore', label: 'Árvore', isTarget: true },
  { id: 'flor', label: 'Flor', isTarget: false },
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

// Simplified list for demonstration, referencing the massive list provided by user
export const ANIMAL_LIST = new Set([
  "cachorro", "gato", "cavalo", "vaca", "porco", "ovelha", "bode", "cabra", "galinha", "pato", "ganso", "peru",
  "pombo", "pardal", "canário", "papagaio", "arara", "águia", "falcão", "coruja", "tigre", "leão", "onça",
  "elefante", "rinoceronte", "hipopótamo", "girafa", "zebra", "urso", "canguru", "coala", "macaco", "gorila",
  "chimpanzé", "orangotango", "babuíno", "mandril", "lêmure", "morcego", "tamanduá", "tatu", "capivara", "guaxinim",
  "raposa", "lobo", "lobo-guará", "gato-do-mato", "panda", "panda-vermelho", "golfinho", "baleia", "tubarão", "peixe",
  "polvo", "lula", "caranguejo", "lagosta", "camarão", "tartaruga", "jabuti", "jacaré", "crocodilo", "lagartixa",
  "camaleão", "cobra", "salamandra", "rã", "sapo", "perereca", "formiga", "abelha", "vespa", "borboleta", "mariposa",
  "grilo", "gafanhoto", "louva-a-deus", "besouro", "joaninha", "vagalume", "libélula", "mosca", "mosquito", "pulga", 
  "aranha", "escorpião", "carrapato", "centopeia", "minhoca", "lesma", "caracol", "ostra", "mexilhão", "lula", "polvo",
  "água-viva", "coral", "esponja", "ouriço-do-mar", "estrela-do-mar", "arqueiro", "arraia", "enguia", "lambari", "piranha",
  "traíra", "cascudo", "salmão", "atum", "sardinha", "bacalhau", "linguado", "baiacu", "cavalo-marinho", "peixe-boi",
  "pinguim", "avestruz", "ema", "cegonha", "garça", "cisne", "pavão", "arara-azul", "tucano", "calopsita", "beija-flor",
  "andorinha", "bem-te-vi", "sabiá", "sanhaço", "pica-pau", "corvo", "gralha", "mico-leão-dourado", "bicho-preguiça", 
  "tamanduá-bandeira", "quati", "ratazana", "hamster", "porquinho-da-índia", "chinchila", "ouriço", "furão", "esquilo",
  "castor", "lontra", "doninha", "texugo", "marmota", "suricato", "hipopótamo-pigmeu", "ocapi", "dumbo", "peixe-boi",
  "numbat", "diabo-da-tasmânia", "ornitorrinco", "equidna", "quokka", "tigre-de-bengala", "tigre-siberiano", "tigre-branco",
  "tigre-de-sumatra", "leão-branco", "leão-marinho", "leopardo", "leopardo-das-neves", "guepardo", "pantera-negra", "jaguar",
  "lince", "gato-selvagem", "hiena", "foca", "morsa", "cobra-rei", "naja", "píton", "anaconda", "sucuri", "urutu", 
  "jararaca", "cascavel", "mamba-negra", "iguana", "salamandra-gigante", "rã-de-unhas-africana", "rã-golias", "rã-touro",
  "sapo-cururu", "peixe-palhaço", "peixe-espada", "peixe-lua", "rêmora", "barracuda", "caranguejo-eremita", "caranguejo-ferradura",
  "escorpião-imperador", "aranha-golias", "aranha-camelo", "aranha-pavão", "aranha-de-darwin", "louva-a-deus-orquídea",
  "bicho-pau", "borboleta-coruja", "borboleta-folha", "borboleta-zebra", "borboleta-88", "borboleta-vice-rei",
  "abelha-carpinteira", "abelha-sem-ferrão", "formiga-cortadeira", "formiga-de-fogo", "formiga-bala", "cupim", "bicho-da-seda",
  "minhoca-da-austrália", "lesma-do-mar", "caracol-africano", "caracol-cone", "lula-vampira", "lula-gigante", "água-viva-caixa",
  "água-viva-caravela-portuguesa", "coral-cérebro", "esponja-de-barril", "esponja-tubo-de-órgão", "dragão-marinho-folhado",
  "peixe-pedra", "peixe-leão", "peixe-dourado", "kinguio", "pirarucu", "jaraqui", "bodó", "candiru", "arraia-jamanta",
  "arraia-manta", "tubarão-branco", "tubarão-martelo", "tubarão-baleia", "tubarão-enfermeira", "enguia-elétrica",
  "poraquê", "piramboia", "raia-manta", "boto-cor-de-rosa", "boto-cinza", "orca", "cachalote", "jubarte",
  "baleia-azul", "baleia-fin", "baleia-sei", "baleia-de-bryde", "baleia-franca", "baleia-minke", "narvale",
  "beluga", "toninha", "cervo", "alce", "veado", "gazela", "impala", "antílope", "búfalo", "bisão", 
  "boi-almiscarado", "cabra-montês", "muflão", "camurça", "lhama", "alpaca", "vicunha", "guanaco", "anta", 
  "queixada", "cateto", "javali", "pecari", "porco-do-mato", "porco-espinho", "cutia", "paca", "ratão-do-banhado",
  "nútria", "ratão-do-mato", "ouriço-cacheiro", "castor", "rato-do-campo", "rato-da-cidade", "camundongo", "gerbo",
  "cangambá", "jupará", "cuíca", "gambá", "sagui", "macaco-prego", "bugio", "macaco-narigudo", "macaco-barrigudo",
  "macaco-de-cheiro", "macaco-aranha", "titi", "sauim", "uacari", "parauacu", "cuxiú", "zogue-zogue", "guigó",
  "preguiça-de-coleira", "preguiça-comum", "preguiça-anã", "preguiça-real", "tamanduá-colete", "papa-formigas",
  "pangolim", "leão-baio", "puma", "jaguatirica", "jacaré-do-pantanal", "jacaré-de-papo-amarelo", "jacaré-coroa",
  "jacaré-anão", "gavial", "dragão-de-komodo", "lagarto-monitor", "geco", "camaleão-pantera", "cobra-cipó",
  "cobra-de-vidro", "cobra-cega", "coral-verdadeira", "falsa-coral", "surucucu-pico-de-jaca", "jararacuçu",
  "corre-campo", "caninana", "muçurana", "cobra-papagaio", "jiboia-constritora", "cobra-rateira", "boipeva",
  "surucucu-tapete", "píton-reticulada", "píton-birmesa", "píton-verde", "píton-bola", "cobra-rei-da-califórnia",
  "naja-cuspideira", "naja-indiana", "naja-egípcia", "naja-preta", "mamba-verde", "cobra-marrom", "cobra-de-capelo",
  "taipan", "cobra-de-água", "serpente-marinha", "tartaruga-de-pente", "tartaruga-verde", "tartaruga-de-couro",
  "tartaruga-oliva", "tartaruga-cabeçuda", "jabuti-piranga", "jabuti-tinga", "cágado-de-barbicha", "cágado-pescoço-de-cobra",
  "tigre-d'água"
]);