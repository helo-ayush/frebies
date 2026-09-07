import React from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { SignedIn, SignedOut, UserButton, useClerk } from '@clerk/clerk-react'

const Layout = () => {
  const { openSignIn, openSignUp } = useClerk()
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <div className="min-h-screen bg-[#08080b]">
      <nav className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,760px)]">
        <div className="flex h-14 items-center justify-between rounded-full border border-white/10 bg-[#09090dcc] px-4 pl-5 shadow-[0_15px_42px_rgba(0,0,0,.28)] backdrop-blur-xl">
          <NavLink to="/" className="text-sm font-extrabold tracking-[-0.05em] text-white">frebies</NavLink>
          <div className="hidden items-center gap-1 sm:flex">
            {isHome ? (
              <>
                <a href="#system" className="rounded-full px-3 py-2 text-[9px] uppercase tracking-[.08em] text-white/60 transition hover:bg-white/5 hover:text-white">system</a>
                <a href="#tools" className="rounded-full px-3 py-2 text-[9px] uppercase tracking-[.08em] text-white/60 transition hover:bg-white/5 hover:text-white">tools</a>
                <a href="#workflow" className="rounded-full px-3 py-2 text-[9px] uppercase tracking-[.08em] text-white/60 transition hover:bg-white/5 hover:text-white">workflow</a>
                <a href="#about" className="rounded-full px-3 py-2 text-[9px] uppercase tracking-[.08em] text-white/60 transition hover:bg-white/5 hover:text-white">about</a>
              </>
            ) : (
              <NavLink to="/dashboard" className="rounded-full px-3 py-2 text-[9px] uppercase tracking-[.08em] text-white/70 transition hover:bg-white/5 hover:text-white">dashboard</NavLink>
            )}
          </div>
          <div className="flex items-center gap-2">
            <SignedOut>
              <button onClick={() => openSignIn({ redirectUrl: '/dashboard' })} className="hidden rounded-full px-3 py-2 text-[9px] font-medium uppercase tracking-[.05em] text-white/60 transition hover:text-white sm:block">login</button>
              <button onClick={() => openSignUp({ redirectUrl: '/dashboard' })} className="rounded-full bg-[#f4efff] px-4 py-2 text-[9px] font-medium uppercase tracking-[.05em] text-[#111116] transition hover:-translate-y-0.5">sign up</button>
            </SignedOut>
            <SignedIn><UserButton /></SignedIn>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  )
}

export default Layout
