import React, { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom';
import Logo from '../assets/Logo.png'
import { Menu, X } from 'lucide-react';
import { useClerk, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';



const Layout = () => {
  const clerk = useClerk();
  const { user } = useUser();
  
  const openLogin = () => clerk.openSignIn({ redirectUrl: "/dashboard" });
  const openSignup = () => clerk.openSignUp({ redirectUrl: "/dashboard" });

  const { openUserProfile } = useClerk();

  return (
    <div className="min-h-screen bg-[#F5F6F9]">
      {/* Navigation bar - minimal pill on left side */}
      <nav className="fixed top-6 flex w-full justify-center md:justify-start z-50">
        <div className="bg-white/80 backdrop-blur-md rounded-4xl md:rounded-r-full border border-gray-200/50 shadow-lg px-4 py-3 flex items-center gap-2">
          {/* Logo */}
          <NavLink
            to='/'
            className='flex items-center gap-2 group transition-all duration-300'
          >
            <img
              src={Logo}
              alt="Logo"
              className="h-7 w-auto transition-all duration-300 group-hover:scale-110"
            />
            <div className='text-lg font-black text-gray-900 transition-all duration-300 group-hover:text-gray-700'>
              frebies
            </div>
          </NavLink>

          <div className="w-px h-6 bg-gray-300 mx-1"></div>

          {/* Dashboard Link */}
          <NavLink
            to='/dashboard'
            className={({ isActive }) =>
              `text-sm font-bold px-3 py-1.5 rounded-full transition-all duration-300
              ${isActive
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-700 hover:bg-gray-100'
              }`
            }
          >
            Dashboard
          </NavLink>

          <div className="w-px h-6 bg-gray-300 mx-1"></div>

          {/* Auth Buttons  */}
          <SignedOut>
            <div className='flex gap-2 items-center'>
              <button onClick={openLogin} className='text-sm text-gray-700 font-bold transition-all duration-300 cursor-pointer hover:text-purple-600 px-3 py-1.5 rounded-full hover:bg-gray-100'>
                Login
              </button>
              <button onClick={openSignup} className='px-4 py-1.5 rounded-full font-bold text-sm bg-gray-900 text-white transition-all duration-300 hover:shadow-lg hover:scale-105'>
                <span className='cursor-pointer'>Sign up</span>
              </button>
            </div>
          </SignedOut>

          <SignedIn>
            <div className='flex gap-2 items-center'>
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </nav>

      {/* This will be the outlet for other element to be displayed */}
      <Outlet />
    </div>
  )
}

export default Layout