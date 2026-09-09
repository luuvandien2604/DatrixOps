'use client';

import React from 'react';
import { AlertTriangle, Trash2, HelpCircle, X, Loader2 } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const defaultTitle = isDanger
    ? 'Confirm Deletion'
    : isWarning
      ? 'Warning'
      : 'Confirmation Required';

  const finalTitle = title || defaultTitle;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl animate-in zoom-in-95 duration-150"
      >
        <div className="p-5 flex items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
              isDanger
                ? 'bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-300'
                : isWarning
                  ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300'
                  : 'bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300'
            }`}
          >
            {isDanger ? (
              <Trash2 className="h-5 w-5" />
            ) : isWarning ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <HelpCircle className="h-5 w-5" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center justify-between">
              <h3
                id="confirm-modal-title"
                className="text-base font-bold text-[var(--foreground)]"
              >
                {finalTitle}
              </h3>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                aria-label="Close dialog"
                className="rounded-lg p-1 text-[var(--color-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] transition disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]/80 dark:text-slate-300 leading-relaxed font-normal">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border-color)] bg-[var(--surface-subtle)] px-5 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-9 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] hover:bg-[var(--surface-hover)] text-xs font-bold text-[var(--foreground)] transition disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`h-9 px-4 rounded-xl text-xs font-bold text-white transition inline-flex items-center gap-2 shadow-sm disabled:opacity-50 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                : isWarning
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
            }`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
