import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'مسارات | Masarat ERP',
  description: 'نظام إدارة وكالات السفر المتكامل — Travel Agency Management System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
