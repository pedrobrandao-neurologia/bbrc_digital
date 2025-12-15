import React, { useState, useReducer, useEffect, useCallback } from 'react';
import { TestStage, INITIAL_STATE, TestState, EducationLevel, BBRCScores, INITIAL_SCORES, Patient, EnvironmentContext, StageCapture } from './types';
import { TARGET_WORDS, ANIMAL_LIST, RECOGNITION_ITEMS } from './constants';
import { scoreRecallUtterance, scoreRecognitionUtterance, scoreFluencyUtterance, normalize } from './utils/scoring';
import VoiceRecorder from './components/VoiceRecorder';
import ClockCanvas from './components/ClockCanvas';
import { analyzeClockDrawing, isGeminiConfigured } from './geminiService';
import recallSheet from './bbrc1.png';
import recognitionSheet from './bbrc2.png';
import { getPatients, createPatient, addTestResult, getPatientById } from './utils/storage';

type NumericScoreKey = Exclude<keyof BBRCScores, 'date' | 'environment'>;

const EMPTY_CAPTURE: StageCapture = { tokens: [], intrusions: [], repeats: [] };

// --- TTS Helper com voz mais lenta para idosos ---
const speakText = (text: string, rate: number = 0.85) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = rate;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    }
};

// --- Feedback sonoro simples ---
const playBeep = (frequency: number = 800, duration: number = 150) => {
    try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
        // Silently fail if audio not available
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
        currentStageResponses: EMPTY_CAPTURE,
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
        currentStageResponses: EMPTY_CAPTURE,
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
            currentStageResponses: EMPTY_CAPTURE,
            clockImageBase64: null
        };
    case 'UPDATE_SCORE':
      return { ...state, scores: { ...state.scores, [action.payload.key]: action.payload.value } };

    case 'PROCESS_SPEECH': {
      const rawText = action.payload;
      let newState = { ...state };

      const extendCapture = (incoming: StageCapture) => ({
        tokens: [...state.currentStageResponses.tokens, ...incoming.tokens],
        intrusions: [...state.currentStageResponses.intrusions, ...incoming.intrusions],
        repeats: [...state.currentStageResponses.repeats, ...incoming.repeats],
      });

      const isMemoryPhase = [
          TestStage.NAMING,
          TestStage.INCIDENTAL_MEMORY,
          TestStage.IMMEDIATE_MEMORY,
          TestStage.LEARNING,
          TestStage.DELAYED_MEMORY
      ].includes(state.stage);

      if (isMemoryPhase) {
          const scored = scoreRecallUtterance(rawText, state.currentStageFoundWords);
          const mergedHits = Array.from(new Set([...state.currentStageFoundWords, ...scored.hits]));
          newState.currentStageFoundWords = mergedHits;
          newState.currentStageResponses = extendCapture({
            tokens: scored.tokens,
            intrusions: scored.intrusions,
            repeats: scored.repeats,
          });

          let scoreKey: NumericScoreKey | null = null;
          if (state.stage === TestStage.NAMING) scoreKey = 'naming';
          else if (state.stage === TestStage.INCIDENTAL_MEMORY) scoreKey = 'incidentalMemory';
          else if (state.stage === TestStage.IMMEDIATE_MEMORY) scoreKey = 'immediateMemory';
          else if (state.stage === TestStage.LEARNING) scoreKey = 'learning';
          else if (state.stage === TestStage.DELAYED_MEMORY) scoreKey = 'delayedMemory';

          if (scoreKey) {
              newState.scores = { ...newState.scores, [scoreKey]: mergedHits.length };
          }
      }

      if (state.stage === TestStage.VERBAL_FLUENCY) {
          const scored = scoreFluencyUtterance(rawText, ANIMAL_LIST, state.verbalFluencyList.map(normalize));
          const merged = Array.from(new Set([...state.verbalFluencyList, ...scored.animals]));
          newState.verbalFluencyList = merged;
          newState.currentStageResponses = extendCapture({
            tokens: scored.tokens,
            intrusions: scored.invalid,
            repeats: scored.repeats,
          });
          newState.scores = { ...newState.scores, verbalFluency: merged.length };
      }

      if (state.stage === TestStage.RECOGNITION) {
          const scored = scoreRecognitionUtterance(rawText, state.currentStageFoundWords);
          const mergedHits = Array.from(new Set([...state.currentStageFoundWords, ...scored.hits]));
          newState.currentStageFoundWords = mergedHits;
          newState.currentStageResponses = extendCapture({
            tokens: scored.tokens,
            intrusions: [...scored.intrusions, ...scored.distractorHits],
            repeats: scored.repeats,
          });
          newState.scores = { ...newState.scores, recognition: mergedHits.length };
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

// ===========================================
// COMPONENTES DE UI SIMPLIFICADOS PARA IDOSOS
// ===========================================

// Botao grande e acessivel
const BigButton: React.FC<{
    onClick: () => void;
    children: React.ReactNode;
    variant?: 'primary' | 'secondary' | 'success' | 'danger';
    disabled?: boolean;
    className?: string;
    icon?: string;
}> = ({ onClick, children, variant = 'primary', disabled = false, className = '', icon }) => {
    const baseStyles = "w-full py-6 px-8 rounded-2xl font-bold text-2xl shadow-lg transition-all duration-200 flex items-center justify-center gap-4 min-h-[80px] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
        primary: "bg-blue-600 hover:bg-blue-500 text-white",
        secondary: "bg-gray-200 hover:bg-gray-300 text-gray-800",
        success: "bg-green-600 hover:bg-green-500 text-white",
        danger: "bg-red-600 hover:bg-red-500 text-white"
    };

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${baseStyles} ${variants[variant]} ${className}`}
        >
            {icon && <span className="text-3xl">{icon}</span>}
            {children}
        </button>
    );
};

// Card de instrucao com icone grande
const InstructionCard: React.FC<{
    instruction: string;
    onSpeak?: () => void;
    highContrast?: boolean;
}> = ({ instruction, onSpeak, highContrast }) => {
    return (
        <div className={`p-6 rounded-3xl mb-6 flex items-center gap-4 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-blue-100 border-2 border-blue-200'}`}>
            <div className="flex-1">
                <p className="text-xl md:text-2xl font-medium leading-relaxed">
                    {instruction}
                </p>
            </div>
            {onSpeak && (
                <button
                    onClick={onSpeak}
                    className="p-4 rounded-full bg-blue-600 text-white hover:bg-blue-500 shrink-0 shadow-lg"
                    aria-label="Ouvir instrucao"
                >
                    <span className="text-3xl">🔊</span>
                </button>
            )}
        </div>
    );
};

// Indicador de microfone ativo - MUITO visivel
const MicrophoneIndicator: React.FC<{ isActive: boolean; transcript: string }> = ({ isActive, transcript }) => {
    if (!isActive) return null;

    return (
        <div className="fixed top-0 left-0 right-0 bg-green-500 text-white py-4 px-6 z-50 shadow-lg">
            <div className="max-w-4xl mx-auto flex items-center justify-center gap-4">
                <div className="relative">
                    <span className="text-4xl animate-pulse">🎤</span>
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping"></span>
                </div>
                <div className="text-center">
                    <p className="text-xl font-bold">OUVINDO...</p>
                    {transcript && (
                        <p className="text-lg opacity-90 mt-1">"{transcript}"</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// Badge de palavra encontrada
const WordBadge: React.FC<{ word: string; isNew?: boolean }> = ({ word, isNew }) => {
    return (
        <span className={`inline-flex items-center gap-2 bg-green-500 text-white px-5 py-3 rounded-xl text-xl font-bold shadow-md ${isNew ? 'animate-bounce' : ''}`}>
            <span className="text-2xl">✓</span>
            <span className="capitalize">{word}</span>
        </span>
    );
};

// Contador grande
const BigCounter: React.FC<{ value: number; label: string; max?: number; warning?: boolean }> = ({ value, label, max, warning }) => {
    return (
        <div className={`text-center p-6 rounded-2xl ${warning ? 'bg-red-100 border-4 border-red-400' : 'bg-white border-2 border-gray-200'}`}>
            <div className={`text-7xl md:text-8xl font-black tabular-nums ${warning ? 'text-red-600' : 'text-blue-600'}`}>
                {value}
                {max && <span className="text-4xl text-gray-400">/{max}</span>}
            </div>
            <p className="text-xl font-medium text-gray-600 mt-2">{label}</p>
        </div>
    );
};

// Barra de progresso visual
const ProgressSteps: React.FC<{ current: number; total: number; labels: string[] }> = ({ current, total, labels }) => {
    return (
        <div className="w-full py-4 px-2">
            <div className="flex justify-between mb-2">
                {labels.map((label, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg
                            ${idx < current ? 'bg-green-500 text-white' : idx === current ? 'bg-blue-600 text-white ring-4 ring-blue-200' : 'bg-gray-200 text-gray-500'}`}>
                            {idx < current ? '✓' : idx + 1}
                        </div>
                        <span className="text-xs mt-1 text-center max-w-[60px] leading-tight hidden md:block">{label}</span>
                    </div>
                ))}
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{ width: `${(current / (total - 1)) * 100}%` }}
                />
            </div>
        </div>
    );
};

// ===========================================
// TELAS PRINCIPAIS
// ===========================================

// Tela inicial simplificada
const WelcomeScreen: React.FC<{
    dispatch: React.Dispatch<Action>;
    patients: Patient[];
}> = ({ dispatch, patients }) => {

    useEffect(() => {
        speakText("Bem-vindo ao teste de memória. Toque no botão verde para começar.", 0.8);
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-lg w-full text-center space-y-8">
                <div className="mb-8">
                    <div className="text-8xl mb-4">🧠</div>
                    <h1 className="text-4xl md:text-5xl font-black text-blue-900 mb-4">
                        Teste de Memória
                    </h1>
                    <p className="text-xl text-gray-600">
                        BBRC Digital
                    </p>
                </div>

                <div className="space-y-4">
                    <BigButton
                        onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.REGISTRATION })}
                        variant="success"
                        icon="▶️"
                    >
                        COMEÇAR TESTE
                    </BigButton>

                    {patients.length > 0 && (
                        <BigButton
                            onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DASHBOARD })}
                            variant="secondary"
                            icon="📋"
                        >
                            Ver Pacientes ({patients.length})
                        </BigButton>
                    )}
                </div>

                <p className="text-gray-500 text-lg mt-8">
                    Toque no botão verde para iniciar
                </p>
            </div>
        </div>
    );
};

// Cadastro simplificado
const SimpleRegistration: React.FC<{
    dispatch: React.Dispatch<Action>;
    tempData: Partial<Patient>;
}> = ({ dispatch, tempData }) => {
    const [step, setStep] = useState(1);

    useEffect(() => {
        if (step === 1) speakText("Digite o nome do paciente.", 0.8);
        else if (step === 2) speakText("Digite a idade.", 0.8);
        else if (step === 3) speakText("Selecione a escolaridade.", 0.8);
    }, [step]);

    const handleContinue = () => {
        if (step === 1 && tempData.name) {
            setStep(2);
        } else if (step === 2 && tempData.age) {
            setStep(3);
        } else if (step === 3) {
            const patient = createPatient(
                tempData.name || 'Paciente',
                tempData.age || 65,
                tempData.education || EducationLevel.LOW
            );
            dispatch({ type: 'START_TEST_SETUP', payload: patient.id });
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-lg w-full">
                <button
                    onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DASHBOARD })}
                    className="text-blue-600 font-bold text-xl mb-6 flex items-center gap-2"
                >
                    ← Voltar
                </button>

                <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
                    <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
                        Cadastro
                    </h2>

                    {/* Step 1: Nome */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <label className="block text-xl font-medium text-gray-700">
                                Nome do paciente:
                            </label>
                            <input
                                type="text"
                                placeholder="Digite o nome"
                                value={tempData.name || ''}
                                onChange={(e) => dispatch({ type: 'UPDATE_TEMP_PATIENT', payload: { name: e.target.value } })}
                                className="w-full p-5 text-2xl border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                autoFocus
                            />
                        </div>
                    )}

                    {/* Step 2: Idade */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <label className="block text-xl font-medium text-gray-700">
                                Idade:
                            </label>
                            <input
                                type="number"
                                placeholder="Ex: 65"
                                value={tempData.age || ''}
                                onChange={(e) => dispatch({ type: 'UPDATE_TEMP_PATIENT', payload: { age: parseInt(e.target.value) || 0 } })}
                                className="w-full p-5 text-2xl border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                min={18}
                                max={120}
                                autoFocus
                            />
                        </div>
                    )}

                    {/* Step 3: Escolaridade */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <label className="block text-xl font-medium text-gray-700 mb-4">
                                Anos de estudo:
                            </label>
                            <div className="space-y-3">
                                {[
                                    { value: EducationLevel.ILLITERATE, label: 'Analfabeto', icon: '📖' },
                                    { value: EducationLevel.LOW, label: '1 a 7 anos', icon: '📚' },
                                    { value: EducationLevel.HIGH, label: '8 anos ou mais', icon: '🎓' }
                                ].map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => dispatch({ type: 'UPDATE_TEMP_PATIENT', payload: { education: option.value } })}
                                        className={`w-full p-5 rounded-xl text-xl font-medium flex items-center gap-4 transition-all
                                            ${tempData.education === option.value
                                                ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
                                    >
                                        <span className="text-3xl">{option.icon}</span>
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-4 pt-4">
                        {step > 1 && (
                            <BigButton
                                onClick={() => setStep(step - 1)}
                                variant="secondary"
                            >
                                Voltar
                            </BigButton>
                        )}
                        <BigButton
                            onClick={handleContinue}
                            variant="primary"
                            disabled={
                                (step === 1 && !tempData.name) ||
                                (step === 2 && !tempData.age)
                            }
                        >
                            {step === 3 ? 'Iniciar Teste' : 'Continuar'}
                        </BigButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Verificacao pre-teste
const PreTestCheck: React.FC<{
    dispatch: React.Dispatch<Action>;
    onEnableMic: () => void;
    liveTranscript: string;
}> = ({ dispatch, onEnableMic, liveTranscript }) => {
    const [micVerified, setMicVerified] = useState(false);

    useEffect(() => {
        speakText("Antes de começar, vamos testar o microfone. Toque no botão azul e diga qualquer palavra.", 0.8);
    }, []);

    useEffect(() => {
        if (liveTranscript.length > 0 && !micVerified) {
            setMicVerified(true);
            playBeep(1000, 200);
            speakText("Microfone funcionando! Agora toque no botão verde para começar o teste.", 0.8);
        }
    }, [liveTranscript, micVerified]);

    const start = () => {
        const envContext: EnvironmentContext = {
            deviceType: /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
            userAgent: navigator.userAgent,
            screenSize: `${window.innerWidth}x${window.innerHeight}`,
            startTime: new Date().toISOString(),
            isQuietEnvironment: true,
            hadInterruptions: false
        };
        dispatch({ type: 'START_ACTUAL_TEST', payload: envContext });
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-lg w-full text-center space-y-8">
                <div className="text-7xl mb-4">🎤</div>
                <h2 className="text-3xl font-bold text-gray-800">
                    Teste do Microfone
                </h2>

                <div className={`p-8 rounded-3xl border-4 transition-all ${micVerified ? 'bg-green-50 border-green-400' : 'bg-orange-50 border-orange-300'}`}>
                    {!micVerified ? (
                        <>
                            <p className="text-xl text-gray-700 mb-6">
                                Toque no botão abaixo e diga alguma coisa para testar.
                            </p>
                            <BigButton onClick={onEnableMic} variant="primary" icon="🎤">
                                ATIVAR MICROFONE
                            </BigButton>
                            {liveTranscript && (
                                <p className="mt-4 text-lg text-gray-600 italic">
                                    Ouvindo: "{liveTranscript}"
                                </p>
                            )}
                        </>
                    ) : (
                        <div className="text-center">
                            <div className="text-6xl mb-4">✅</div>
                            <p className="text-2xl font-bold text-green-700">
                                Microfone funcionando!
                            </p>
                        </div>
                    )}
                </div>

                <BigButton
                    onClick={start}
                    variant="success"
                    disabled={!micVerified}
                    icon="▶️"
                >
                    {micVerified ? 'COMEÇAR O TESTE' : 'Teste o microfone primeiro'}
                </BigButton>
            </div>
        </div>
    );
};

// Fase de Memoria (Nomeacao, Incidental, Imediata, Aprendizado, Tardia)
const MemoryPhase: React.FC<{
  title: string;
  stepNumber: number;
  instruction: string;
  scoreKey: NumericScoreKey;
  foundWords: string[];
  nextStage: TestStage;
  stage: TestStage;
  dispatch: React.Dispatch<Action>;
  highContrast: boolean;
  setMicActive: (active: boolean) => void;
  liveTranscript: string;
  delayStart?: number | null;
}> = ({ title, stepNumber, instruction, foundWords, nextStage, stage, dispatch, highContrast, setMicActive, liveTranscript, delayStart }) => {

    const isTimedStudyStage = stage === TestStage.IMMEDIATE_MEMORY || stage === TestStage.LEARNING;
    const isNamingStage = stage === TestStage.NAMING;
    const initialMode = isTimedStudyStage ? 'MEMORIZE' : (isNamingStage ? 'NAMING_ACTIVE' : 'RECALL');

    const [phaseMode, setPhaseMode] = useState<'MEMORIZE' | 'RECALL' | 'NAMING_ACTIVE'>(initialMode);
    const [timeLeft, setTimeLeft] = useState(30);
    const [remainingDelay, setRemainingDelay] = useState(0);
    const [lastFoundCount, setLastFoundCount] = useState(0);

    const minDelayMs = 5 * 60 * 1000;

    // Feedback sonoro quando encontra palavra
    useEffect(() => {
        if (foundWords.length > lastFoundCount) {
            playBeep(1200, 100);
            setLastFoundCount(foundWords.length);
        }
    }, [foundWords.length, lastFoundCount]);

    // Delay timer
    useEffect(() => {
        const enforceDelay = () => {
            if (stage === TestStage.DELAYED_MEMORY && delayStart) {
                const elapsed = Date.now() - delayStart;
                const remaining = Math.max(0, minDelayMs - elapsed);
                setRemainingDelay(remaining);
            } else {
                setRemainingDelay(0);
            }
        };
        enforceDelay();
        const interval = setInterval(enforceDelay, 1000);
        return () => clearInterval(interval);
    }, [stage, delayStart]);

    // Mic control
    useEffect(() => {
        const delayBlocked = stage === TestStage.DELAYED_MEMORY && remainingDelay > 0;
        if (phaseMode === 'MEMORIZE' || delayBlocked) {
            setMicActive(false);
        } else {
            setMicActive(true);
        }
    }, [phaseMode, setMicActive, stage, remainingDelay]);

    // TTS
    useEffect(() => {
        if (phaseMode === 'RECALL') {
            speakText("Agora, diga em voz alta quais figuras você viu.", 0.8);
        } else if (phaseMode === 'MEMORIZE') {
            speakText("Olhe bem para as figuras. Você tem 30 segundos para memorizar.", 0.8);
        } else {
            speakText(instruction, 0.8);
        }
    }, [phaseMode, instruction]);

    // Timer
    useEffect(() => {
        let interval: any = null;
        if (isTimedStudyStage && phaseMode === 'MEMORIZE' && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (isTimedStudyStage && phaseMode === 'MEMORIZE' && timeLeft === 0) {
            playBeep(600, 300);
            setPhaseMode('RECALL');
        }
        return () => clearInterval(interval);
    }, [isTimedStudyStage, phaseMode, timeLeft]);

    const showImage = phaseMode === 'MEMORIZE' || phaseMode === 'NAMING_ACTIVE';
    const delayBlocked = stage === TestStage.DELAYED_MEMORY && remainingDelay > 0;
    const delaySeconds = Math.max(0, Math.ceil(remainingDelay / 1000));

    const progressLabels = ['Nome', 'M1', 'M2', 'M3', 'Animais', 'Relógio', 'M4', 'Reconh'];

    return (
        <div className={`min-h-screen ${highContrast ? 'bg-black text-white' : 'bg-gradient-to-b from-blue-50 to-white'}`}>
            <MicrophoneIndicator isActive={phaseMode !== 'MEMORIZE' && !delayBlocked} transcript={liveTranscript} />

            <div className="max-w-4xl mx-auto p-4 pt-20">
                <ProgressSteps current={stepNumber - 1} total={8} labels={progressLabels} />

                <div className="text-center mb-6">
                    <h2 className={`text-3xl md:text-4xl font-bold ${highContrast ? 'text-yellow-400' : 'text-blue-900'}`}>
                        {stepNumber}. {title}
                    </h2>
                </div>

                <InstructionCard
                    instruction={phaseMode === 'MEMORIZE' ? 'Memorize as figuras abaixo.' : instruction}
                    onSpeak={() => speakText(instruction, 0.8)}
                    highContrast={highContrast}
                />

                {delayBlocked && (
                    <div className="mb-6 p-6 bg-orange-100 border-4 border-orange-400 rounded-2xl text-center">
                        <p className="text-xl font-bold text-orange-800">
                            Aguarde o intervalo de 5 minutos
                        </p>
                        <p className="text-4xl font-black text-orange-600 mt-2">
                            {Math.floor(delaySeconds/60)}:{String(delaySeconds % 60).padStart(2,'0')}
                        </p>
                    </div>
                )}

                {isTimedStudyStage && phaseMode === 'MEMORIZE' && (
                    <BigCounter value={timeLeft} label="segundos" warning={timeLeft < 10} />
                )}

                {showImage && (
                    <div className="my-6 bg-white rounded-3xl shadow-xl p-4 border-4 border-gray-200">
                        <img src={recallSheet} alt="Figuras do teste" className="w-full h-auto max-h-[400px] object-contain mx-auto" />
                    </div>
                )}

                {(phaseMode === 'RECALL' || phaseMode === 'NAMING_ACTIVE') && !delayBlocked && (
                    <div className={`p-6 rounded-3xl shadow-xl mb-6 ${highContrast ? 'bg-gray-900 border-2 border-white' : 'bg-white border-2 border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">Figuras identificadas:</h3>
                            <span className="text-3xl font-black text-blue-600">{foundWords.length}/10</span>
                        </div>

                        <div className="flex flex-wrap gap-3 min-h-[60px]">
                            {foundWords.length > 0 ? (
                                foundWords.map((word, idx) => (
                                    <WordBadge key={idx} word={word} />
                                ))
                            ) : (
                                <p className="text-gray-400 text-lg">Aguardando respostas...</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t-2 border-gray-200 shadow-lg">
                    <div className="max-w-lg mx-auto">
                        {isTimedStudyStage && phaseMode === 'MEMORIZE' ? (
                            <BigButton onClick={() => setPhaseMode('RECALL')} variant="secondary">
                                Pular Tempo
                            </BigButton>
                        ) : (
                            <BigButton
                                onClick={() => {
                                    if (title.includes("Aprendizado")) {
                                        dispatch({ type: 'START_DELAY_TIMER' });
                                    }
                                    dispatch({ type: 'SET_VIEW', payload: nextStage });
                                }}
                                disabled={delayBlocked}
                                variant="success"
                                icon="→"
                            >
                                PRÓXIMO
                            </BigButton>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fase de Fluencia Verbal
const FluencyPhase: React.FC<{
  list: string[];
  dispatch: React.Dispatch<Action>;
  highContrast: boolean;
  setMicActive: (active: boolean) => void;
  liveTranscript: string;
}> = ({ list, dispatch, highContrast, setMicActive, liveTranscript }) => {
    const [timeLeft, setTimeLeft] = useState(60);
    const [isActive, setIsActive] = useState(false);
    const [lastCount, setLastCount] = useState(0);

    useEffect(() => {
        speakText("Fale todos os nomes de animais que você conseguir lembrar. Quando estiver pronto, toque no botão verde.", 0.8);
        setMicActive(true);
    }, [setMicActive]);

    useEffect(() => {
        if (list.length > lastCount) {
            playBeep(1000, 80);
            setLastCount(list.length);
        }
    }, [list.length, lastCount]);

    useEffect(() => {
        let interval: any = null;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0 && isActive) {
            setIsActive(false);
            playBeep(400, 500);
            speakText("Tempo esgotado!", 0.9);
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const startTest = () => {
        setIsActive(true);
        setTimeLeft(60);
        speakText("Pode começar! Fale nomes de animais.", 0.9);
    };

    const progressLabels = ['Nome', 'M1', 'M2', 'M3', 'Animais', 'Relógio', 'M4', 'Reconh'];

    return (
        <div className={`min-h-screen ${highContrast ? 'bg-black text-white' : 'bg-gradient-to-b from-blue-50 to-white'}`}>
            <MicrophoneIndicator isActive={isActive} transcript={liveTranscript} />

            <div className="max-w-4xl mx-auto p-4 pt-6">
                <ProgressSteps current={4} total={8} labels={progressLabels} />

                <div className="text-center mb-6">
                    <h2 className={`text-3xl md:text-4xl font-bold ${highContrast ? 'text-yellow-400' : 'text-blue-900'}`}>
                        5. Fluência Verbal
                    </h2>
                </div>

                <InstructionCard
                    instruction="Fale o maior número de nomes de ANIMAIS que conseguir em 1 minuto."
                    onSpeak={() => speakText("Fale o maior número de nomes de animais que conseguir em 1 minuto.", 0.8)}
                    highContrast={highContrast}
                />

                <div className="grid md:grid-cols-2 gap-6 mb-6">
                    <div className={`p-6 rounded-3xl shadow-xl text-center ${highContrast ? 'bg-gray-900' : 'bg-white'}`}>
                        {!isActive && timeLeft === 60 ? (
                            <>
                                <div className="text-7xl mb-4">🦁</div>
                                <BigButton onClick={startTest} variant="success" icon="▶️">
                                    COMEÇAR
                                </BigButton>
                            </>
                        ) : (
                            <BigCounter
                                value={timeLeft}
                                label="segundos"
                                warning={timeLeft < 10}
                            />
                        )}
                    </div>

                    <div className={`p-6 rounded-3xl shadow-xl ${highContrast ? 'bg-gray-900' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold">Animais:</h3>
                            <span className="text-4xl font-black text-green-600">{list.length}</span>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                            <div className="flex flex-wrap gap-2">
                                {list.map((animal, i) => (
                                    <span key={i} className="bg-green-100 text-green-800 px-3 py-2 rounded-lg font-medium">
                                        {animal}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t-2 border-gray-200 shadow-lg">
                    <div className="max-w-lg mx-auto">
                        <BigButton
                            onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.CLOCK_DRAWING })}
                            variant="success"
                            icon="→"
                        >
                            PRÓXIMO
                        </BigButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Escala de Sunderland para pontuação do relógio
const SUNDERLAND_SCALE = [
    { score: 10, label: "10 - Perfeito", description: "Relógio perfeito, ponteiros corretos em 11:10" },
    { score: 9, label: "9", description: "Pequenos erros no posicionamento dos ponteiros" },
    { score: 8, label: "8", description: "Erros mais visíveis nos ponteiros" },
    { score: 7, label: "7", description: "Ponteiros completamente errados" },
    { score: 6, label: "6", description: "Uso inadequado dos ponteiros" },
    { score: 5, label: "5", description: "Números invertidos ou em um hemisfério" },
    { score: 4, label: "4", description: "Números fora do relógio" },
    { score: 3, label: "3", description: "Números e relógio desconectados" },
    { score: 2, label: "2", description: "Tentativa sem semelhança com relógio" },
    { score: 1, label: "1", description: "Não compreendeu a tarefa" },
    { score: 0, label: "0", description: "Não tentou ou recusou" },
];

// Fase do Relogio - Escala de Sunderland (0-10)
const ClockPhase: React.FC<{
    dispatch: React.Dispatch<Action>;
    highContrast: boolean;
}> = ({ dispatch, highContrast }) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [manualScore, setManualScore] = useState(5);
    const [scoreApplied, setScoreApplied] = useState(false);

    useEffect(() => {
        speakText("Desenhe um relógio grande, com todos os números. Coloque os ponteiros marcando 11 horas e 10 minutos.", 0.8);
    }, []);

    const applyScore = (score: number) => {
        dispatch({ type: 'UPDATE_SCORE', payload: { key: 'clockDrawing', value: score } });
        setManualScore(score);
        setScoreApplied(true);
        playBeep(800, 150);
    };

    const handleSave = async (base64: string) => {
        dispatch({ type: 'SET_CLOCK_IMAGE', payload: base64 });

        if (base64 && isGeminiConfigured) {
            setIsAnalyzing(true);
            // Gemini retorna 0-5, convertemos para 0-10 (Sunderland)
            const geminiScore = await analyzeClockDrawing(base64);
            const sunderlandScore = Math.round(geminiScore * 2); // Converte 0-5 para 0-10
            applyScore(sunderlandScore);
            setIsAnalyzing(false);
        }
    };

    const currentCriteria = SUNDERLAND_SCALE.find(s => s.score === manualScore);
    const progressLabels = ['Nome', 'M1', 'M2', 'M3', 'Animais', 'Relógio', 'M4', 'Reconh'];

    return (
        <div className={`min-h-screen pb-32 ${highContrast ? 'bg-black text-white' : 'bg-gradient-to-b from-blue-50 to-white'}`}>
            <div className="max-w-4xl mx-auto p-4">
                <ProgressSteps current={5} total={8} labels={progressLabels} />

                <div className="text-center mb-6">
                    <h2 className={`text-3xl md:text-4xl font-bold ${highContrast ? 'text-yellow-400' : 'text-blue-900'}`}>
                        6. Desenho do Relógio
                    </h2>
                </div>

                <InstructionCard
                    instruction="Desenhe um relógio com todos os números, marcando 11 horas e 10 minutos."
                    onSpeak={() => speakText("Desenhe um relógio com todos os números, marcando 11 horas e 10 minutos.", 0.8)}
                    highContrast={highContrast}
                />

                <div className="flex flex-col items-center gap-6">
                    <div className="bg-white p-3 rounded-3xl border-4 border-gray-300 shadow-xl touch-none">
                        <ClockCanvas onSave={handleSave} />
                    </div>

                    {isAnalyzing && (
                        <div className="bg-blue-100 text-blue-800 px-6 py-4 rounded-xl font-bold animate-pulse text-xl">
                            Analisando desenho...
                        </div>
                    )}

                    {/* Escala de Sunderland */}
                    <div className={`w-full max-w-2xl p-6 rounded-2xl ${highContrast ? 'bg-gray-900 border border-white' : 'bg-white border-2 border-gray-200'}`}>
                        <div className="text-center mb-4">
                            <p className="font-bold text-xl">Escala de Sunderland</p>
                            <p className="text-sm text-gray-500">Pontuação de 0 a 10</p>
                        </div>

                        {/* Score Display */}
                        <div className="flex items-center justify-center gap-4 mb-4">
                            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl font-black ${scoreApplied ? 'bg-green-500 text-white' : 'bg-blue-100 text-blue-800'}`}>
                                {manualScore}
                            </div>
                        </div>

                        {/* Criteria description */}
                        {currentCriteria && (
                            <div className={`text-center p-3 rounded-xl mb-4 ${highContrast ? 'bg-gray-800' : 'bg-blue-50'}`}>
                                <p className="font-medium">{currentCriteria.description}</p>
                            </div>
                        )}

                        {/* Slider */}
                        <div className="mb-4">
                            <input
                                type="range"
                                min={0}
                                max={10}
                                step={1}
                                value={manualScore}
                                onChange={(e) => setManualScore(Number(e.target.value))}
                                className="w-full h-4 rounded-lg appearance-none cursor-pointer"
                                style={{
                                    background: `linear-gradient(to right, #ef4444 0%, #f59e0b 30%, #22c55e 70%, #22c55e 100%)`
                                }}
                                disabled={isAnalyzing}
                            />
                            <div className="flex justify-between text-sm text-gray-500 mt-1">
                                <span>0</span>
                                <span>5</span>
                                <span>10</span>
                            </div>
                        </div>

                        {/* Quick select buttons */}
                        <div className="grid grid-cols-6 gap-2 mb-4">
                            {[10, 8, 6, 4, 2, 0].map((score) => (
                                <button
                                    key={score}
                                    onClick={() => setManualScore(score)}
                                    className={`py-2 rounded-lg font-bold text-lg transition-all
                                        ${manualScore === score
                                            ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                                    disabled={isAnalyzing}
                                >
                                    {score}
                                </button>
                            ))}
                        </div>

                        <BigButton
                            onClick={() => applyScore(manualScore)}
                            disabled={isAnalyzing}
                            variant={scoreApplied ? "success" : "primary"}
                        >
                            {scoreApplied ? '✓ Pontuação Registrada' : 'Registrar Pontuação'}
                        </BigButton>
                    </div>
                </div>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t-2 border-gray-200 shadow-lg">
                    <div className="max-w-lg mx-auto">
                        <BigButton
                            onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DELAYED_MEMORY })}
                            variant="success"
                            icon="→"
                        >
                            PRÓXIMO
                        </BigButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Fase de Reconhecimento
const RecognitionPhase: React.FC<{
    dispatch: React.Dispatch<Action>;
    highContrast: boolean;
    foundWords: string[];
    responses: StageCapture;
    setMicActive: (active: boolean) => void;
    liveTranscript: string;
}> = ({ dispatch, highContrast, foundWords, responses, setMicActive, liveTranscript }) => {
    const [lastCount, setLastCount] = useState(0);

    useEffect(() => {
        speakText("Olhe para as figuras e diga em voz alta quais você viu antes.", 0.8);
        setMicActive(true);
    }, [setMicActive]);

    useEffect(() => {
        if (foundWords.length > lastCount) {
            playBeep(1000, 100);
            setLastCount(foundWords.length);
        }
    }, [foundWords.length, lastCount]);

    const progressLabels = ['Nome', 'M1', 'M2', 'M3', 'Animais', 'Relógio', 'M4', 'Reconh'];

    return (
        <div className={`min-h-screen pb-32 ${highContrast ? 'bg-black text-white' : 'bg-gradient-to-b from-blue-50 to-white'}`}>
            <MicrophoneIndicator isActive={true} transcript={liveTranscript} />

            <div className="max-w-4xl mx-auto p-4 pt-20">
                <ProgressSteps current={7} total={8} labels={progressLabels} />

                <div className="text-center mb-6">
                    <h2 className={`text-3xl md:text-4xl font-bold ${highContrast ? 'text-yellow-400' : 'text-blue-900'}`}>
                        8. Reconhecimento
                    </h2>
                </div>

                <InstructionCard
                    instruction="Diga em voz alta quais figuras você viu antes."
                    onSpeak={() => speakText("Diga em voz alta quais figuras você viu antes.", 0.8)}
                    highContrast={highContrast}
                />

                <div className="mb-6 bg-white rounded-3xl shadow-xl p-4 border-4 border-gray-200">
                    <img src={recognitionSheet} alt="Prancha de Reconhecimento" className="w-full h-auto max-h-[300px] object-contain mx-auto" />
                </div>

                <div className={`p-6 rounded-3xl shadow-xl mb-6 ${highContrast ? 'bg-gray-900 border-2 border-white' : 'bg-white border-2 border-gray-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">Figuras reconhecidas:</h3>
                        <span className="text-3xl font-black text-green-600">{foundWords.length}/10</span>
                    </div>

                    <div className="flex flex-wrap gap-3 min-h-[60px]">
                        {foundWords.length > 0 ? (
                            foundWords.map((word, idx) => (
                                <WordBadge key={idx} word={word} />
                            ))
                        ) : (
                            <p className="text-gray-400 text-lg">Aguardando respostas...</p>
                        )}
                    </div>

                    {responses.intrusions.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <p className="text-orange-600 font-bold mb-2">Distratores mencionados:</p>
                            <div className="flex flex-wrap gap-2">
                                {responses.intrusions.map((i, idx) => (
                                    <span key={idx} className="bg-orange-100 text-orange-700 px-3 py-1 rounded-lg text-sm">
                                        {i.raw}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t-2 border-gray-200 shadow-lg">
                    <div className="max-w-lg mx-auto">
                        <BigButton
                            onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.POST_TEST_CHECK })}
                            variant="success"
                            icon="✓"
                        >
                            FINALIZAR TESTE
                        </BigButton>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Verificacao pos-teste
const PostTestCheck: React.FC<{
    currentPatientId: string | null;
    scores: BBRCScores;
    dispatch: React.Dispatch<Action>;
}> = ({ currentPatientId, scores, dispatch }) => {
    const [interrupted, setInterrupted] = useState<boolean | null>(null);

    useEffect(() => {
        speakText("Teste concluído! Você foi interrompido durante o teste?", 0.8);
    }, []);

    const finish = () => {
        if (interrupted === null) return;
        dispatch({ type: 'FINISH_TEST', payload: { interrupted } });
        if (currentPatientId) {
            const finalScores = {
                ...scores,
                date: new Date().toISOString(),
                environment: { ...scores.environment!, hadInterruptions: interrupted }
            };
            addTestResult(currentPatientId, finalScores);
        }
        playBeep(600, 300);
        speakText("Resultados salvos com sucesso!", 0.8);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-green-50 to-white">
            <div className="max-w-lg w-full text-center space-y-8">
                <div className="text-7xl mb-4">✅</div>
                <h2 className="text-4xl font-bold text-green-800">
                    Teste Concluído!
                </h2>

                <div className="bg-white p-8 rounded-3xl shadow-xl">
                    <p className="text-2xl font-medium text-gray-700 mb-6">
                        Você foi interrompido durante o teste?
                    </p>
                    <div className="flex gap-4">
                        <BigButton
                            onClick={() => setInterrupted(false)}
                            variant={interrupted === false ? "success" : "secondary"}
                        >
                            NÃO
                        </BigButton>
                        <BigButton
                            onClick={() => setInterrupted(true)}
                            variant={interrupted === true ? "danger" : "secondary"}
                        >
                            SIM
                        </BigButton>
                    </div>
                </div>

                <BigButton
                    onClick={finish}
                    disabled={interrupted === null}
                    variant="success"
                    icon="📊"
                >
                    VER RESULTADOS
                </BigButton>
            </div>
        </div>
    );
};

// Tela de Resultados
const Results: React.FC<{
    scores: BBRCScores;
    currentPatientId: string;
    dispatch: React.Dispatch<Action>;
}> = ({ scores, currentPatientId, dispatch }) => {
    const patient = getPatientById(currentPatientId);

    useEffect(() => {
        speakText("Aqui estão os resultados do teste.", 0.8);
    }, []);

    if (!patient) return null;

    const results = [
        { label: 'Memória Imediata', value: scores.immediateMemory, max: 10, icon: '🧠' },
        { label: 'Memória Tardia', value: scores.delayedMemory, max: 10, icon: '💭' },
        { label: 'Fluência Verbal', value: scores.verbalFluency, max: null, icon: '🗣️' },
        { label: 'Desenho do Relógio (Sunderland)', value: scores.clockDrawing, max: 10, icon: '🕐' },
        { label: 'Reconhecimento', value: scores.recognition, max: 10, icon: '👁️' },
    ];

    return (
        <div className="min-h-screen p-6 bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">📊</div>
                    <h2 className="text-3xl font-bold text-blue-900">
                        Resultados
                    </h2>
                    <p className="text-xl text-gray-600 mt-2">{patient.name}</p>
                    <p className="text-gray-500">{new Date(scores.date).toLocaleDateString('pt-BR')}</p>
                </div>

                <div className="space-y-4 mb-8">
                    {results.map((r, idx) => (
                        <div key={idx} className="bg-white p-6 rounded-2xl shadow-md border-2 border-gray-100 flex items-center gap-4">
                            <span className="text-4xl">{r.icon}</span>
                            <div className="flex-1">
                                <p className="font-medium text-gray-600">{r.label}</p>
                                <p className="text-3xl font-black text-blue-700">
                                    {r.value}
                                    {r.max && <span className="text-lg text-gray-400">/{r.max}</span>}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>

                <BigButton
                    onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.DASHBOARD })}
                    variant="primary"
                    icon="🏠"
                >
                    VOLTAR AO INÍCIO
                </BigButton>
            </div>
        </div>
    );
};

// Dashboard de pacientes
const PatientDashboard: React.FC<{
    patients: Patient[];
    dispatch: React.Dispatch<Action>;
}> = ({ patients, dispatch }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen p-6 bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-3xl font-bold text-blue-900">Pacientes</h2>
                    <BigButton
                        onClick={() => dispatch({ type: 'SET_VIEW', payload: TestStage.REGISTRATION })}
                        variant="success"
                        icon="+"
                        className="w-auto"
                    >
                        Novo
                    </BigButton>
                </div>

                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="🔍 Buscar paciente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-5 text-xl border-2 border-gray-300 rounded-xl focus:border-blue-500"
                    />
                </div>

                <div className="space-y-4">
                    {filteredPatients.map(p => (
                        <div
                            key={p.id}
                            className="bg-white p-6 rounded-2xl shadow-md border-2 border-gray-100 flex items-center justify-between"
                        >
                            <div>
                                <h3 className="text-2xl font-bold text-gray-800">{p.name}</h3>
                                <p className="text-gray-500">{p.age} anos • {p.history.length} teste(s)</p>
                            </div>
                            <button
                                onClick={() => {
                                    dispatch({ type: 'SET_CURRENT_PATIENT', payload: p.id });
                                    dispatch({ type: 'START_TEST_SETUP', payload: p.id });
                                }}
                                className="bg-blue-600 text-white px-6 py-4 rounded-xl font-bold text-lg hover:bg-blue-500"
                            >
                                Iniciar Teste
                            </button>
                        </div>
                    ))}

                    {filteredPatients.length === 0 && (
                        <div className="text-center py-12 text-gray-400">
                            <p className="text-xl">Nenhum paciente encontrado</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ===========================================
// COMPONENTE PRINCIPAL
// ===========================================

const App: React.FC = () => {
    const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
    const [allPatients, setAllPatients] = useState<Patient[]>([]);

    // Estado global do microfone
    const [isMicGlobalActive, setIsMicGlobalActive] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState("");

    useEffect(() => {
        setAllPatients(getPatients());
        if (state.stage === TestStage.DASHBOARD) {
            setIsMicGlobalActive(false);
        }
    }, [state.stage]);

    const handleSpeechResult = useCallback((text: string, isFinal: boolean) => {
        setLiveTranscript(text);

        if (isFinal) {
            dispatch({ type: 'PROCESS_SPEECH', payload: text });
            setTimeout(() => setLiveTranscript(""), 1500);
        }
    }, []);

    const containerStyle = { fontSize: `${18 * state.fontSizeMultiplier}px` };
    const bgClass = state.highContrast ? 'bg-black text-white' : 'bg-slate-50 text-slate-900';

    const renderContent = () => {
        switch (state.stage) {
            case TestStage.DASHBOARD:
                if (allPatients.length === 0) {
                    return <WelcomeScreen dispatch={dispatch} patients={allPatients} />;
                }
                return <PatientDashboard patients={allPatients} dispatch={dispatch} />;

            case TestStage.REGISTRATION:
                return <SimpleRegistration dispatch={dispatch} tempData={state.tempPatientData} />;

            case TestStage.PRE_TEST_CHECK:
                return <PreTestCheck dispatch={dispatch} onEnableMic={() => setIsMicGlobalActive(true)} liveTranscript={liveTranscript} />;

            case TestStage.NAMING:
                return <MemoryPhase
                    key="naming"
                    title="Nomeação"
                    stepNumber={1}
                    instruction="Diga o nome de cada figura que você vê."
                    scoreKey="naming"
                    foundWords={state.currentStageFoundWords}
                    nextStage={TestStage.INCIDENTAL_MEMORY}
                    stage={state.stage}
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                />;

            case TestStage.INCIDENTAL_MEMORY:
                return <MemoryPhase
                    key="incidental"
                    title="Memória Incidental"
                    stepNumber={2}
                    instruction="Quais figuras você acabou de ver? Diga em voz alta."
                    scoreKey="incidentalMemory"
                    foundWords={state.currentStageFoundWords}
                    nextStage={TestStage.IMMEDIATE_MEMORY}
                    stage={state.stage}
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                />;

            case TestStage.IMMEDIATE_MEMORY:
                return <MemoryPhase
                    key="immediate"
                    title="Memória Imediata"
                    stepNumber={3}
                    instruction="Olhe bem para as figuras e tente memorizar."
                    scoreKey="immediateMemory"
                    foundWords={state.currentStageFoundWords}
                    nextStage={TestStage.LEARNING}
                    stage={state.stage}
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                />;

            case TestStage.LEARNING:
                return <MemoryPhase
                    key="learning"
                    title="Aprendizado"
                    stepNumber={4}
                    instruction="Memorize as figuras mais uma vez."
                    scoreKey="learning"
                    foundWords={state.currentStageFoundWords}
                    nextStage={TestStage.VERBAL_FLUENCY}
                    stage={state.stage}
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                />;

            case TestStage.VERBAL_FLUENCY:
                return <FluencyPhase
                    key="fluency"
                    list={state.verbalFluencyList}
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                />;

            case TestStage.CLOCK_DRAWING:
                return <ClockPhase
                    key="clock"
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                />;

            case TestStage.DELAYED_MEMORY:
                return <MemoryPhase
                    key="delayed"
                    title="Memória Tardia"
                    stepNumber={7}
                    instruction="Quais figuras eu mostrei há alguns minutos? Diga em voz alta."
                    scoreKey="delayedMemory"
                    foundWords={state.currentStageFoundWords}
                    nextStage={TestStage.RECOGNITION}
                    stage={state.stage}
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                    delayStart={state.timeStartedDelayed}
                />;

            case TestStage.RECOGNITION:
                return <RecognitionPhase
                    key="recognition"
                    dispatch={dispatch}
                    highContrast={state.highContrast}
                    foundWords={state.currentStageFoundWords}
                    responses={state.currentStageResponses}
                    setMicActive={setIsMicGlobalActive}
                    liveTranscript={liveTranscript}
                />;

            case TestStage.POST_TEST_CHECK:
                return <PostTestCheck
                    currentPatientId={state.currentPatientId}
                    scores={state.scores}
                    dispatch={dispatch}
                />;

            case TestStage.RESULTS:
                return <Results
                    scores={state.scores}
                    currentPatientId={state.currentPatientId!}
                    dispatch={dispatch}
                />;

            default:
                return <WelcomeScreen dispatch={dispatch} patients={allPatients} />;
        }
    };

    return (
        <div className={`min-h-screen font-sans transition-colors duration-300 ${bgClass}`} style={containerStyle}>
            <VoiceRecorder
                isListening={isMicGlobalActive}
                onResult={handleSpeechResult}
            />

            <main>
                {renderContent()}
            </main>
        </div>
    );
};

export default App;
