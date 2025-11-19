import React, { useRef, useEffect, useState } from 'react';
import { Eraser } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  onEnd: (dataUrl: string | null) => void;
}

const SignaturePad: React.FC<SignaturePadProps> = ({ label, onEnd }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);

  const getTouchPos = (canvasDom: HTMLCanvasElement, touchEvent: TouchEvent) => {
    const rect = canvasDom.getBoundingClientRect();
    return {
      x: touchEvent.touches[0].clientX - rect.left,
      y: touchEvent.touches[0].clientY - rect.top
    };
  };

  const getMousePos = (canvasDom: HTMLCanvasElement, mouseEvent: MouseEvent) => {
    const rect = canvasDom.getBoundingClientRect();
    return {
      x: mouseEvent.clientX - rect.left,
      y: mouseEvent.clientY - rect.top
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set resolution for high DPI displays
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
    }

    // Prevent scrolling when touching canvas
    const preventScroll = (e: TouchEvent) => {
        if(e.target === canvas) {
            e.preventDefault();
        }
    }
    canvas.addEventListener('touchstart', preventScroll, { passive: false });
    canvas.addEventListener('touchmove', preventScroll, { passive: false });
    
    return () => {
        canvas.removeEventListener('touchstart', preventScroll);
        canvas.removeEventListener('touchmove', preventScroll);
    }

  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    setIsEmpty(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    
    let pos;
    if ('touches' in e.nativeEvent) {
       pos = getTouchPos(canvas, e.nativeEvent as unknown as TouchEvent);
    } else {
       pos = getMousePos(canvas, e.nativeEvent as unknown as MouseEvent);
    }
    
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let pos;
    if ('touches' in e.nativeEvent) {
       pos = getTouchPos(canvas, e.nativeEvent as unknown as TouchEvent);
    } else {
       pos = getMousePos(canvas, e.nativeEvent as unknown as MouseEvent);
    }

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onEnd(canvas.toDataURL());
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setIsEmpty(true);
    onEnd(null);
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <label className="block text-sm font-semibold text-slate-700">{label}</label>
        <button
          type="button"
          onClick={clear}
          className="text-xs flex items-center text-red-500 hover:text-red-700"
        >
          <Eraser className="w-3 h-3 mr-1" /> Clear
        </button>
      </div>
      <div className="relative h-40 w-full border-2 border-dashed border-slate-300 rounded bg-slate-50 touch-none">
        <canvas
          ref={canvasRef}
          className="w-full h-full block cursor-crosshair"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={endDrawing}
          onMouseLeave={endDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={endDrawing}
        />
        {isEmpty && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-sm">
                Sign Here
            </div>
        )}
      </div>
    </div>
  );
};

export default SignaturePad;