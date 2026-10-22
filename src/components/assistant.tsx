'use client';
import {useAppReducedMotion} from './motion-preferences';
import {useEffect, useRef, useState, type FormEvent} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowUp, AudioLines, Mic, Square, Volume2, Sparkles} from 'lucide-react';
import {validatedSubmit, api, ErrorMessage} from './ui';
export type Profile = {id: string; name: string; email: string; aiConsent: boolean; voiceConsent: boolean; provider: {configured: boolean; voiceConfigured: boolean; name: string; country: string; contextMode?: 'general' | 'financial'; dataPolicy?: 'google-unpaid' | 'standard'}};
export function Assistant({profile, month, openSettings}: {profile: Profile; month: string; openSettings: () => void}) {
  const reducedMotion = useAppReducedMotion();
  const [message, setMessage] = useState(''); const [messages, setMessages] = useState<{role: string; text: string}[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null); const stream = useRef<MediaStream | null>(null); const timeout = useRef<ReturnType<typeof setTimeout> | null>(null); const mounted = useRef(true);
  useEffect(() => {mounted.current = true; return () => {mounted.current = false; if (timeout.current) clearTimeout(timeout.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); window.speechSynthesis?.cancel();};}, []);
  const ready = profile.provider.configured && profile.aiConsent;
  const general = profile.provider.contextMode === 'general';
  const suggestions = general ? ['Как вести личный бюджет?', 'Для чего нужна финансовая подушка?', 'Как избежать импульсивных покупок?'] : ['Какая категория занимает больше всего в расходах?', 'Как составить план накоплений?', 'Помоги подвести итоги месяца'];
  async function send(e: FormEvent) {
    e.preventDefault(); if (!message.trim() || busy) return; setBusy(true); setError(''); const text = message;
    try {const result = await api<{answer: string}>('assistant', {method: 'POST', body: JSON.stringify({message: text, month})}); setMessages(old => [...old, {role: 'user', text}, {role: 'assistant', text: result.answer}]); setMessage('');}
    catch(e) {setError((e as Error).message);} finally {setBusy(false);}
  }
  async function startRecording() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {setError('Этот браузер не поддерживает запись. Используйте текстовый ввод.'); return;}
    try {
      const source = await navigator.mediaDevices.getUserMedia({audio: true});
      if (!mounted.current) {source.getTracks().forEach(t => t.stop()); return;}
      stream.current = source;
      const mime = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) {source.getTracks().forEach(t => t.stop()); throw new Error('Нет поддерживаемого формата аудио.');}
      const rec = new MediaRecorder(source, {mimeType: mime}); recorder.current = rec; const chunks: Blob[] = []; let size = 0;
      rec.ondataavailable = event => {chunks.push(event.data); size += event.data.size; if (size > 4.5*1024*1024 && rec.state === 'recording') rec.stop();};
      rec.onstop = async () => {
        if (timeout.current) clearTimeout(timeout.current); source.getTracks().forEach(t => t.stop());
        if (!mounted.current) return; setRecording(false); setBusy(true);
        try {const result = await api<{text: string}>('voice', {method: 'POST', headers: {'Content-Type': mime}, body: new Blob(chunks, {type: mime})}); if (mounted.current) setMessage(result.text);}
        catch(e) {if (mounted.current) setError((e as Error).message);} finally {if (mounted.current) setBusy(false);}
      };
      rec.start(1000); setRecording(true); timeout.current = setTimeout(() => {if (rec.state === 'recording') rec.stop();}, 30000);
    } catch {stream.current?.getTracks().forEach(t => t.stop()); setError('Не удалось включить микрофон. Проверьте разрешения браузера или введите вопрос текстом.');}
  }
  function speak(text: string) {
    if (!window.speechSynthesis) {setError('Озвучивание недоступно в этом браузере.'); return;}
    const voice = speechSynthesis.getVoices().find(v => v.localService && v.lang.startsWith('ru'));
    if (!voice) {setError('Локальный русский голос не установлен. Текст доступен на экране.'); return;}
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.voice = voice; utterance.lang = 'ru-RU'; speechSynthesis.speak(utterance);
  }
  return <section className="assistant-layout"><motion.div className="panel assistant-main" initial={reducedMotion ? false : {opacity: 0, y: 10}} animate={{opacity: 1, y: 0}} transition={{duration: reducedMotion ? 0 : .32, ease: [.22, 1, .36, 1]}}><div className="assistant-intro"><span className="assistant-orb"><Sparkles size={28}/></span><p className="eyebrow">ВЗГЛЯД СО СТОРОНЫ</p><h2>{general ? 'Разберёмся в финансовых привычках' : 'Разберёмся в вашем бюджете'}</h2><p>{general ? <>Общие вопросы о бюджете, накоплениях и привычках.<br/>Баланс, операции и сводки из аккаунта не передаются.</> : <>Спросите о расходах, привычках или плане накоплений.<br/>Помощник использует сводку за выбранный месяц.</>}</p></div>
    {general && <p className="notice">Не указывайте в вопросе личные данные, реальные доходы, расходы или другие конфиденциальные сведения.{profile.provider.dataPolicy === 'google-unpaid' && ' Бесплатный Gemini может использовать вопросы и ответы для улучшения моделей; их могут просматривать сотрудники Google.'}</p>}
    {!ready && <div className="notice assistant-notice"><strong>{profile.provider.configured ? 'Нужно ваше разрешение' : 'ИИ ещё не подключён'}</strong><p>{profile.provider.configured ? general ? 'Разрешите отправку введённого вопроса провайдеру в настройках.' : 'Разрешите отправку вопроса и финансовой сводки провайдеру в настройках.' : 'Для настоящих ответов нужны серверный API-ключ и настройки провайдера. Основной учёт работает без ИИ.'}</p><button className="text-button" onClick={openSettings}>Открыть настройки →</button></div>}
    {messages.length === 0 && <div className="suggestions">{suggestions.map(text => <button key={text} disabled={!ready} onClick={() => setMessage(text)}>{text}<ArrowUp size={15}/></button>)}</div>}
    <div className="messages" aria-live="polite">{messages.map((m,i) => <motion.article key={i} className={`message ${m.role}`} initial={reducedMotion ? false : {opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: reducedMotion ? 0 : .26, delay: reducedMotion || m.role === 'user' ? 0 : .06, ease: [.22, 1, .36, 1]}}><span>{m.role === 'user' ? 'Вы' : 'Qarzhy AI'}</span><p>{m.text}</p>{m.role === 'assistant' && <button className="text-button" onClick={() => speak(m.text)}><Volume2 size={15}/> Прослушать</button>}</motion.article>)}</div>
    <div className="assistant-processing-slot" style={{minHeight: 24, marginBottom: 12}}><AnimatePresence initial={false}>{busy && <motion.div key="assistant-busy" className="assistant-busy" role="status" aria-live="polite" aria-atomic="true" initial={reducedMotion ? false : {opacity: 0}} animate={{opacity: 1}} exit={{opacity: 0}} transition={{duration: reducedMotion ? 0 : .14}} style={{display: 'flex', alignItems: 'center', gap: 9, minHeight: 24, color: 'var(--muted)', fontSize: 12}}><span aria-hidden="true" style={{display: 'inline-flex', gap: 4}}>{[0, 1, 2].map(dot => <motion.span key={dot} style={{width: 4, height: 4, borderRadius: '50%', background: 'currentColor'}} animate={reducedMotion ? {opacity: .65} : {opacity: [.35, 1, .35]}} transition={reducedMotion ? {duration: 0} : {duration: 1.2, repeat: Infinity, delay: dot * .16, ease: 'easeInOut'}}/>)}</span><span>Обработка запроса…</span></motion.div>}</AnimatePresence></div><ErrorMessage message={error}/>
    <form noValidate onSubmit={validatedSubmit(send)} className="chat-form"><label htmlFor="question" className="sr-only">Вопрос помощнику</label><textarea className="resize-none" style={{resize: 'none', minHeight: 140}} id="question" rows={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} placeholder={general ? 'Например: как начать вести бюджет? Без личных данных.' : 'Что вы хотите узнать о своих финансах?'} disabled={!ready || busy}/><div className="chat-controls"><button type="button" className={`button secondary ${recording ? 'recording' : ''}`} disabled={busy || !profile.voiceConsent || !profile.provider.voiceConfigured} onClick={() => recording ? recorder.current?.stop() : startRecording()}>{recording ? <Square size={16}/> : <Mic size={16}/>} {recording ? 'Остановить запись' : 'Голосовой ввод'}</button><button className="button primary" disabled={!ready || busy || recording || message.trim().length < 3}>{busy ? 'Обработка…' : 'Отправить'}<ArrowUp size={18}/></button></div><p className="form-footnote">{recording ? 'Идёт запись · максимум 30 секунд' : profile.provider.voiceConfigured ? 'Распознанный текст можно проверить и изменить перед отправкой.' : 'Голосовой ввод не подключён. Доступны вопросы текстом.'}</p></form>
    </motion.div><motion.aside className="assistant-aside" initial={reducedMotion ? false : {opacity: 0, y: 8}} animate={{opacity: 1, y: 0}} transition={{duration: reducedMotion ? 0 : .3, delay: reducedMotion ? 0 : .06, ease: [.22, 1, .36, 1]}}><AudioLines size={28}/><h3>{profile.provider.voiceConfigured ? 'Можно просто спросить' : 'Начните с простого вопроса'}</h3><p>{profile.provider.voiceConfigured ? 'Голос превращается в текст. Перед отправкой вы увидите и сможете исправить каждое слово.' : 'Спросите, как вести бюджет, планировать покупки или сформировать финансовую подушку.'}</p><hr/><h3>Решения остаются за вами</h3><p>Помощник не меняет операции и не распоряжается деньгами. Проверяйте его расчёты: ИИ может ошибаться.</p><p className="muted">Каждый вопрос обрабатывается отдельно. Переписка видна только до ухода из раздела и не сохраняется приложением.</p></motion.aside></section>;
}

