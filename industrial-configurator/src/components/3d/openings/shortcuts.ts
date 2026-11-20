// Keyboard shortcuts of the openings (T1d): Ctrl/⌘+C copy, Ctrl/⌘+V paste, Ctrl/⌘+D duplicate. Pure: the decision is
// unit-tested; `OpeningsShortcuts.tsx` binds it to the window.

export type OpeningShortcut = 'copy' | 'paste' | 'duplicate';

/** The parts of a KeyboardEvent the decision needs. */
export interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

export interface ShortcutContext {
  /** ⌘ on a Mac, Ctrl elsewhere. */
  isMac: boolean;
  /** An opening is selected. */
  hasSelection: boolean;
  /** Something was copied. */
  hasClipboard: boolean;
  /** The page has a text selection (the browser's own copy wins). */
  textSelected: boolean;
}

/** Same rule as the view keys (ViewToolbar): shortcuts never fire while the user types in a field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as { isContentEditable?: boolean; tagName?: string } | null;
  if (!el) return false;
  return el.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName ?? '');
}

/** Whether the platform is a Mac (⌘ is the shortcut modifier). */
export function isMacPlatform(nav: { platform?: string; userAgent?: string } | undefined): boolean {
  const s = `${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/i.test(s);
}

/**
 * The openings shortcut a key press asks for, or null to leave the event to the browser.
 * Copy and duplicate need a selected opening; paste needs a copy. Copy yields to the browser's copy while text is
 * selected in the page. Nothing fires while typing in a field, with Alt / Shift, or with the other platform's modifier.
 */
export function shortcutFor(e: ShortcutKey, ctx: ShortcutContext): OpeningShortcut | null {
  const mod = ctx.isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod || e.altKey || e.shiftKey || isTypingTarget(e.target)) return null;
  switch (e.key.toLowerCase()) {
    case 'c':
      return ctx.hasSelection && !ctx.textSelected ? 'copy' : null;
    case 'v':
      return ctx.hasClipboard ? 'paste' : null;
    case 'd':
      return ctx.hasSelection ? 'duplicate' : null;
    default:
      return null;
  }
}
