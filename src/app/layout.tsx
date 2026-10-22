import type {Metadata, Viewport} from 'next';
import {MotionPreferencesProvider} from '@/components/motion-preferences';
import {InteractionFeedback} from '@/components/interaction-feedback';
import './globals.css';
import './night.css';
import './accounts.css';
import './calendar.css';
export const viewport: Viewport = {themeColor:'#08110f'};
export const metadata: Metadata = {title: 'Qarzhy — ваши финансы, яснее', description: 'Личный финансовый помощник: учёт в тенге, аналитика и цели.', appleWebApp:{capable:true,title:'Qarzhy',statusBarStyle:'black-translucent'},icons:{icon:[{url:'/brand/qarzhy-focus-icon.svg',type:'image/svg+xml'},{url:'/favicon-32.png',sizes:'32x32',type:'image/png'}],apple:[{url:'/apple-touch-icon.png',sizes:'180x180',type:'image/png'}]},robots: {index: false, follow: false}};
export default function RootLayout({children}: {children: React.ReactNode}) {
  return <html lang="ru"><body><MotionPreferencesProvider><InteractionFeedback/>{children}</MotionPreferencesProvider></body></html>;
}
