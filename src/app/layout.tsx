import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Toaster } from 'sonner';
import { Header } from '@/components/header';

const inter = Inter({
    variable: '--font-inter',
    subsets: ['latin'],
    weight: ['400', '500', '700'],
});

const interTight = Inter({
    variable: '--font-inter-tight',
    subsets: ['latin'],
    weight: ['700'],
});

export const metadata: Metadata = {
    title: 'Mundo Pet',
    description:
        'Aqui você pode ver todos os cliente e serviços agendados para hoje',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${inter.variable} ${interTight.variable} antialiased`}
            >
                <Header />
                <div className="max-w-3xl mx-auto">
                    <main className="flex-1 flex flex-col mt-12">
                        {children}
                        <Toaster position="top-right" />
                    </main>
                </div>
            </body>
        </html>
    );
}
