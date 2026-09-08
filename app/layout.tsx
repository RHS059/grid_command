import type { Metadata, Viewport } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

const archivo = Archivo({ subsets: ['latin'], display: 'swap', variable: '--font-archivo' })
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-jetbrains' })
export const metadata: Metadata = {
  title: 'Grid Command — Pacific Shield',
  description: 'Observe autonomous commanders build their forces from scratch on a real 3D San Diego map, with third-person asset tracking, scheduled supplies, troop airlift, and fuel, ammunition and facility-based repairs.',
}
export const viewport: Viewport = { colorScheme: 'dark', themeColor: '#0b1119', width: 'device-width', initialScale: 1 }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`dark bg-background ${archivo.variable} ${mono.variable}`}><body className="font-sans"><TooltipProvider delay={350}>{children}</TooltipProvider></body></html>
}
