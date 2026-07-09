"use client";

import { useRef, useEffect, useState } from "react";

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export function SignaturePad({ value, onChange, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Draw saved signature when value changes externally
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
      setIsEmpty(false);
    } else {
      setIsEmpty(true);
    }
  }, [value]);

  function getPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return;
    drawing.current = true;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e.nativeEvent as MouseEvent | TouchEvent, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1c1917";
    const pos = getPos(e.nativeEvent as MouseEvent | TouchEvent, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setIsEmpty(false);
  }

  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current!;
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    if (disabled) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
    onChange("");
  }

  // A disabled box with a saved signature is styled distinctly from an empty
  // one, so a small/faint stroke doesn't get mistaken for "not signed".
  const signedLocked = disabled && !isEmpty;

  return (
    <div className="space-y-1.5">
      <div className={`relative border rounded-xl overflow-hidden ${
        signedLocked ? "bg-green-50/50 border-green-200" : disabled ? "bg-stone-50 border-stone-200" : "border-stone-300 bg-white"}`}>
        <canvas
          ref={canvasRef}
          width={480}
          height={140}
          className="w-full touch-none"
          style={{ cursor: disabled ? "default" : "crosshair" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {isEmpty && !disabled && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-stone-300">Draw signature here</span>
          </div>
        )}
        {signedLocked && (
          <span className="absolute bottom-1.5 right-2 text-[9px] font-bold text-green-600 bg-white/80 px-1.5 py-0.5 rounded-full pointer-events-none">
            Signed
          </span>
        )}
      </div>
      {!disabled && !isEmpty && (
        <button type="button" onClick={clear}
          className="text-[11px] text-stone-400 hover:text-red-500 transition-colors">
          Clear
        </button>
      )}
    </div>
  );
}
