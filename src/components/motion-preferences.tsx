'use client';
import {createContext,useContext,useEffect,useMemo,useState,useSyncExternalStore,type ReactNode} from 'react';
import {MotionConfig} from 'motion/react';
type Preference='system'|'full'|'minimal';
const MotionPreferences=createContext({preference:'system' as Preference,reduced:false,setPreference:(_value:Preference)=>{}});
const readSystemMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const subscribeSystemMotion=(changed:()=>void)=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');query.addEventListener('change',changed);return()=>query.removeEventListener('change',changed);};
export function MotionPreferencesProvider({children}:{children:ReactNode}) {
  const systemReduced=useSyncExternalStore(subscribeSystemMotion,readSystemMotion,()=>false);const [preference,setValue]=useState<Preference>('system');
  useEffect(()=>{try{const saved=localStorage.getItem('qarzhy-motion-preference');if(saved==='full'||saved==='minimal')setValue(saved);}catch{/* Storage may be unavailable; system mode remains usable. */}},[]);
  useEffect(()=>{document.documentElement.dataset.motionPreference=preference;},[preference]);
  const reduced=preference==='minimal'||(preference==='system'&&!!systemReduced);
  const value=useMemo(()=>({preference,reduced,setPreference:(next:Preference)=>{setValue(next);try{localStorage.setItem('qarzhy-motion-preference',next);}catch{/* Preference still applies to this session. */}}}),[preference,reduced]);
  return <MotionPreferences.Provider value={value}><MotionConfig reducedMotion={reduced?'always':'never'}>{children}</MotionConfig></MotionPreferences.Provider>;
}
export function useAppReducedMotion(){return useContext(MotionPreferences).reduced;}
export function useMotionPreference(){return useContext(MotionPreferences).preference;}
export function MotionPreferenceControl(){
  const {preference,setPreference}=useContext(MotionPreferences);
  return <label className="motion-preference"><span>Анимации</span><select aria-label="Анимации интерфейса" value={preference} onChange={event=>setPreference(event.target.value as Preference)}><option value="system">Системные</option><option value="full">Полные</option><option value="minimal">Минимальные</option></select></label>;
}
