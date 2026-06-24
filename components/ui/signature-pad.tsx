"use client";
import { useRef, useCallback, useEffect } from "react";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  value: string;
  onChange: (dataUrl: string) => void;
  height?: number;
  disabled?: boolean;
}

interface Point { x: number; y: number }

export function SignaturePad({ value, onChange, height = 120, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  // Where the previously-drawn curve segment actually ended. Each new segment
  // must start exactly here (not from the raw last point) so consecutive
  // segments stay connected — otherwise fast/high-frequency input (trackpad,
  // fine touch) produces a chain of near-zero-length strokes that render as
  // dots instead of a continuous line, because of the round line cap.
  const lastMidRef = useRef<Point | null>(null);
  const dprRef = useRef(1);

  // Resync the canvas's backing resolution to its actual rendered size × device
  // pixel ratio, so strokes stay crisp instead of blurry/blocky on touch screens
  // (and don't go stretched/jagged when the container's width changes).
  const syncResolution = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    // setTransform (not scale) so re-syncing on resize doesn't compound the
    // scale factor on top of whatever was set last time.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    if (value) {
      const img = new window.Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
    }
  }, [value]);

  useEffect(() => {
    syncResolution();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncResolution());
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement): Point {
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;
    return { x, y };
  }

  const start = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    drawingRef.current = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    lastPointRef.current = pos;
    lastMidRef.current = pos;
    // Draw a dot so a single tap still registers as a mark.
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle as string;
    ctx.fill();
  }, [disabled]);

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const pos = getPos(e, canvas);
    const last = lastPointRef.current;
    const lastMid = lastMidRef.current;
    if (last && lastMid) {
      // Quadratic curve through the midpoint of consecutive points smooths out
      // the jagged, segmented look of plain lineTo strokes. Each segment must
      // start exactly where the previous one ended (lastMid) — starting from
      // the raw last point instead produces disconnected micro-segments that
      // render as dots whenever points are close together.
      const mid = { x: (last.x + pos.x) / 2, y: (last.y + pos.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(lastMid.x, lastMid.y);
      ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
      ctx.stroke();
      lastMidRef.current = mid;
    }
    lastPointRef.current = pos;
  }, [disabled]);

  const stop = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e?.preventDefault();
    drawingRef.current = false;
    lastPointRef.current = null;
    lastMidRef.current = null;
    const canvas = canvasRef.current; if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }, [onChange]);

  function clear() {
    if (disabled) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width / dprRef.current, canvas.height / dprRef.current);
    onChange("");
  }

  return (
    <div className="space-y-1.5">
      <div className={`border-2 border-dashed rounded-xl overflow-hidden bg-white ${disabled ? "border-stone-200 opacity-60" : "border-stone-300"}`} style={{ touchAction: "none" }}>
        <canvas ref={canvasRef} style={{ height, width: "100%", display: "block" }} className={disabled ? "" : "cursor-crosshair"}
          onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={move} onTouchEnd={stop} onTouchCancel={stop} />
      </div>
      {!disabled && (
        <button type="button" onClick={clear} className="flex items-center gap-1 text-xs text-stone-400 hover:text-red-500 transition-colors">
          <Eraser size={12} /> Clear
        </button>
      )}
    </div>
  );
}
