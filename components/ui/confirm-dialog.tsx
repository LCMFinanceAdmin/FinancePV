"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: string;
  /**
   * What is being confirmed.
   *
   * A node rather than a string, because the questions worth asking are rarely
   * one sentence: deleting a correction has the figure it carries, the month it
   * lands in and what happens to that month afterwards, and running those
   * together into one paragraph is how people end up agreeing to the wrong one.
   */
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, loading, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
        <h3 className="font-bold text-stone-800 text-base">{title}</h3>
        <div className="space-y-1.5 text-sm leading-relaxed text-stone-600">{message}</div>
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button
            onClick={onConfirm}
            loading={loading}
            className={danger ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : ""}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
