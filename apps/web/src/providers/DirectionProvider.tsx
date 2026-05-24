'use client';

import { createContext, useContext, type ReactNode } from 'react';

interface DirectionContextValue {
  locale: string;
  dir: 'rtl' | 'ltr';
  isRtl: boolean;
}

const DirectionContext = createContext<DirectionContextValue>({
  locale: 'ar',
  dir: 'rtl',
  isRtl: true,
});

export function DirectionProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const isRtl = locale === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';

  return (
    <DirectionContext.Provider value={{ locale, dir, isRtl }}>
      {children}
    </DirectionContext.Provider>
  );
}

export function useDirection() {
  return useContext(DirectionContext);
}
