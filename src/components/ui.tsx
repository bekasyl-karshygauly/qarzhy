'use client';
import {useAppReducedMotion} from './motion-preferences';
import {useEffect, useRef, type FormEvent} from 'react';
import {motion} from 'motion/react';
import {X} from 'lucide-react';
export function validatedSubmit(handler: (event: FormEvent<HTMLFormElement>) => void | Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) void handler(event);
  };
}
export async function api<T = {ok: boolean}>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/${path}`, {credentials: 'same-origin', cache: 'no-store', ...options, headers: {...(options.body && typeof options.body === 'string' ? {'Content-Type': 'application/json'} : {}), ...options.headers}});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}
export function Modal({title, children, onClose}: {title: string; children: React.ReactNode; onClose: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  const reducedMotion = useAppReducedMotion();
  useEffect(() => {const dialog = ref.current; const previous = document.activeElement as HTMLElement; dialog?.showModal(); return () => {dialog?.close(); previous?.focus();};}, []);
  return <motion.dialog ref={ref} aria-labelledby="modal-title" onCancel={onClose} className="modal" initial={reducedMotion ? false : {opacity: 0, y: 12, scale: .985}} animate={{opacity: 1, y: 0, scale: 1}} transition={{duration: reducedMotion ? 0 : .24, ease: [.22, 1, .36, 1]}}><div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть"><X size={20}/></button></div>{children}</motion.dialog>;
}
export function ErrorMessage({message}: {message: string}) {
  const reducedMotion = useAppReducedMotion();
  return message ? <motion.p key={message} className="error-message" role="alert" initial={reducedMotion ? false : {opacity: 0, y: 4}} animate={{opacity: 1, y: 0}} transition={{duration: reducedMotion ? 0 : .18, ease: 'easeOut'}}>{message}</motion.p> : null;
}
export function Empty({title, text, children}: {title: string; text: string; children?: React.ReactNode}) {return <div className="empty"><span className="empty-mark" aria-hidden="true">↗</span><h3>{title}</h3><p>{text}</p>{children}</div>;}
