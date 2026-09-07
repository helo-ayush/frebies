import React, { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { ArrowUpRight, ChevronDown, ChevronRight, Mic2, Music2, Sparkles, SlidersHorizontal } from 'lucide-react'
import { useClerk, useUser } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import './home.css'

const tools=[
 {no:'01',title:'Transcribe',description:'Turn audio into clean text and captions.',path:'/dashboard/transcribe',icon:Mic2},
 {no:'02',title:'Mix Maker',description:'Build smooth mixes with less manual work.',path:'/dashboard/mix-maker',icon:Music2},
 {no:'03',title:'Dashboard',description:'A home for current work and future utilities.',path:'/dashboard',icon:Sparkles},
]

function Reveal({children,className='',delay=0}){return <motion.div className={className} initial={{opacity:0,y:34}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.14}} transition={{duration:.8,delay,ease:[.2,.7,.2,1]}}>{children}</motion.div>}
function CursorRepel({children,className=''}){
 const ref=useRef(null),x=useMotionValue(0),y=useMotionValue(0),sx=useSpring(x,{stiffness:270,damping:25}),sy=useSpring(y,{stiffness:270,damping:25});
 const rx=useTransform(sy,[-18,18],[2.5,-2.5]),ry=useTransform(sx,[-18,18],[-2.5,2.5]);
 const move=e=>{if(matchMedia('(pointer: coarse)').matches)return;const r=ref.current?.getBoundingClientRect();if(!r)return;const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),d=Math.hypot(dx,dy),rad=Math.max(190,Math.min(330,Math.max(r.width,r.height)*.62)),p=d<rad?(1-d/rad)**2:0;x.set(-(d?dx/d:0)*p*18);y.set(-(d?dy/d:0)*p*18)};
 return <motion.div ref={ref} className={className} style={{x:sx,y:sy,rotateX:rx,rotateY:ry,transformPerspective:900}} onMouseMove={move} onMouseLeave={()=>{x.set(0);y.set(0)}}>{children}</motion.div>
}

export default function HomePage(){
 const {openSignIn,openSignUp}=useClerk();const {user,isSignedIn}=useUser();const navigate=useNavigate();
 const openApp=()=>isSignedIn?navigate('/dashboard'):openSignIn({redirectUrl:'/dashboard'});
 useEffect(()=>{const onScroll=()=>document.documentElement.style.setProperty('--frebies-scroll',String(window.scrollY/(document.documentElement.scrollHeight-innerHeight||1)));onScroll();addEventListener('scroll',onScroll,{passive:true});return()=>removeEventListener('scroll',onScroll)},[])
 return <div className="frebies-home">
  <div className="frebies-progress"/>
  <section className="frebies-hero" id="home"><div className="hero-breath"/><div className="hero-grain"/><div className="hero-orbits"><i className="e1"/><i className="e2"/><i className="e3"/><i className="e4"/><b className="n n1"/><b className="n n2"/><b className="n n3"/></div>
   <div className="hero-inner"><Reveal><small className="kicker">free creator infrastructure / 2026</small><h1>Make more.<br/><span>Pay <em>nothing.</em></span><br/>Ship faster.</h1><div className="hero-note"><i/> Free creator tools, without the pricing maze.</div></Reveal>
   <Reveal className="hero-side" delay={.12}><p>{isSignedIn?`Welcome back, ${user?.firstName||'creator'}. `:''}Transcribe, mix, process and experiment with focused tools built around the work you already do.</p><div className="hero-actions"><button onClick={openApp} className="primary">Open Frebies <ArrowUpRight size={15}/></button>{!isSignedIn&&<button onClick={()=>openSignUp({redirectUrl:'/dashboard'})} className="secondary">Create account</button>}</div></Reveal></div>
   <div className="instrument"><div><small>tools live</small><strong className="accent">02</strong></div><div><small><i/> access state</small><strong>100% free</strong><span className="meter">{Array.from({length:9}).map((_,i)=><b key={i} style={{height:7+(i%4)*4}}/>)}</span></div><div><small>creator utility</small><strong className="accent">∞</strong></div><div><small>availability</small><strong>24/7</strong></div></div>
   <a href="#system" className="scroll-cue"><ChevronDown size={14}/> scroll to explore</a>
  </section>

  <section className="section system" id="system"><div className="grid"><Reveal className="sticky"><small className="label">01 / design system</small><h2>A darker language with a little electricity.</h2><p>Strong hierarchy, high contrast, asymmetric spacing and quiet motion give Frebies one recognizable product language.</p></Reveal><Reveal className="specimen" delay={.1}><small>frebies / visual specimen / 01</small><span>BLACK SURFACES / SOFT LIGHT / SHARP TYPE</span><strong>Dark<br/><em>by design.</em></strong><i className="cross x"/><i className="cross y"/><b className="point p1"/><b className="point p2"/><footer>tactile interaction / asymmetric spacing / editorial rhythm</footer></Reveal></div></section>

  <section className="section tools" id="tools"><div className="grid tools-grid"><Reveal className="sticky"><small className="label">02 / toolkit</small><h2>Small tools.<br/>Big leverage.</h2><p>The real actions stay obvious. Surfaces have different weights and subtly move away from the cursor.</p><div className="tool-stats">03 live surfaces <span/> 04 planned</div></Reveal><div className="tool-rack">{tools.map(({no,title,description,path,icon:Icon},i)=><CursorRepel key={no} className={`tool-card c${i+1}`}><button onClick={()=>navigate(path)}><small>{no} / {title.toUpperCase()}</small><span className="tool-icon"><Icon size={18}/></span><h3>{title}</h3><p>{description}</p><strong>Open tool <ArrowUpRight size={14}/></strong></button></CursorRepel>)}<CursorRepel className="next-card"><small>04 / NEXT</small><strong>More useful things soon.</strong></CursorRepel></div></div></section>

  <section className="section workflow" id="workflow"><div className="wrap"><Reveal><small className="label">03 / live workflow</small><div className="workflow-head"><h2>See the work moving.</h2><p>A visual timeline that can later bind directly to real processing state.</p></div></Reveal><Reveal className="timeline" delay={.08}><header><span>session / creator / current job</span><b><i/> processing</b></header><div className="tracks"><div className="playhead"/>{[['source','input_audio.wav','a'],['transcribe','captions / 87%','b'],['clean','noise reduction','c'],['mix','mix-maker / render','d']].map(([l,t,c])=><div className="track" key={l}><small>{l}</small><div><span className={c}>{t}</span></div></div>)}</div><footer><span>00:00</span><div className="wave">{Array.from({length:24}).map((_,i)=><i key={i} style={{height:8+(i*7)%20}}/>)}</div><span>03:42</span></footer></Reveal></div></section>

  <section className="section stage"><div className="grid stage-grid"><Reveal><small className="label dark">04 / featured surface</small><h2>One screen can carry a whole mood.</h2><p className="dark-copy">A future Mix Maker or Transcribe screen can live here, making the landing page a preview of the real product.</p><button onClick={openApp} className="primary">Open workspace <ArrowUpRight size={15}/></button></Reveal><CursorRepel className="device-wrap"><div className="device"><header><span>frebies / mix maker</span><b><i/> ready</b></header><h3>Build<br/>something<br/><em>worth keeping.</em></h3><small>waveform / track control / render profile / local workflow</small><div className="device-orbit"/><div className="device-panel"><span>render profile</span><strong>fast</strong><div><SlidersHorizontal size={17}/></div></div></div></CursorRepel></div></section>

  <section className="section about" id="about"><div className="grid"><Reveal className="sticky"><small className="label">05 / principles</small><h2>The interface should know when to get out of the way.</h2></Reveal><div className="axioms">{[['01','Clear before clever.','Strong focal points. Decorative motion supports the message.'],['02','Different shapes, same language.','Tool pages do not need the same layout to feel related.'],['03','Motion should explain.','Scroll, progress, breathing light and cursor response should add meaning.']].map(([n,t,d],i)=><Reveal className="axiom" delay={i*.06} key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p><a href="#start"><ChevronRight size={15}/></a></div></Reveal>)}</div></div></section>

  <section className="section final" id="start"><Reveal><small className="label">06 / start</small><h2>Make something.<br/><span>for free.</span></h2><p>Landing first. Dashboard next. Then the individual tools — all sharing one visual grammar.</p><button onClick={openApp} className="primary">Open Frebies <ArrowUpRight size={15}/></button></Reveal></section>
 </div>
}
