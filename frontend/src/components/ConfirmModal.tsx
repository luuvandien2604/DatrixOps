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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-md overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100"
      >
        <div className="p-5 flex items-start gap-4">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border ${
              isDanger
                ? 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-400'
                : isWarning
                  ? 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-400'
                  : 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-400'
            }`}
          >
            {isDanger ? (
              <Trash2 className="h-4 w-4" />
            ) : isWarning ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <HelpCircle className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center justify-between">
              <h3
                id="confirm-modal-title"
                className="text-sm font-bold text-[var(--foreground)]"
              >
                {finalTitle}
              </h3>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                aria-label="Close dialog"
                className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] transition duration-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-muted)] leading-relaxed font-normal">
              {message}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-2)] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100 disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`h-8 px-3.5 rounded-sm text-xs font-bold text-white transition duration-100 inline-flex items-center gap-1.5 disabled:opacity-50 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-500'
                : isWarning
                  ? 'bg-amber-600 hover:bg-amber-500'
                  : 'bg-blue-600 hover:bg-blue-500'
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
