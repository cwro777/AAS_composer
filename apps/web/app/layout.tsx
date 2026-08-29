import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AAS Composer',
  description: 'IEC 63278 V3.0 자산 관리 셸 저작 도구',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
