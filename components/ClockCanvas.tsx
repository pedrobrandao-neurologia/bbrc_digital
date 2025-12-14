import React, { useRef, useState, useEffect } from 'react';

interface ClockCanvasProps {
  onSave: (base64: string) => void;
}

const ClockCanvas: React.FC<ClockCanvasProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Support high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const context = canvas.getContext('2d');
    if (context) {
      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.strokeStyle = 'black';
      context.lineWidth = 2;
      contextRef.current = context;
    }
  }, []);

  const startDrawing = ({ nativeEvent }: React.MouseEvent | React.TouchEvent) => {
    const { offsetX, offsetY } = getCoordinates(nativeEvent);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const finishDrawing = () => {
    contextRef.current?.closePath();
    setIsDrawing(false);
    if (canvasRef.current) {
      onSave(canvasRef.current.toDataURL("image/png"));
    }
  };

  const draw = ({ nativeEvent }: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = getCoordinates(nativeEvent);
    contextRef.current?.lineTo(offsetX, offsetY);
    contextRef.current?.stroke();
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getCoordinates = (event: any) => {
    if (event.touches && event.touches[0]) {
      const rect = canvasRef.current!.getBoundingClientRect();
      return {
        offsetX: event.touches[0].clientX - rect.left,
        offsetY: event.touches[0].clientY - rect.top
      };
    }
    return { offsetX: event.offsetX, offsetY: event.offsetY };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && contextRef.current) {
      contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
      onSave(''); 
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={finishDrawing}
        onMouseMove={draw}
        onTouchStart={startDrawing}
        onTouchEnd={finishDrawing}
        onTouchMove={draw}
        className="border-2 border-slate-300 rounded-lg bg-white shadow-inner cursor-crosshair touch-none"
        style={{ width: '350px', height: '350px' }}
      />
      <button 
        onClick={clearCanvas}
        className="text-sm text-red-600 underline hover:text-red-800"
      >
        Limpar desenho
      </button>
    </div>
  );
};

export default ClockCanvas;