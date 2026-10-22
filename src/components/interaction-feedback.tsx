'use client';
import {useEffect} from 'react';
import {useAppReducedMotion} from './motion-preferences';

/** One delegated presentation handler; it never prevents or repeats the real action. */
export function InteractionFeedback(){
  const reduced=useAppReducedMotion();
  useEffect(()=>{
    const owned=new Set<Animation>();const effects=new Set<()=>void>();const presses=new WeakMap<HTMLElement,Animation>();
    const track=(animation:Animation)=>{owned.add(animation);animation.onfinish=()=>owned.delete(animation);animation.oncancel=()=>owned.delete(animation);return animation;};
    const click=(event:MouseEvent)=>{
      if(!(event.target instanceof Element))return;
      const control=event.target.closest<HTMLElement>('button, [role="button"], summary, a.button');
      if(!control||control.matches(':disabled,[aria-disabled="true"]')||control.classList.contains('sidebar-scrim'))return;
      const rect=control.getBoundingClientRect();if(!rect.width||!rect.height)return;
      presses.get(control)?.cancel();
      // Static emphasis remains available to reduced-motion users; no moving wave.
      const press=track(control.animate(reduced?[{outline:'2px solid var(--lime)',outlineOffset:'3px'},{outline:'2px solid transparent',outlineOffset:'3px'}]:[{scale:'1'},{scale:'.955',offset:.25},{scale:'1'}],{duration:reduced?160:360,easing:'cubic-bezier(.22,1,.36,1)'}));
      presses.set(control,press);
      if(reduced)return;
      if(control.closest('.sidebar')&&control.classList.contains('active')){
        const surface=document.querySelector<HTMLElement>('[data-motion-root]');
        if(surface)track(surface.animate([{opacity:.4,translate:'0 14px'},{opacity:1,translate:'0 0'}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'}));
      }
      const pulse=document.createElement('div');pulse.className='click-feedback';pulse.dataset.clickFeedback='true';pulse.setAttribute('aria-hidden','true');
      Object.assign(pulse.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,borderRadius:getComputedStyle(control).borderRadius||'8px'});
      if(control.matches('.danger,.danger-outline,.danger-text'))pulse.dataset.intent='danger';
      document.body.appendChild(pulse);
      // A manual non-focusable popover stays visible above a native modal too.
      if(typeof pulse.showPopover==='function'){pulse.setAttribute('popover','manual');try{pulse.showPopover();}catch{pulse.removeAttribute('popover');}}
      const animation=track(pulse.animate([{opacity:.75,transform:'scale(.97)'},{opacity:.45,offset:.25},{opacity:0,transform:'scale(1.1)'}],{duration:620,easing:'cubic-bezier(.22,1,.36,1)'}));
      const finish=()=>{clearTimeout(timer);animation.cancel();pulse.remove();effects.delete(finish);};
      const timer=setTimeout(finish,660);effects.add(finish);animation.onfinish=()=>{owned.delete(animation);finish();};
      if(effects.size>6)effects.values().next().value?.();
    };
    document.addEventListener('click',click,{capture:true,passive:true});
    return()=>{document.removeEventListener('click',click,true);for(const finish of effects)finish();for(const animation of owned)animation.cancel();owned.clear();};
  },[reduced]);
  return null;
}
