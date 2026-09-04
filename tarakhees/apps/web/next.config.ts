import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // الحزمة المشتركة تُستهلك من الشيفرة المصدرية داخل الـ workspace
  transpilePackages: ['@repo/shared'],
};

export default nextConfig;
