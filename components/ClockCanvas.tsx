import React, { useRef, useState, useEffect, useCallback } from 'react';

interface ClockCanvasProps {
  onSave: (base64: string) => void;
}

const ClockCanvas: React.FC<ClockCanvasProps> = ({ onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const pathsRef = useRef<ImageData[]>([]);
  const dprRef = useRef(1);

  // Responsive canvas size based on screen
  const getCanvasSize = () => {
    const maxSize = Math.min(window.innerWidth - 48, 400);
    return Math.max(280, maxSize);
  };

  const [canvasSize, setCanvasSize] = useState(getCanvasSize);

  useEffect(() => {
    const handleResize = () => setCanvasSize(getCanvasSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;

    const context = canvas.getContext('2d');
    if (context) {
      context.scale(dpr, dpr);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = '#000000';
      // Thicker line for better visibility on touch devices
      context.lineWidth = 3;
      contextRef.current = context;

      // Fill white background for better PNG export
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvasSize, canvasSize);
    }

    pathsRef.current = [];
  }, [canvasSize]);

  const saveSnapshot = () => {
    const canvas = canvasRef.current;
    if (canvas && contextRef.current) {
      const snapshot = contextRef.current.getImageData(0, 0, canvas.width, canvas.height);
      pathsRef.current.push(snapshot);
    }
  };

  const getCoordinates = useCallback((event: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { offsetX: 0, offsetY: 0 };

    if (event.touches && event.touches[0]) {
      const rect = canvas.getBoundingClientRect();
      return {
        offsetX: event.touches[0].clientX - rect.left,
        offsetY: event.touches[0].clientY - rect.top
      };
    }
    return { offsetX: event.offsetX, offsetY: event.offsetY };
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    saveSnapshot();
    const { offsetX, offsetY } = getCoordinates(e.nativeEvent);
    contextRef.current?.beginPath();
    contextRef.current?.moveTo(offsetX, offsetY);
    setIsDrawing(true);
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    contextRef.current?.closePath();
    setIsDrawing(false);
    if (canvasRef.current) {
      onSave(canvasRef.current.toDataURL("image/png"));
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const { offsetX, offsetY } = getCoordinates(e.nativeEvent);
    contextRef.current?.lineTo(offsetX, offsetY);
    contextRef.current?.stroke();
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (canvas && contextRef.current && pathsRef.current.length > 0) {
      const prev = pathsRef.current.pop()!;
      contextRef.current.putImageData(prev, 0, 0);
      onSave(canvas.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && contextRef.current) {
      saveSnapshot();
      contextRef.current.fillStyle = '#FFFFFF';
      contextRef.current.fillRect(0, 0, canvasSize, canvasSize);
      contextRef.current.strokeStyle = '#000000';
      onSave('');
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseUp={finishDrawing}
        onMouseMove={draw}
        onMouseLeave={finishDrawing}
        onTouchStart={startDrawing}
        onTouchEnd={finishDrawing}
        onTouchMove={draw}
        onTouchCancel={finishDrawing}
        className="border-2 border-slate-300 rounded-lg bg-white shadow-inner cursor-crosshair touch-none"
        style={{ width: `${canvasSize}px`, height: `${canvasSize}px` }}
      />
      <div className="flex gap-4">
        <button
          onClick={undo}
          disabled={pathsRef.current.length === 0}
          className="text-sm text-blue-600 underline hover:text-blue-800 disabled:text-gray-400 disabled:no-underline px-3 py-1"
        >
          Desfazer
        </button>
        <button
          onClick={clearCanvas}
          className="text-sm text-red-600 underline hover:text-red-800 px-3 py-1"
        >
          Limpar tudo
        </button>
      </div>
    </div>
  );
};

export default ClockCanvas;
