import React, { useState, useEffect, useRef } from 'react';

interface VoiceRecorderProps {
  onResult: (transcript: string, isFinal: boolean) => void;
  isListening: boolean;
  language?: string;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onResult,
  isListening,
  language = 'pt-BR'
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isActuallyListening, setIsActuallyListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isMounted = useRef(true);
  const shouldBeListening = useRef(isListening);

  useEffect(() => {
    shouldBeListening.current = isListening;
    if (isListening) {
        startRecognition();
    } else {
        stopRecognition();
    }
  }, [isListening]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      stopRecognition();
    };
  }, []);

  const startRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      setError("Seu navegador não suporta reconhecimento de voz. Use o Chrome ou Edge.");
      return;
    }

    if (recognitionRef.current) {
        return;
    }

    try {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language;

      recognition.onstart = () => {
        if (isMounted.current) {
          setError(null);
          setIsActuallyListening(true);
        }
      };

      recognition.onresult = (event: any) => {
        if (!isMounted.current) return;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          const isFinal = event.results[i].isFinal;
          onResult(transcript, isFinal);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;

        if (event.error === 'not-allowed') {
             setError("Microfone bloqueado. Permita o acesso ao microfone nas configurações do navegador.");
             setIsActuallyListening(false);
        } else if (event.error === 'audio-capture') {
             setError("Nenhum microfone detectado. Conecte um microfone e tente novamente.");
             setIsActuallyListening(false);
        } else {
             console.warn("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (isMounted.current) {
          setIsActuallyListening(false);
        }
        if (isMounted.current && shouldBeListening.current) {
            setTimeout(() => {
                startRecognition();
            }, 100);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

    } catch (e) {
      console.error("Failed to start recognition", e);
      setError("Erro ao iniciar o microfone. Recarregue a página.");
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsActuallyListening(false);
  };

  // Nao mostrar nada se nao estiver ouvindo e nao houver erro
  if (!isListening && !error) return null;

  // Mostrar erro de forma proeminente
  if (error) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 bg-red-600 text-white p-4 rounded-2xl shadow-xl flex items-center gap-4 animate-pulse">
        <span className="text-4xl">⚠️</span>
        <div className="flex-1">
          <p className="font-bold text-lg">Problema com o microfone</p>
          <p className="text-sm opacity-90">{error}</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            startRecognition();
          }}
          className="bg-white text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-100"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // Indicador discreto no canto (o indicador principal esta no App.tsx)
  return (
    <div className="fixed bottom-4 right-4 z-40 pointer-events-none">
      <div className={`p-3 rounded-full transition-all duration-300 shadow-lg
        ${isActuallyListening ? 'bg-green-500 ring-4 ring-green-200' : 'bg-gray-300'}`}
      >
        {isActuallyListening && (
           <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50"></span>
        )}

        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isActuallyListening ? 'text-white' : 'text-gray-500'}
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
      </div>
    </div>
  );
};

export default VoiceRecorder;
