'use client';
import {useAppReducedMotion, useMotionPreference} from './motion-preferences';
import {useEffect, useRef, type ReactNode} from 'react';
import {motion} from 'motion/react';
import {money} from '@/lib/finance';

// Values remain exact, including during an update. Only their presentation moves.
export function AnimatedAmount({value}: {value:string|bigint}) {
  const reduce = useAppReducedMotion();
  return <motion.span className="animated-amount" data-amount={String(value)} key={String(value)}
    initial={reduce ? false : {opacity:.65,y:3}} animate={{opacity:1,y:0}}
    transition={{duration:reduce ? 0 : .24,ease:[.22,1,.36,1]}}>{money(value)}</motion.span>;
}

export function MotionStatus({message}: {message:string}) {
  const reduce=useAppReducedMotion();
  return <motion.span key={message} initial={reduce?false:{opacity:.4}} animate={{opacity:1}} transition={{duration:reduce?0:.18}}>{message}</motion.span>;
}

/** One scroll-animation owner per mounted section. No wheel/touch interception. */
export function MotionSurface({children}: {children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  const preference=useMotionPreference();
  useEffect(()=>{
    const root=ref.current;if(!root)return;
    let disposed=false;let cleanup=()=>{};
    // Load GSAP after the interactive application. A failed optional chunk leaves content visible.
    void Promise.all([import('gsap'),import('gsap/ScrollTrigger')]).then(([{gsap},{ScrollTrigger}])=>{
      if(disposed)return;
      gsap.registerPlugin(ScrollTrigger);
      const media=gsap.matchMedia();
      media.add({reduce:preference==='full'?'(width: 0px)':preference==='minimal'?'all':'(prefers-reduced-motion: reduce)',small:'(max-width: 700px)',desktop:'(min-width: 701px)'}, context=>{
        const {reduce,small}=context.conditions!;
        const seen=new WeakSet<HTMLElement>();
        const parallaxSeen=new WeakSet<HTMLElement>();
        const animations=new Map<HTMLElement,gsap.core.Tween>();
        let frame=0;
        const scoped=gsap.context(()=>{},root);
        // Assistant and dialog nodes have their own Motion owner.
        const selector='[data-reveal], .panel:not(.assistant-main):not(.assistant-aside), .balance-spotlight, .stat-card, .balance-card, .assistant-banner, .planning-notice';
        const register=()=>scoped.add(()=>{
          for(const [element,tween] of animations)if(!root.contains(element)){tween.scrollTrigger?.kill();tween.kill();animations.delete(element);}
          const elements=Array.from(root.querySelectorAll<HTMLElement>(selector));
          elements.forEach((el,index)=>{
            if(seen.has(el)||el.closest('[data-motion-owned="assistant"]'))return;
            seen.add(el);el.dataset.reveal=el.dataset.reveal||'up';
            if(reduce)return;
            const mode=el.dataset.reveal;
            // Never animate a restored section above the current viewport out of sight.
            const bounds=el.getBoundingClientRect();
            if(bounds.bottom<0)return;
            const alreadyVisible=bounds.top<window.innerHeight;
            // A late optional chunk must never blank content the user can already read.
            const tween=gsap.fromTo(el,{opacity:alreadyVisible?.82:0,y:mode==='fade'||mode==='slide'?0:alreadyVisible?5:small?8:18,x:mode==='slide'&&!small?-10:0,scale:mode==='scale'&&!small?.985:1},
              {opacity:1,x:0,y:0,scale:1,duration:small?.28:.52,delay:Math.min(index%4,3)*(small?.025:.045),ease:'power3.out',
                clearProps:'opacity,transform',overwrite:'auto',
                scrollTrigger:{trigger:el,start:'top 96%',once:true}});
            animations.set(el,tween);
          });
          // Stagger small summary items; each target owns only its transform and opacity.
          root.querySelectorAll<HTMLElement>('.balance-metrics > div').forEach((el,index)=>{
            if(seen.has(el)||reduce)return;seen.add(el);
            const tween=gsap.fromTo(el,{opacity:.25,y:8},{opacity:1,y:0,duration:.36,delay:index*.09,ease:'power2.out',clearProps:'opacity,transform',scrollTrigger:{trigger:el,start:'top 96%',once:true}});
            animations.set(el,tween);
          });
          root.querySelectorAll<HTMLElement>('[data-parallax]').forEach(el=>{
            if(parallaxSeen.has(el)||reduce||small)return;parallaxSeen.add(el);
            gsap.to(el,{y:16,ease:'none',scrollTrigger:{trigger:el.parentElement!,start:'top top',end:'bottom top',scrub:.6}});
          });
        });
        const schedule=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;register();ScrollTrigger.refresh();});};
        const revealFocus=(event:FocusEvent)=>{
          if(!(event.target instanceof Element))return;
          for(const [element,tween] of animations)if(element.contains(event.target))tween.progress(1);
        };
        register();
        const mutations=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length||r.removedNodes.length))schedule();});
        mutations.observe(root,{childList:true,subtree:true});
        const resize=new ResizeObserver(schedule);resize.observe(root);
        root.addEventListener('focusin',revealFocus);
        root.dataset.motionReady='true';root.dataset.motionMode=reduce?'reduced':small?'mobile':'desktop';
        return()=>{mutations.disconnect();resize.disconnect();cancelAnimationFrame(frame);root.removeEventListener('focusin',revealFocus);scoped.revert();animations.clear();};
      });
      cleanup=()=>{media.revert();delete root.dataset.motionReady;delete root.dataset.motionMode;};
    }).catch(()=>{root.dataset.motionReady='fallback';});
    return()=>{disposed=true;cleanup();};
  },[preference]);
  return <div ref={ref} data-motion-root className="motion-surface">{children}</div>;
}
