import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DocumentItem, Purchase, Subscription, Task } from '@/lib/types';

export type EditorRequest =
  | { kind: 'subscription'; id?: string; defaults?: Partial<Subscription> }
  | { kind: 'document'; id?: string; defaults?: Partial<DocumentItem> }
  | { kind: 'purchase'; id?: string; defaults?: Partial<Purchase> }
  | { kind: 'task'; id?: string; defaults?: Partial<Task> };

interface UIValue {
  editor: EditorRequest | null;
  openEditor: (req: EditorRequest) => void;
  closeEditor: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
}

const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [editor, setEditor] = useState<EditorRequest | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const openEditor = useCallback((req: EditorRequest) => setEditor(req), []);
  const closeEditor = useCallback(() => setEditor(null), []);
  const value = useMemo(
    () => ({
      editor,
      openEditor,
      closeEditor,
      paletteOpen,
      setPaletteOpen,
      notificationsOpen,
      setNotificationsOpen,
      mobileNavOpen,
      setMobileNavOpen,
    }),
    [editor, openEditor, closeEditor, paletteOpen, notificationsOpen, mobileNavOpen],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside <UIProvider>');
  return ctx;
}

export interface EditorProps<T> {
  open: boolean;
  id?: string;
  defaults?: Partial<T>;
  onClose: () => void;
}
