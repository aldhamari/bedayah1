import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام متابعة التراخيص والتجديدات',
  description: 'تنبيه مبكر قبل انتهاء التراخيص والشهادات والعقود',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
