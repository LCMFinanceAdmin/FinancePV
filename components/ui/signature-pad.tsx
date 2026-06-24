"use client";
import { useRef, useCallback, useEffect } from "react";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  height?: number;
  disabled?: boolean;
}

export function SignaturePad({ value, onChange, height = 110, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    return { x, y };
  }

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    drawingRef.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.beginPath(); ctx.moveTo(x, y);
  }, [disabled]);

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current || disabled) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const { x, y } = getPos(e, canvas);
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(x, y); ctx.stroke();
    onChange(canvas.toDataURL("image/png"));
  }, [disabled, onChange]);

  const stop = useCallback(() => { drawingRef.current = false; }, []);

  function clear() {
    if (disabled) return;
    const canvas = canvasRef.current; if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  // Re-draw an existing value (e.g. when reopening a saved worksheet).
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!value) return;
    const img = new window.Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1.5">
      <div className={`border-2 border-dashed rounded-xl overflow-hidden bg-white ${disabled ? "border-stone-200 opacity-60" : "border-stone-300"}`} style={{ touchAction: "none" }}>
        <canvas ref={canvasRef} width={460} height={height} className={`w-full ${disabled ? "" : "cursor-crosshair"}`}
          onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={move} onTouchEnd={stop} />
      </div>
      {!disabled && (
        <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-stone-400 hover:text-red-500 transition-colors">
          <Eraser size={12} /> Clear
        </button>
      )}
    </div>
  );
}
