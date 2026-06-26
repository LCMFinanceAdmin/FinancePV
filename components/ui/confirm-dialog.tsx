"use client";
import { AlertCircle } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

// App-styled stand-in for window.confirm()/alert() — used for any action
// that needs a yes/no confirmation, instead of the native browser dialog.
export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${danger ? "bg-red-100" : "bg-amber-100"}`}>
            <AlertCircle size={18} className={danger ? "text-red-600" : "text-amber-600"} />
          </div>
          <div>
            <h3 className="font-bold text-stone-800 text-sm">{title}</h3>
            <p className="text-sm text-stone-600 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm text-stone-600 hover:bg-stone-100 transition-colors">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-4 py-2 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
