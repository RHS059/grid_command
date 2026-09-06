import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const geist = Geist({ subsets: ['latin'], display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' })
export const metadata: Metadata = {
  title: 'Grid Command — Pacific Shield',
  description: 'Observe autonomous commanders build their forces from scratch on a real 3D San Diego map, with third-person asset tracking, scheduled supplies, troop airlift, and fuel, ammunition and facility-based repairs.',
}
export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0b1119', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`dark bg-background ${geist.className} ${mono.variable}`}><body className="font-sans"><TooltipProvider delay={350}>{children}</TooltipProvider></body></html>
}
