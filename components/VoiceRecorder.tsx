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
  const recognitionRef = useRef<any>(null);
  const isMounted = useRef(true);
  const shouldBeListening = useRef(isListening);

  // Sync ref with prop
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
      setError("Navegador incompatível.");
      return;
    }

    if (recognitionRef.current) {
        // Already running
        return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.continuous = true; 
      recognition.interimResults = true; // Crucial for "fast" feedback
      recognition.lang = language;

      recognition.onstart = () => {
        if (isMounted.current) setError(null);
      };

      recognition.onresult = (event: any) => {
        if (!isMounted.current) return;
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          const isFinal = event.results[i].isFinal;
          // Send everything to parent for instant feedback, parent handles logic
          onResult(transcript, isFinal);
        }
      };

      recognition.onerror = (event: any) => {
        // Ignore "no-speech" errors as they are normal pauses
        if (event.error === 'no-speech') return;
        
        if (event.error === 'not-allowed') {
             setError("Microfone bloqueado. Habilite nas configurações do navegador.");
        } else {
             console.warn("Speech recognition error:", event.error);
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        // Auto-restart if we are supposed to be listening
        if (isMounted.current && shouldBeListening.current) {
            // Small delay to prevent CPU thrashing if it fails repeatedly
            setTimeout(() => {
                startRecognition();
            }, 150);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

    } catch (e) {
      console.error("Failed to start recognition", e);
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current) {
      // Unbind onend to prevent auto-restart during intentional stop
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  if (!isListening && !error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-center gap-2 pointer-events-none opacity-80">
      <div 
        className={`relative p-3 rounded-full transition-all duration-300 flex items-center justify-center shadow-lg
        ${error ? 'bg-red-100 ring-4 ring-red-200' : 'bg-white ring-4 ring-medical-100'}`}
      >
        {isListening && !error && (
           <span className="absolute w-full h-full rounded-full bg-green-500 opacity-20 animate-ping"></span>
        )}
        
        {error ? (
             <span className="text-2xl">⚠️</span>
        ) : (
            <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            className="text-medical-600"
            >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
        )}
      </div>
      {error && (
          <div className="bg-red-600 text-white text-xs px-2 py-1 rounded shadow-md max-w-[150px] text-center">
              {error}
          </div>
      )}
    </div>
  );
};

export default VoiceRecorder;