import React, { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { ArrowUpRight, ChevronDown, Mic2, Music2, Sparkles } from 'lucide-react'
import { useClerk, useUser } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import './home-v6.css'

const tools = [
  { no: '01', title: 'Transcribe', description: 'Turn audio into clean text and captions.', path: '/dashboard/transcribe', icon: Mic2 },
  { no: '02', title: 'Mix Maker', description: 'Build smooth mixes with less manual work.', path: '/dashboard/mix-maker', icon: Music2 },
  { no: '03', title: 'Dashboard', description: 'A home for current work and future utilities.', path: '/dashboard', icon: Sparkles },
]

function Reveal({ children, className = '', delay = 0 }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 44 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.14 }} transition={{ duration: 0.9, delay, ease: [0.2, 0.7, 0.2, 1] }}>{children}</motion.div>
}

function CursorRepel({ children, className = '' }) {
  const ref = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, { stiffness: 270, damping: 25, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 270, damping: 25, mass: 0.4 })
  const onMove = (event) => {
    if (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = event.clientX - (r.left + r.width / 2)
    const dy = event.clientY - (r.top + r.height / 2)
    const d = Math.hypot(dx, dy)
    const radius = Math.max(180, Math.min(330, Math.max(r.width, r.height) * 0.62))
    const power = d < radius ? Math.pow(1 - d / radius, 2) : 0
    x.set(-(d ? dx / d : 0) * power * 18)
    y.set(-(d ? dy / d : 0) * power * 18)
  }
  return <motion.div ref={ref} className={className} style={{ x: sx, y: sy }} onMouseMove={onMove} onMouseLeave={() => { x.set(0); y.set(0) }}>{children}</motion.div>
}

export default function HomePage() {
  const { openSignIn } = useClerk()
  const { isSignedIn } = useUser()
  const navigate = useNavigate()
  const openApp = () => isSignedIn ? navigate('/dashboard') : openSignIn({ redirectUrl: '/dashboard' })

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      document.documentElement.style.setProperty('--frebies-scroll', String(max > 0 ? window.scrollY / max : 0))
    }
    update(); window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  useEffect(() => {
    const workflow = document.querySelector('.frebies-v6 .workflow')
    const playhead = document.querySelector('.frebies-v6 .playhead')
    if (!workflow || !playhead) return
    const update = () => {
      const r = workflow.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (window.innerHeight * 0.72 - r.top) / Math.max(1, r.height - window.innerHeight * 0.3)))
      playhead.style.left = `${12 + p * 76}%`
    }
    update(); window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return <div className="frebies-v6">
    <div className="progress" />
    <header className="nav-shell"><nav className="nav"><a href="#top" className="nav-brand">frebies</a><div className="nav-links"><a href="#dna">system</a><a href="#tools">tools</a><a href="#workflow">workflow</a><a href="#about">about</a></div><button onClick={openApp} className="nav-launch">open app&nbsp; ↗</button></nav></header>

    <main id="top">
      <section className="hero">
        <div className="hero-halo" /><div className="noise" />
        <div className="orbits" aria-hidden="true"><div className="ellipse e1" /><div className="ellipse e2" /><div className="ellipse e3" /><div className="ellipse e4" /><div className="line-a" /><div className="line-b" /><div className="node n1" /><div className="node n2" /><div className="node n3" /><div className="node n4" /></div>
        <div className="hero-inner">
          <Reveal><div className="hero-kicker">free creator infrastructure / 2026</div><h1><span>Make more.</span><span className="violet">Pay <span className="soft">nothing.</span></span><span>Ship faster.</span></h1></Reveal>
          <Reveal className="hero-side" delay={0.12}><p>Creator tools built around the work you already do. Transcribe, mix, process and experiment without turning every useful feature into another subscription.</p><button className="cta" onClick={openApp}>explore tools <em>→</em></button></Reveal>
        </div>
        <div className="instrument-rail"><div className="instrument"><div className="key">tools live</div><div className="value v">02</div></div><div className="instrument"><div className="key"><span className="live-dot" />access state</div><div className="value">100% free</div><div className="meter"><span /><span /><span /><span /><span /><span /><span /><span /></div></div><div className="instrument"><div className="key">creator utility</div><div className="value v">∞</div></div><div className="instrument"><div className="key">availability</div><div className="value">24/7</div></div></div>
      </section>

      <section className="section dna" id="dna"><div className="wrap dna-layout"><Reveal className="dna-copy"><div className="label">01 / visual system</div><div className="title">A darker language with a little electricity.</div><p className="copy">Instead of repeating feature cards, this section behaves like a specimen sheet: one large composition, measured labels, a soft grid, and a few precise anchors.</p></Reveal><Reveal className="specimen" delay={0.1}><div className="swatch-label">frebies / system specimen / 01</div><div className="word-small">black surfaces / soft light / sharp type / asymmetric spacing / tactile motion</div><div className="word-specimen">Dark<br /><span>by design.</span></div><div className="spec-line" /><div className="spec-pin sp1" /><div className="spec-pin sp2" /></Reveal></div></section>

      <section className="section constellation" id="tools"><div className="wrap constellation-layout"><Reveal className="constellation-copy"><div className="label">02 / tool constellation</div><div className="title">Your tools are a system, not a grid.</div><p className="copy">This replaces the previous stacked-card section. The tools connect visually like a small constellation around the Frebies workspace. It gives you a strong place to add new tools later without redesigning the entire section.</p><button className="cta" style={{ marginTop: 28 }} onClick={() => document.querySelector('#workflow')?.scrollIntoView({ behavior: 'smooth' })}>trace a workflow <em>↘</em></button></Reveal><CursorRepel className="constellation-map"><svg viewBox="0 0 800 660" preserveAspectRatio="none" aria-hidden="true"><path d="M184 196 C 300 70, 430 100, 496 158 S 620 286, 624 376" fill="none" stroke="#b59cff28" strokeWidth="1.2" /><path d="M194 196 C 270 300, 312 450, 344 462 S 450 500, 490 560" fill="none" stroke="#b59cff22" strokeWidth="1.2" /><path d="M344 462 C 460 394, 555 352, 624 376" fill="none" stroke="#b59cff28" strokeWidth="1.2" /><path d="M496 158 C 472 286, 430 388, 344 462" fill="none" stroke="#b59cff1c" strokeWidth="1.2" /><circle cx="400" cy="330" r="154" fill="none" stroke="#b59cff10" /><circle cx="400" cy="330" r="212" fill="none" stroke="#b59cff08" /></svg><div className="center-core"><div><strong>frebies</strong><small>creator workspace</small></div></div><div className="star-node s1"><div className="star-dot" /><div className="node-name">Transcribe</div></div><div className="star-node s2"><div className="star-dot" /><div className="node-name">Mix Maker</div></div><div className="star-node s3"><div className="star-dot" /><div className="node-name">Dashboard</div></div><div className="star-node s4"><div className="star-dot" /><div className="node-name">Next tool</div></div><div className="map-readout">04 nodes / one workspace<br />status: expanding</div></CursorRepel></div></section>

      <section className="section workflow" id="workflow"><div className="wrap"><Reveal className="workflow-head"><div><div className="label">03 / live workflow</div><div className="title">See the work moving.</div></div><p className="copy">A visual timeline feels more native to Frebies than another collection of explanatory boxes. It can later map directly to real job progress in the app.</p></Reveal><Reveal className="workflow-board" delay={0.08}><div className="workflow-top"><span>session / creator-01 / current job</span><span className="workflow-status"><i />processing</span></div><div className="timeline"><div className="playhead" /><div className="track"><div className="track-label">source</div><div className="track-row"><div className="clip c1">input_audio.wav</div></div></div><div className="track"><div className="track-label">transcribe</div><div className="track-row"><div className="clip c2">captions / 87%</div></div></div><div className="track"><div className="track-label">clean</div><div className="track-row"><div className="clip c3">noise reduction</div></div></div><div className="track"><div className="track-label">mix</div><div className="track-row"><div className="clip c4">mix-maker / render</div></div></div></div><div className="workflow-foot"><span>00:00</span><div className="waveform">{Array.from({ length: 10 }, (_, i) => <span key={i} />)}</div><span>03:42</span></div></Reveal></div></section>

      <section className="section stage" id="showcase"><div className="wrap stage-layout"><Reveal><div className="label">04 / featured surface</div><div className="title">One screen can carry a whole mood.</div><p className="copy">The visual temperature flips here, but the product language remains the same. Instead of floating statistics, this becomes a tangible “tool on stage” moment—a surface you can later replace with a real Mix Maker or Transcribe preview.</p><button className="cta" style={{ marginTop: 27 }} onClick={openApp}>open the idea <em>↗</em></button></Reveal><CursorRepel className="device"><div className="device-head"><span>frebies / mix maker</span><span>ready</span></div><div className="device-title">Build<br />something<br />worth keeping.</div><div className="device-sub">track control / waveform / quick render / local workflow</div><div className="device-accent" /><div className="device-panel"><div className="device-panel-row"><span>render profile</span><span>fast</span></div><div className="knob" /></div></CursorRepel></div></section>

      <section className="section philosophy" id="about"><div className="wrap philosophy-grid"><Reveal className="philosophy-title"><div className="label">05 / principles</div><div className="title">The interface should know when to get out of the way.</div></Reveal><div><Reveal className="axiom"><div className="axiom-no">01</div><div><h3>Clear before clever.</h3><p>Every section gets a strong focal point. Decorative motion supports that focal point instead of competing with it.</p><div className="axiom-arrow">↘</div></div></Reveal><Reveal className="axiom d1"><div className="axiom-no">02</div><div><h3>Different shapes, same language.</h3><p>Not every page needs the same card layout. The same typography, contrast, spacing and orbital geometry can make very different components feel related.</p><div className="axiom-arrow">↘</div></div></Reveal><Reveal className="axiom d2"><div className="axiom-no">03</div><div><h3>Motion should explain.</h3><p>Scroll reveals, progress, breathing light and cursor response give the interface a sense of physicality without turning it into a collection of effects.</p><div className="axiom-arrow">↘</div></div></Reveal></div></div></section>

      <section className="section final" id="start"><div className="wrap"><Reveal><div className="label">06 / start</div><div className="title">Make something.<br /><span>for free.</span></div><p className="copy">This is the visual foundation for Frebies. The actual tools remain accessible from the existing dashboard.</p><button className="cta" onClick={openApp}>open app <em>↑</em></button></Reveal></div></section>
    </main>
    <footer><span>frebies / dark studio</span><span>landing concept / v6</span></footer>
  </div>
}
