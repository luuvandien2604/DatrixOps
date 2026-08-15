export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) throw new Error('Nothing to copy');

  if (typeof window !== 'undefined' && window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for denied clipboard permissions.
    }
  }

  if (typeof document === 'undefined') throw new Error('Clipboard is unavailable');

  const textarea = document.createElement('textarea');
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  Object.assign(textarea.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand('copy')) throw new Error('Copy command was rejected');
  } finally {
    textarea.remove();
    activeElement?.focus({ preventScroll: true });
  }
}
