import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'نظام متابعة التراخيص والتجديدات',
  description: 'تنبيه مبكر قبل انتهاء التراخيص والشهادات والعقود',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// القاعدة الثابتة رقم ٣: الواجهة كلها عربية RTL بلا استثناء.
// lang و dir على <html> تجعلهما الافتراض لكل شيء تحتهما.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3
                     focus:rounded focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-white"
        >
          تخطَّ إلى المحتوى
        </a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
