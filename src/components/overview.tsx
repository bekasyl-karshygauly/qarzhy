'use client';
import type {ReactNode} from 'react';
import {ArrowDownLeft, ArrowRight, ArrowUpRight, Sparkles, Target, Clock3} from 'lucide-react';
import {type Summary} from '@/lib/finance';
import {Cashflow, CategoryBreakdown} from './charts';
import {AnimatedAmount} from './fintech-motion';
import {WebGLAmbience} from './webgl-ambience';

export function Overview({name, summary, goal, transactions, onGoals, onTransactions, onAssistant}: {
  name: string; summary: Summary; goal: ReactNode; transactions: ReactNode;
  onGoals: () => void; onTransactions: () => void; onAssistant: () => void;
}) {
  return <div className="night-overview">
    <div className="overview-hero">
      <WebGLAmbience/>
      <section className="balance-spotlight" data-reveal="fade" aria-label="Финансовая сводка">
        <div className="balance-orbit" data-parallax aria-hidden="true"/>
        <h1>Сәлем, {name}.</h1>
        <p className="muted">Хороший день для планов.</p>
        <strong className="balance-number"><AnimatedAmount value={summary.balance}/></strong>
        <p className="balance-label">БАЛАНС ПО ОПЕРАЦИЯМ</p>
        <div className="balance-metrics">
          <div><strong><AnimatedAmount value={summary.income}/></strong><span className="metric-icon income"><ArrowDownLeft size={15}/></span><p>Доходы за месяц</p></div>
          <div><strong><AnimatedAmount value={summary.expense}/></strong><span className="metric-icon expense"><ArrowUpRight size={15}/></span><p>Расходы за месяц</p></div>
        </div>
        <span className="balance-footnote">Баланс за всё время · учёт в тенге</span>
      </section>
      <Cashflow summary={summary}/>
    </div>
    <div className="overview-panels">
      <section className="panel goal-preview" data-reveal="scale">
        <div className="section-heading"><h2><Target size={18}/> Цель</h2><button className="text-button" onClick={onGoals}>Все цели <ArrowRight size={14}/></button></div>
        {goal}
      </section>
      <section className="panel recent-panel" data-reveal="up">
        <div className="section-heading"><h2><Clock3 size={18}/> Последние операции</h2><button className="text-button" onClick={onTransactions}>Все <ArrowRight size={14}/></button></div>
        {transactions}
      </section>
      <CategoryBreakdown summary={summary} compact/>
    </div>
    <button className="assistant-banner" data-reveal="slide" onClick={onAssistant}>
      <span className="assistant-banner-icon"><Sparkles size={24}/></span>
      <span className="assistant-banner-title">ИИ-помощник <span>AI</span></span>
      <span className="assistant-banner-copy">Разберитесь в расходах и приблизьтесь к своим целям.</span>
      <ArrowRight size={18}/>
    </button>
  </div>;
}
