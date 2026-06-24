import type { Metadata } from 'next';
import 'react-international-phone/style.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Allomed booking',
  description: 'Book and manage your clinic appointment.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
