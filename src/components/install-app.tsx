'use client';
import {useEffect,useState} from 'react';
type InstallEvent=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function InstallApp() {
  const [prompt,setPrompt]=useState<InstallEvent|null>(null);const [installed,setInstalled]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{
    setInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const listener=(e:Event)=>{e.preventDefault();setPrompt(e as InstallEvent);};const done=()=>{setInstalled(true);setPrompt(null);};
    window.addEventListener('beforeinstallprompt',listener);window.addEventListener('appinstalled',done);
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(()=>setError('Не удалось подготовить установку. Обновите страницу при подключении к сети.'));
    return()=>{window.removeEventListener('beforeinstallprompt',listener);window.removeEventListener('appinstalled',done);};
  },[]);
  return <section className="panel install-panel"><h2>Qarzhy на телефоне</h2>{installed?<p className="success">Приложение открыто в отдельном окне.</p>:<><p>Android: меню браузера → «Установить приложение» или «Добавить на главный экран». iPhone: Safari → «Поделиться» → «На экран Домой».</p>{prompt&&<button className="button primary" onClick={async()=>{try{await prompt.prompt();await prompt.userChoice;setPrompt(null);}catch{setError('Откройте меню браузера для установки.');}}}>Установить Qarzhy</button>}</>}<p className="muted">Для входа и работы с финансами нужен интернет. Для установки на телефон нужен опубликованный HTTPS-адрес: локальный адрес компьютера на телефоне не откроется. Напоминания о платежах показываются внутри приложения, без фоновых push-уведомлений.</p>{error&&<p className="error-message" role="alert">{error}</p>}</section>;
}
