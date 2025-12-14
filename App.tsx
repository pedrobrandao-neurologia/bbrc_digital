import React, { useState, useReducer, useEffect, useCallback } from 'react';
import { TestStage, INITIAL_STATE, TestState, EducationLevel, BBRCScores, INITIAL_SCORES, Patient, EnvironmentContext } from './types';
import { TARGET_WORDS, ANIMAL_LIST, FLUENCY_CUTOFFS, RECOGNITION_ITEMS, CUTOFF_SCORES } from './constants';
import VoiceRecorder from './components/VoiceRecorder';
import ClockCanvas from './components/ClockCanvas';
import { analyzeClockDrawing } from './geminiService';
import { getPatients, createPatient, addTestResult, getPatientById } from './utils/storage';

// Helper type to exclude 'date' and object keys
type NumericScoreKey = Exclude<keyof BBRCScores, 'date' | 'environment'>;

const normalizeText = (text: string) => {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

// --- TTS Helper ---
const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop previous
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.0; 
        window.speechSynthesis.speak(utterance);
    }
};

// --- Reducer ---
type Action = 
  | { type: 'SET_VIEW'; payload: TestStage }
  | { type: 'SET_CURRENT_PATIENT'; payload: string }
  | { type: 'UPDATE_TEMP_PATIENT'; payload: Partial<Patient> }
  | { type: 'START_TEST_SETUP'; payload: string } 
  | { type: 'START_ACTUAL_TEST'; payload: EnvironmentContext }
  | { type: 'FINISH_TEST'; payload: { interrupted: boolean } }
  | { type: 'UPDATE_SCORE'; payload: { key: keyof BBRCScores; value: number } }
  | { type: 'PROCESS_SPEECH'; payload: string }
  | { type: 'ADD_ANIMAL'; payload: string }
  | { type: 'SET_CLOCK_IMAGE'; payload: string }
  | { type: 'START_DELAY_TIMER' }
  | { type: 'RESET_TEST_STATE' }
  | { type: 'TOGGLE_CONTRAST' }
  | { type: 'SET_FONT_SIZE'; payload: number };

function reducer(state: TestState, action: Action): TestState {
  switch (action.type) {
    case 'SET_VIEW':
      return { 
        ...state, 
        stage: action.payload,
        currentStageFoundWords: [], 
        verbalFluencyList: [] 
      };
    case 'SET_CURRENT_PATIENT':
      return { ...state, currentPatientId: action.payload };
    case 'UPDATE_TEMP_PATIENT':
      return { ...state, tempPatientData: { ...state.tempPatientData, ...action.payload } };
    case 'START_TEST_SETUP':
      return { 
        ...state, 
        stage: TestStage.PRE_TEST_CHECK,
        currentPatientId: action.payload,
        scores: { ...INITIAL_SCORES, date: new Date().toISOString() },
        verbalFluencyList: [],
        currentStageFoundWords: [],
        clockImageBase64: null
      };
    case 'START_ACTUAL_TEST':
        return {
            ...state,
            stage: TestStage.NAMING,
            scores: { ...state.scores, environment: action.payload }
        };
    case 'FINISH_TEST':
         const updatedEnv = state.scores.environment ? { ...state.scores.environment, hadInterruptions: action.payload.interrupted } : undefined;
         return {
             ...state,
             stage: TestStage.RESULTS,
             scores: { ...state.scores, environment: updatedEnv }
         };
    case 'RESET_TEST_STATE':
        return {
            ...state,
            scores: { ...INITIAL_SCORES, date: new Date().toISOString() },
            verbalFluencyList: [],
            currentStageFoundWords: [],
            clockImageBase64: null
        };
    case 'UPDATE_SCORE':
      // @ts-ignore
      return { ...state, scores: { ...state.scores, [action.payload.key]: action.payload.value } };
    
    // CENTRALIZED SPEECH LOGIC
    case 'PROCESS_SPEECH': {
      const rawText = action.payload;
      const normalized = normalizeText(rawText);
      const words = normalized.split(/[\s,.]+/).filter(w => w.length > 1);
      
      let newState = { ...state };
      
      // Logic for Naming & Memory Phases
      const isMemoryPhase = [
          TestStage.NAMING, 
          TestStage.INCIDENTAL_MEMORY, 
          TestStage.IMMEDIATE_MEMORY, 
          TestStage.LEARNING, 
          TestStage.DELAYED_MEMORY
      ].includes(state.stage);

      if (isMemoryPhase) {
          let foundAny = false;
          words.forEach(w => {
               TARGET_WORDS.forEach(target => {
                   const tNorm = normalizeText(target);
                   // Fuzzy match: exact, or plural s/es
                   if ((w === tNorm || w === tNorm + 's' || w === tNorm + 'es') && !newState.currentStageFoundWords.includes(target)) {
                       newState.currentStageFoundWords = [...newState.currentStageFoundWords, target];
                       foundAny = true;
                   }
               });
          });

          if (foundAny) {
              // Update score
              let scoreKey: NumericScoreKey | null = null;
              if (state.stage === TestStage.NAMING) scoreKey = 'naming';
              else if (state.stage === TestStage.INCIDENTAL_MEMORY) scoreKey = 'incidentalMemory';
              else if (state.stage === TestStage.IMMEDIATE_MEMORY) scoreKey = 'immediateMemory';
              else if (state.stage === TestStage.LEARNING) scoreKey = 'learning';
              else if (state.stage === TestStage.DELAYED_MEMORY) scoreKey = 'delayedMemory';

              if (scoreKey) {
                  // @ts-ignore
                  newState.scores = { ...newState.scores, [scoreKey]: newState.currentStageFoundWords.length };
              }
          }
      }

      // Logic for Verbal Fluency
      if (state.stage === TestStage.VERBAL_FLUENCY) {
          words.forEach(w => {
              if (ANIMAL_LIST.has(w) && !newState.verbalFluencyList.includes(w)) {
                  newState.verbalFluencyList = [...newState.verbalFluencyList, w];
                  newState.scores = { ...newState.scores, verbalFluency: newState.verbalFluencyList.length };
              }
          });
      }

      return newState;
    }

    case 'SET_CLOCK_IMAGE':
      return { ...state, clockImageBase64: action.payload };
    case 'START_DELAY_TIMER':
      return { ...state, timeStartedDelayed: Date.now() };
    case 'TOGGLE_CONTRAST':
        return { ...state, highContrast: !state.highContrast };
    case 'SET_FONT_SIZE':
        return { ...state, fontSizeMultiplier: action.payload };
    default:
      return state;
  }
}

// --- ACCESSIBILITY COMPONENTS ---

const AccessibilityControls: React.FC<{
    dispatch: React.Dispatch<Action>;
    currentMultiplier: number;
    highContrast: boolean;
}> = ({ dispatch, currentMultiplier, highContrast }) => {
    return (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 bg-white/90 p-2 rounded-xl shadow-lg border border-slate-200 backdrop-blur-sm">
            <button 
                onClick={() => dispatch({ type: 'SET_FONT_SIZE', payload: Math.min(1.5, currentMultiplier + 0.1) })}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
                aria-label="Aumentar fonte"
            >
                A+
            </button>
            <button 
                onClick={() => dispatch({ type: 'SET_FONT_SIZE', payload: Math.max(1.0, currentMultiplier - 0.1) })}
                className="w-10 h-10 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold"
                aria-label="Diminuir fonte"
            >
                A-
            </button>
            <button 
                onClick={() => dispatch({ type: 'TOGGLE_CONTRAST' })}
                className={`w-10 h-10 flex items-center justify-center rounded-lg font-bold transition-colors ${highContrast ? 'bg-black text-white' : 'bg-slate-100 text-slate-800'}`}
                aria-label="Alto contraste"
            >
                🌗
            </button>
        </div>
    );
};

const ProgressBar: React.FC<{ stage: TestStage }> = ({ stage }) => {
    const stagesOrder = [
        TestStage.NAMING, TestStage.INCIDENTAL_MEMORY, TestStage.IMMEDIATE_MEMORY, TestStage.LEARNING,
        TestStage.VERBAL_FLUENCY, TestStage.CLOCK_DRAWING, TestStage.DELAYED_MEMORY, TestStage.RECOGNITION
    ];
    
    const currentIndex = stagesOrder.indexOf(stage);
    if (currentIndex === -1) return null;

    const progress = ((currentIndex + 1) / stagesOrder.length) * 100;

    return (
        <div className="w-full bg-slate-200 h-2 fixed top-0 left-0 z-30" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div 
                className="bg-medical-500 h-2 transition-all duration-500" 
                style={{ width: `${progress}%` }}
            ></div>
        </div>
    );
};

// --- PHASES ---

const PreTestCheck: React.FC<{ 
    dispatch: React.Dispatch<Action>; 
    onEnableMic: () => void;
    liveTranscript: string;
}> = ({ dispatch, onEnableMic, liveTranscript }) => {
    const [isQuiet, setIsQuiet] = useState<boolean | null>(null);
    const [micVerified, setMicVerified] = useState(false);

    // Watch global transcript for verification
    useEffect(() => {
        if (liveTranscript.length > 0 && !micVerified) {
            setMicVerified(true);
        }
    }, [liveTranscript, micVerified]);

    const start = () => {
        if (isQuiet === null || !micVerified) return;
        
        const envContext: EnvironmentContext = {
            deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            startTime: new Date().toISOString(),
            isQuietEnvironment: isQuiet,
            hadInterruptions: false 
        };
        dispatch({ type: 'START_ACTUAL_TEST', payload: envContext });
    };

    return (
        <div className="max-w-xl mx-auto p-6 bg-white rounded-3xl shadow-xl mt-10 text-center animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 text-medical-900">Verificação Inicial</h2>
            
            <div className="space-y-8">
                {/* 1. Mic Test (Mandatory) */}
                <div className={`p-6 rounded-2xl border-2 transition-colors ${micVerified ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <h3 className="text-lg font-bold text-slate-800 mb-4">1. Teste de Microfone (Obrigatório)</h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Clique em "Ativar Microfone" e diga "Olá" para confirmar o funcionamento.
                    </p>
                    
                    {!micVerified && (
                        <button 
                            onClick={onEnableMic}
                            className="bg-medical-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-medical-500 transition-colors mb-4"
                        >
                            🎤 Ativar Microfone
                        </button>
                    )}

                    {liveTranscript && <p className="text-slate-700 italic mb-2">Ouvido: "{liveTranscript}"</p>}

                    {micVerified ? (
                        <div className="text-green-600 font-bold flex items-center justify-center gap-2">
                             ✅ Microfone funcionando!
                        </div>
                    ) : (
                        <div className="text-red-500 text-sm font-semibold">
                            ⚠️ Aguardando som...
                        </div>
                    )}
                </div>

                {/* 2. Environment Check */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">2. Ambiente</h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Você está em um local silencioso?
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => setIsQuiet(true)} className={`px-4 py-2 rounded-xl font-bold transition-all ${isQuiet === true ? 'bg-medical-600 text-white ring-2 ring-medical-200' : 'bg-white border border-slate-200 text-slate-600'}`}>Sim</button>
                        <button onClick={() => setIsQuiet(false)} className={`px-4 py-2 rounded-xl font-bold transition-all ${isQuiet === false ? 'bg-slate-600 text-white ring-2 ring-slate-200' : 'bg-white border border-slate-200 text-slate-600'}`}>Não</button>
                    </div>
                </div>

                <button 
                    onClick={start}
                    disabled={isQuiet === null || !micVerified}
                    className="w-full bg-green-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-xl shadow-lg hover:bg-green-500 transition-all transform hover:scale-[1.02]"
                >
                    {!micVerified ? "Teste o microfone primeiro" : "Começar o Teste"}
                </button>
            </div>
        </div>
    );
};

const MemoryPhase: React.FC<{
  title: string;
  instruction: string;
  scoreKey: NumericScoreKey;
  scoreValue: number;
  foundWords: string[];
  nextStage: TestStage;
  stage: TestStage;
  dispatch: React.Dispatch<Action>;
  highContrast: boolean;
  setMicActive: (active: boolean) => void;
  liveTranscript: string;
}> = ({ title, instruction, foundWords, nextStage, stage, dispatch, highContrast, setMicActive, liveTranscript }) => {
    
    const isTimedStudyStage = stage === TestStage.IMMEDIATE_MEMORY || stage === TestStage.LEARNING;
    const isNamingStage = stage === TestStage.NAMING;
    const initialMode = isTimedStudyStage ? 'MEMORIZE' : (isNamingStage ? 'NAMING_ACTIVE' : 'RECALL');
    
    const [phaseMode, setPhaseMode] = useState<'MEMORIZE' | 'RECALL' | 'NAMING_ACTIVE'>(initialMode); 
    const [timeLeft, setTimeLeft] = useState(30);

    // Control Global Mic based on Phase Mode
    useEffect(() => {
        if (phaseMode === 'MEMORIZE') {
            setMicActive(false);
        } else {
            setMicActive(true);
        }
        // Speak instruction when mode changes
        if (phaseMode === 'RECALL') speakText("Agora, diga quais figuras você viu.");
        else speakText(instruction);

    }, [phaseMode, instruction, setMicActive]);

    // Timer Logic
    useEffect(() => {
        let interval: any = null;
        if (isTimedStudyStage && phaseMode === 'MEMORIZE' && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (isTimedStudyStage && phaseMode === 'MEMORIZE' && timeLeft === 0) {
            setPhaseMode('RECALL');
        }
        return () => clearInterval(interval);
    }, [isTimedStudyStage, phaseMode, timeLeft]);

    const showImage = phaseMode === 'MEMORIZE' || phaseMode === 'NAMING_ACTIVE';
    const textClass = highContrast ? 'text-white' : 'text-slate-900';
    const cardClass = highContrast ? 'bg-black border-2 border-white text-white' : 'bg-white border border-slate-200 text-slate-900';

    return (
      <div className="max-w-4xl mx-auto flex flex-col items-center text-center p-4">
        <h2 className={`text-4xl font-bold mb-6 ${textClass}`}>{title}</h2>
        
        <div className={`p-6 rounded-3xl mb-8 max-w-2xl w-full shadow-sm flex items-center justify-between gap-4 ${highContrast ? 'bg-gray-900 border border-white' : 'bg-blue-50 border border-blue-100'}`}>
           <p className={`text-2xl font-medium text-left ${textClass}`}>"{instruction}"</p>
           <button onClick={() => speakText(instruction)} className="p-3 rounded-full bg-medical-500 text-white shrink-0">🔊</button>
        </div>

        {isTimedStudyStage && phaseMode === 'MEMORIZE' && (
            <div className="mb-6">
                <div className="text-8xl font-black text-medical-600 tabular-nums">{timeLeft}</div>
                <p className="text-slate-500 animate-pulse">Memorizando...</p>
            </div>
        )}

        <div className={`mb-8 transition-all duration-500 w-full ${showImage ? 'opacity-100 scale-100' : 'opacity-0 scale-95 hidden'}`}>
             <div className="rounded-2xl overflow-hidden bg-white shadow-lg p-2 max-w-lg mx-auto">
                 <img src="/bbrc1.png" alt="Figuras do teste" className="w-full h-auto object-contain" />
             </div>
        </div>

        {(phaseMode === 'RECALL' || phaseMode === 'NAMING_ACTIVE') && (
            <div className={`p-8 rounded-3xl shadow-xl mb-8 w-full max-w-2xl ${cardClass}`}>
                <h3 className={`text-xl font-bold mb-6 ${textClass}`}>Fale as figuras...</h3>
                
                {liveTranscript && (
                    <div className="mb-4 p-2 bg-slate-100 rounded text-slate-600 italic text-sm">
                        "{liveTranscript}"
                    </div>
                )}

                <div className="flex flex-wrap gap-2 justify-center">
                    {foundWords.length > 0 ? (
                        foundWords.map((word, idx) => (
                            <span key={idx} className="bg-green-500 text-white px-4 py-2 rounded-lg text-lg font-bold shadow-sm animate-pop capitalize">
                                ✅ {word}
                            </span>
                        ))
                    ) : (
                        <span className="opacity-50 text-4xl">...</span>
                    )}
                </div>
            </div>
        )}

        <div className={`fixed bottom-0 left-0 w-full p-6 flex justify-center z-10 ${highContrast ? 'bg-black border-t border-white' : 'bg-white border-t border-slate-200'}`}>
             {isTimedStudyStage && phaseMode === 'MEMORIZE' ? (
                 <button 
                    onClick={() => { setPhaseMode('RECALL'); }}
                    className="bg-slate-200 text-slate-800 px-8 py-4 rounded-2xl font-bold text-xl hover:bg-slate-300 w-full md:w-auto min-h-[60px]"
                 >
                    Pular Tempo ⏩
                 </button>
             ) : (
                 <button 
                    onClick={() => {
                        if (title.includes("Aprendizado")) {
                            dispatch({ type: 'START_DELAY_TIMER' });
                        }
                        dispatch({ type: 'SET_VIEW', payload: nextStage });
                    }}
                    className="bg-medical-600 text-white px-10 py-4 rounded-2xl font-bold text-xl shadow-lg hover:bg-medical-500 transform w-full md:w-auto flex items-center justify-center gap-3 min-h-[60px]"
                 >
                    Próximo ➔
                 </button>
             )}
        </div>
        <div className="h-28"></div>
      </div>
    );
};

const FluencyPhase: React.FC<{
  list: string[];
  dispatch: React.Dispatch<Action>;
  highContrast: boolean;
  setMicActive: (active: boolean) => void;
  liveTranscript: string;
}> = ({ list, dispatch, highContrast, setMicActive, liveTranscript }) => {
    const [timeLeft, setTimeLeft] = useState(60);
    const [isActive, setIsActive] = useState(false);
    const instructionText = "Fale todos os nomes de animais que vierem à cabeça, o mais rápido possível. Quanto mais, melhor.";

    useEffect(() => {
        speakText(instructionText);
        setMicActive(true); 
    }, [setMicActive]);

    useEffect(() => {
      let interval: any = null;
      if (isActive && timeLeft > 0) {
        interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
      } else if (timeLeft === 0) {
        setIsActive(false);
        speakText("Tempo esgotado.");
      }
      return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const startTest = () => {
      setIsActive(true);
      setTimeLeft(60);
      dispatch({ type: 'UPDATE_SCORE', payload: { key: 'verbalFluency', value: 0 }});
    };

    const textClass = highContrast ? 'text-white' : 'text-slate-900';
    const cardClass = highContrast ? 'bg-black border-2 border-white text-white' : 'bg-white border border-slate-200 text-slate-900';

    return (
      <div className="max-w-4xl mx-auto p-4 flex flex-col items-center">
        <h2 className={`text-4xl font-bold mb-6 ${textClass}`}>Fluência Verbal</h2>
        
        <div className={`p-6 rounded-3xl mb-8 max-w-2xl w-full shadow-sm flex flex-col gap-4 ${highContrast ? 'bg-gray-900' : 'bg-blue-50'}`}>
            <p className={`text-xl font-medium leading-relaxed ${textClass}`}>"{instructionText}"</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl">
           <div className={`p-8 rounded-3xl shadow-lg flex flex-col justify-center items-center min-h-[300px] ${cardClass}`}>
              {!isActive && timeLeft === 60 && (
                 <>
                    <div className="text-6xl mb-6">🦁</div>
                    <button onClick={startTest} className="bg-green-600 text-white px-10 py-5 rounded-2xl text-2xl font-bold hover:bg-green-500 shadow-xl w-full">
                        COMEÇAR CRONÔMETRO
                    </button>
                 </>
              )}
              {(isActive || timeLeft < 60) && (
                  <div className="text-center">
                     <span className={`text-8xl font-black ${timeLeft < 10 ? 'text-red-500' : textClass}`}>{timeLeft}</span>
                     <p className="text-sm font-bold uppercase mt-2">Segundos</p>
                  </div>
              )}
           </div>

           <div className={`p-8 rounded-3xl shadow-lg flex flex-col min-h-[300px] ${cardClass}`}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-xl">Animais: {list.length}</h3>
              </div>
              
              {liveTranscript && (
                    <div className="mb-4 p-2 bg-slate-100 rounded text-slate-600 italic text-sm">
                        Ouvindo: "{liveTranscript}"
                    </div>
              )}

              <div className="flex-1 rounded-2xl p-4 overflow-y-auto max-h-60 mb-6 bg-opacity-10 bg-slate-500">
                <div className="flex flex-wrap gap-2">
                  {list.map((animal, i) => (
                    <span key={i} className="bg-medical-100 border border-medical-200 px-3 py-1 rounded-lg text-lg font-medium text-medical-800">
                      {animal}
                    </span>
                  ))}
                </div>
              </div>
           </div>
        </div>
        
        <div className={`fixed bottom-0 left-0 w-full p-6 flex justify-center z-10 ${highContrast ? 'bg-black border-t border-white' : 'bg-white border-t border-slate-200'}`}>
           <button 
              onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.CLOCK_DRAWING })}
              className="bg-medical-600 text-white px-10 py-4 rounded-2xl font-bold text-xl shadow-lg hover:bg-medical-500 w-full max-w-md min-h-[60px]"
            >
              Próximo (Relógio) ➔
            </button>
        </div>
        <div className="h-28"></div>
      </div>
    );
};

// ... ClockPhase, RecognitionPhase, Results etc (Simple pass-throughs or no mic needed) ... 

const ClockPhase: React.FC<{ dispatch: React.Dispatch<Action>, highContrast: boolean }> = ({ dispatch, highContrast }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    useEffect(() => speakText("Desenhe um relógio marcando 11 horas e 10 minutos."), []);
    
    const handleSave = async (base64: string) => {
        dispatch({ type: 'SET_CLOCK_IMAGE', payload: base64 });
        if (base64) {
          setIsAnalyzing(true);
          const score = await analyzeClockDrawing(base64);
          dispatch({ type: 'UPDATE_SCORE', payload: { key: 'clockDrawing', value: score }});
          setIsAnalyzing(false);
        } else {
          dispatch({ type: 'UPDATE_SCORE', payload: { key: 'clockDrawing', value: 0 }});
        }
    };
    const textClass = highContrast ? 'text-white' : 'text-slate-900';

    return (
      <div className="max-w-5xl mx-auto text-center p-4">
        <h2 className={`text-4xl font-bold mb-6 ${textClass}`}>Relógio</h2>
        <div className={`p-6 rounded-3xl mb-8 max-w-3xl mx-auto text-left flex gap-4 ${highContrast ? 'bg-gray-900' : 'bg-blue-50'}`}>
            <p className={`text-xl leading-relaxed ${textClass}`}>"Desenhe um relógio grande marcando <strong>11 horas e 10 minutos</strong>."</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-8 pb-24">
            <div className="bg-white p-2 rounded-3xl border-4 border-slate-200 shadow-xl touch-none">
                <ClockCanvas onSave={handleSave} />
            </div>
            {isAnalyzing && <div className="bg-blue-100 text-blue-800 px-6 py-4 rounded-xl font-bold animate-pulse text-lg">Aguarde... Analisando...</div>}
            <button onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DELAYED_MEMORY })} className="bg-medical-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl shadow-xl hover:bg-medical-500 w-full max-w-sm min-h-[70px]">Terminei ➔</button>
        </div>
      </div>
    );
};

const RecognitionPhase: React.FC<{ dispatch: React.Dispatch<Action>; highContrast: boolean; }> = ({ dispatch, highContrast }) => {
    const [selected, setSelected] = useState<string[]>([]);
    useEffect(() => speakText("Toque nas figuras que você já viu hoje."), []);
    
    const toggleSelect = (id: string) => {
      if (selected.includes(id)) setSelected(s => s.filter(x => x !== id));
      else setSelected(s => [...selected, id]);
    };
    const finishRecognition = () => {
        const correctCount = selected.filter(id => TARGET_WORDS.includes(id)).length;
        dispatch({ type: 'UPDATE_SCORE', payload: { key: 'recognition', value: correctCount }});
        dispatch({ type: 'SET_VIEW', payload: TestStage.POST_TEST_CHECK });
    };
    const textClass = highContrast ? 'text-white' : 'text-slate-900';

    return (
      <div className="max-w-6xl mx-auto p-4 flex flex-col items-center">
        <h2 className={`text-4xl font-bold mb-6 ${textClass}`}>Reconhecimento</h2>
        <div className={`p-6 rounded-3xl mb-8 w-full max-w-3xl text-center flex justify-center gap-4 ${highContrast ? 'bg-gray-900' : 'bg-blue-50'}`}>
            <p className={`text-2xl ${textClass}`}>"Quais figuras você já viu hoje?"</p>
        </div>
        <div className="mb-8 p-2 bg-white rounded-2xl shadow-sm"><img src="/bbrc2.png" alt="Prancha de Reconhecimento" className="max-w-full h-auto max-h-[300px] object-contain mx-auto" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4 mb-32 w-full">
            {RECOGNITION_ITEMS.map((item) => (
                <button key={item.id} onClick={() => toggleSelect(item.id)} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center min-h-[100px] ${selected.includes(item.id) ? 'border-medical-500 bg-medical-600 text-white shadow-lg transform scale-105' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><span className="font-bold text-xl">{item.label}</span></button>
            ))}
        </div>
        <div className={`fixed bottom-0 left-0 w-full p-6 flex justify-center z-10 ${highContrast ? 'bg-black border-t border-white' : 'bg-white border-t border-slate-200'}`}>
            <button onClick={finishRecognition} className="bg-green-600 text-white px-12 py-5 rounded-2xl font-bold text-2xl shadow-xl hover:bg-green-500 w-full max-w-md min-h-[70px]">Finalizar ✅</button>
        </div>
      </div>
    );
};

const PostTestCheck: React.FC<{ currentPatientId: string | null; scores: BBRCScores; dispatch: React.Dispatch<Action>; }> = ({ currentPatientId, scores, dispatch }) => {
    const [interrupted, setInterrupted] = useState<boolean | null>(null);
    const finish = () => {
        if (interrupted === null) return;
        dispatch({ type: 'FINISH_TEST', payload: { interrupted } });
        if (currentPatientId) {
             const finalScores = { ...scores, date: new Date().toISOString(), environment: { ...scores.environment!, hadInterruptions: interrupted } };
             addTestResult(currentPatientId, finalScores);
        }
    };
    return (
        <div className="max-w-xl mx-auto p-6 bg-white rounded-3xl shadow-xl mt-10 text-center animate-fade-in">
            <h2 className="text-2xl font-bold mb-6 text-medical-900">Teste Finalizado!</h2>
            <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-2xl">
                    <p className="text-lg font-medium text-slate-800 mb-4">Você foi interrompido(a)?</p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={() => setInterrupted(false)} className={`px-6 py-3 rounded-xl font-bold transition-all ${interrupted === false ? 'bg-green-600 text-white' : 'bg-white border border-slate-200'}`}>Não</button>
                        <button onClick={() => setInterrupted(true)} className={`px-6 py-3 rounded-xl font-bold transition-all ${interrupted === true ? 'bg-orange-500 text-white' : 'bg-white border border-slate-200'}`}>Sim</button>
                    </div>
                </div>
                <button onClick={finish} disabled={interrupted === null} className="w-full bg-medical-600 disabled:bg-slate-300 text-white py-4 rounded-xl font-bold text-xl shadow-lg">Ver Resultados</button>
            </div>
        </div>
    );
};

const Results = ({ scores, currentPatientId, dispatch }: any) => {
    const patient = getPatientById(currentPatientId!);
    if(!patient) return null;
    return (
        <div className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow-2xl border border-slate-100 my-10 text-center">
            <h2 className="text-4xl font-black text-medical-900 mb-6">Resultados: {patient.name}</h2>
            <div className="grid grid-cols-2 gap-4 text-left mb-8">
                {[
                    { l: 'Memória Imediata', v: scores.immediateMemory + '/10' },
                    { l: 'Memória Tardia', v: scores.delayedMemory + '/10' },
                    { l: 'Fluência Verbal', v: scores.verbalFluency },
                    { l: 'Relógio', v: scores.clockDrawing + '/5' }
                ].map((i,x) => (
                    <div key={x} className="bg-blue-50 p-4 rounded-xl">
                        <span className="block text-sm text-slate-500">{i.l}</span>
                        <span className="text-2xl font-bold text-medical-700">{i.v}</span>
                    </div>
                ))}
            </div>
            <button onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DASHBOARD })} className="bg-medical-600 text-white px-8 py-4 rounded-xl font-bold text-xl w-full">Voltar ao Início</button>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [searchTerm, setSearchTerm] = useState('');
  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  
  // GLOBAL MIC STATE
  const [isMicGlobalActive, setIsMicGlobalActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");

  useEffect(() => {
    if (state.stage === TestStage.DASHBOARD) {
        setAllPatients(getPatients());
        setIsMicGlobalActive(false); // Ensure off on dashboard
    }
  }, [state.stage]);

  // Handle Global Speech
  const handleSpeechResult = useCallback((text: string, isFinal: boolean) => {
      // Visual feedback
      setLiveTranscript(text);
      
      // If final, send to reducer for scoring
      if (isFinal) {
        dispatch({ type: 'PROCESS_SPEECH', payload: text });
        // Clear transcript after a delay so user sees what was processed
        setTimeout(() => setLiveTranscript(""), 1000);
      }
  }, []);

  // Root styles
  const containerStyle = { fontSize: `${16 * state.fontSizeMultiplier}px` };
  const bgClass = state.highContrast ? 'bg-black text-white' : 'bg-slate-50 text-slate-900';
  const isTestActive = ![TestStage.DASHBOARD, TestStage.REGISTRATION, TestStage.PATIENT_DETAIL, TestStage.RESULTS].includes(state.stage);

  const renderContent = () => {
    switch (state.stage) {
      case TestStage.DASHBOARD: 
        // ... (Dashboard same as before, abbreviated for space)
        const filteredPatients = allPatients.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
        return (
            <div className="max-w-6xl mx-auto space-y-8 p-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div><h2 className="text-3xl font-bold text-medical-900">Pacientes</h2></div>
                    <button onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.REGISTRATION })} className="bg-medical-600 text-white px-6 py-4 rounded-xl font-bold text-lg">+ Novo Teste</button>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200"><input type="text" placeholder="🔍 Buscar..." className="w-full p-4 border rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPatients.map(p => (
                        <div key={p.id} className="bg-white p-6 rounded-2xl shadow-sm border hover:shadow-md">
                            <h3 className="font-bold text-xl mb-1">{p.name}</h3><p className="text-sm text-slate-500 mb-4">{p.age} anos</p>
                            <button onClick={() => { dispatch({ type: 'SET_CURRENT_PATIENT', payload: p.id }); dispatch({ type: 'SET_VIEW', payload: TestStage.PATIENT_DETAIL }); }} className="w-full bg-slate-100 py-3 rounded-xl font-bold text-slate-700">Ver Histórico</button>
                        </div>
                    ))}
                </div>
            </div>
        );
      case TestStage.PATIENT_DETAIL: 
          const patient = getPatientById(state.currentPatientId!);
          if (!patient) return null;
          return (
              <div className="max-w-5xl mx-auto space-y-8 p-6">
                  <button onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DASHBOARD })} className="text-medical-600 font-bold">← Voltar</button>
                  <div className="flex justify-between bg-white p-8 rounded-3xl shadow-sm border"><h2 className="text-3xl font-bold">{patient.name}</h2><button onClick={() => dispatch({ type: 'START_TEST_SETUP', payload: patient.id })} className="bg-medical-600 text-white px-8 py-4 rounded-xl font-bold text-xl">Iniciar Teste</button></div>
              </div>
          );
      case TestStage.REGISTRATION: 
          // ... Registration Form ...
          return (
            <div className="flex items-center justify-center min-h-[80vh]">
                <div className="max-w-lg w-full bg-white p-10 rounded-3xl shadow-2xl">
                    <h2 className="text-3xl font-bold mb-8">Cadastro</h2>
                    <div className="space-y-6">
                        <input type="text" placeholder="Nome" className="w-full rounded-xl border p-4" value={state.tempPatientData.name} onChange={(e) => dispatch({ type: 'UPDATE_TEMP_PATIENT', payload: { name: e.target.value } })} />
                        <input type="number" placeholder="Idade" className="w-full rounded-xl border p-4" value={state.tempPatientData.age || ''} onChange={(e) => dispatch({ type: 'UPDATE_TEMP_PATIENT', payload: { age: parseInt(e.target.value) } })} />
                        <select className="w-full rounded-xl border p-4 bg-white" value={state.tempPatientData.education} onChange={(e) => dispatch({ type: 'UPDATE_TEMP_PATIENT', payload: { education: e.target.value as EducationLevel } })}>
                            <option value={EducationLevel.LOW}>1-7 Anos</option><option value={EducationLevel.HIGH}>≥ 8 Anos</option><option value={EducationLevel.ILLITERATE}>Analfabeto</option>
                        </select>
                        <div className="flex gap-4"><button onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DASHBOARD })} className="w-1/2 bg-slate-100 py-4 rounded-xl font-bold">Cancelar</button><button onClick={() => { if(state.tempPatientData.name) { const p = createPatient(state.tempPatientData.name!, state.tempPatientData.age!, state.tempPatientData.education); dispatch({ type: 'START_TEST_SETUP', payload: p.id }); } }} className="w-1/2 bg-medical-600 text-white py-4 rounded-xl font-bold">Continuar</button></div>
                    </div>
                </div>
            </div>
          );
      case TestStage.PRE_TEST_CHECK: 
        return <PreTestCheck dispatch={dispatch} onEnableMic={() => setIsMicGlobalActive(true)} liveTranscript={liveTranscript} />;
      case TestStage.POST_TEST_CHECK: 
        return <PostTestCheck currentPatientId={state.currentPatientId} scores={state.scores} dispatch={dispatch} />;
      
      // Test Phases using new Global Mic prop
      case TestStage.NAMING:
        return <MemoryPhase key="naming" title="1. Nomeação" instruction="Diga o nome das figuras." scoreKey="naming" scoreValue={state.scores.naming} foundWords={state.currentStageFoundWords} nextStage={TestStage.INCIDENTAL_MEMORY} stage={state.stage} dispatch={dispatch} highContrast={state.highContrast} setMicActive={setIsMicGlobalActive} liveTranscript={liveTranscript} />;
      case TestStage.INCIDENTAL_MEMORY:
        return <MemoryPhase key="incidental" title="2. Memória Incidental" instruction="Quais figuras você acabou de ver?" scoreKey="incidentalMemory" scoreValue={state.scores.incidentalMemory} foundWords={state.currentStageFoundWords} nextStage={TestStage.IMMEDIATE_MEMORY} stage={state.stage} dispatch={dispatch} highContrast={state.highContrast} setMicActive={setIsMicGlobalActive} liveTranscript={liveTranscript} />;
      case TestStage.IMMEDIATE_MEMORY:
        return <MemoryPhase key="immediate" title="3. Memória Imediata" instruction="Memorize estas figuras por 30 segundos." scoreKey="immediateMemory" scoreValue={state.scores.immediateMemory} foundWords={state.currentStageFoundWords} nextStage={TestStage.LEARNING} stage={state.stage} dispatch={dispatch} highContrast={state.highContrast} setMicActive={setIsMicGlobalActive} liveTranscript={liveTranscript} />;
      case TestStage.LEARNING:
        return <MemoryPhase key="learning" title="4. Aprendizado" instruction="Memorize novamente." scoreKey="learning" scoreValue={state.scores.learning} foundWords={state.currentStageFoundWords} nextStage={TestStage.VERBAL_FLUENCY} stage={state.stage} dispatch={dispatch} highContrast={state.highContrast} setMicActive={setIsMicGlobalActive} liveTranscript={liveTranscript} />;
      case TestStage.DELAYED_MEMORY:
        return <MemoryPhase key="delayed" title="5. Memória Tardia" instruction="Quais figuras eu mostrei 5 minutos atrás?" scoreKey="delayedMemory" scoreValue={state.scores.delayedMemory} foundWords={state.currentStageFoundWords} nextStage={TestStage.RECOGNITION} stage={state.stage} dispatch={dispatch} highContrast={state.highContrast} setMicActive={setIsMicGlobalActive} liveTranscript={liveTranscript} />;
      
      case TestStage.VERBAL_FLUENCY:
        return <FluencyPhase key="fluency" list={state.verbalFluencyList} dispatch={dispatch} highContrast={state.highContrast} setMicActive={setIsMicGlobalActive} liveTranscript={liveTranscript} />;
      
      case TestStage.CLOCK_DRAWING:
        return <ClockPhase key="clock" dispatch={dispatch} highContrast={state.highContrast} />;
      case TestStage.RECOGNITION:
        return <RecognitionPhase key="recognition" dispatch={dispatch} highContrast={state.highContrast} />;
      case TestStage.RESULTS:
        return <Results scores={state.scores} currentPatientId={state.currentPatientId} dispatch={dispatch} />;
      default: return <div>...</div>;
    }
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-300 ${bgClass}`} style={containerStyle}>
        
        {/* GLOBAL VOICE RECORDER - PERSISTENT */}
        <VoiceRecorder 
            isListening={isMicGlobalActive} 
            onResult={handleSpeechResult} 
        />

        <AccessibilityControls dispatch={dispatch} currentMultiplier={state.fontSizeMultiplier} highContrast={state.highContrast} />
        {isTestActive && <ProgressBar stage={state.stage} />}

        {!isTestActive && (
             <header className="border-b border-slate-200 py-4 px-6 mb-4 sticky top-0 z-20 bg-inherit">
                <div className="max-w-7xl mx-auto flex justify-between items-center"><h1 className="text-xl font-black">BBRC Digital</h1></div>
            </header>
        )}
        
        <main className="animate-fade-in pb-20 pt-6">
          {renderContent()}
        </main>
    </div>
  );
};

export default App;