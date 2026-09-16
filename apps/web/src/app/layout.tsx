import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Masarat ERP',
  description: 'Masarat ERP',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
