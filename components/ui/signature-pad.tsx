"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export function SignaturePad({ value, onChange, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const logicalSize = useRef({ width: 0, height: 0 }); // CSS-pixel size the context is scaled for
  const [isEmpty, setIsEmpty] = useState(!value);

  // Paints whatever should currently be showing (a saved signature, or
  // nothing) at the canvas's current logical size.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height } = logicalSize.current;
    ctx.clearRect(0, 0, width, height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, width, height);
      img.src = value;
    }
  }, [value]);

  // Matches the canvas's internal pixel buffer to its actual on-screen size
  // times the device's pixel ratio, then scales the drawing context so every
  // coordinate can still be expressed in ordinary CSS pixels. A fixed
  // low-resolution buffer (e.g. 480x140) stretched across a wider box — and
  // especially on a retina screen, where "140 CSS px tall" still needs 280+
  // physical pixels to look sharp — is what made signatures look pixelated.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    logicalSize.current = { width, height };
    redraw();
  }, [redraw]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsEmpty(!value);
    redraw();
  }, [value, redraw]);

  // Position in ordinary CSS pixels relative to the canvas — no manual scale
  // factor needed since the context is already scaled to match in resize().
  function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (disabled) return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const pos = getPos(e.nativeEvent as MouseEvent | TouchEvent);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current || disabled) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.lineWidth = 2.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1917";
    const pos = getPos(e.nativeEvent as MouseEvent | TouchEvent);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setIsEmpty(false);
  }

  function endDraw() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    if (disabled) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { width, height } = logicalSize.current;
    ctx.clearRect(0, 0, width, height);
    setIsEmpty(true);
    onChange("");
  }

  // A disabled box with a saved signature is styled distinctly from an empty
  // one, so a small/faint stroke doesn't get mistaken for "not signed".
  const signedLocked = disabled && !isEmpty;

  return (
    <div className="space-y-1.5">
      <div ref={containerRef} style={{ height: 140 }}
        className={`relative border rounded-xl overflow-hidden ${
          signedLocked ? "bg-green-50/50 border-green-200" : disabled ? "bg-stone-50 border-stone-200" : "border-stone-300 bg-white"}`}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none"
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
