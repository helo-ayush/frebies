import React, { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom';
import Logo from '../assets/Logo.png'
import { Menu, X } from 'lucide-react';
import { useClerk, SignedIn, SignedOut, UserButton, useUser } from '@clerk/clerk-react';



const Layout = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const clerk = useClerk();
  const { user } = useUser();
  
  const openLogin = () => clerk.openSignIn({ redirectUrl: "/dashboard" });
  const openSignup = () => clerk.openSignUp({ redirectUrl: "/dashboard" });

  const { openUserProfile } = useClerk();

  return (
    <div className="min-h-screen bg-[#F5F6F9]">
      {/* Navigation bar - minimal pill on left side */}
      <nav className="fixed top-6 left-6 z-50">
        <div className="bg-white/80 backdrop-blur-md rounded-full border border-gray-200/50 shadow-lg px-4 py-3 flex items-center gap-3">
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

          {/* Auth Buttons */}
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
              <div onClick={() => openUserProfile()} className='text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-all duration-300 cursor-pointer py-1.5 px-3 rounded-full'>{user?.fullName}</div>
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed top-4 right-4 z-50">
        <button
          className='p-3 bg-white/80 backdrop-blur-md rounded-full border border-gray-200/50 shadow-lg text-gray-900'
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className='w-5 h-5' /> : <Menu className='w-5 h-5' />}
        </button>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className='absolute top-16 right-0 bg-white/95 backdrop-blur-md rounded-2xl border border-gray-200 shadow-xl p-4 w-56 space-y-2'>
            <NavLink
              to='/dashboard'
              className={({ isActive }) =>
                `block py-2 px-4 rounded-lg font-bold transition-all duration-300
                ${isActive
                  ? 'text-purple-600 bg-purple-50'
                  : 'text-gray-700 hover:bg-gray-100'
                }`
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </NavLink>

            <SignedOut>
              <div className='pt-2 space-y-2 border-t border-gray-200'>
                <button onClick={openLogin} className='w-full cursor-pointer text-center py-2 px-4 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-all duration-300'>
                  Login
                </button>
                <button onClick={openSignup} className='w-full cursor-pointer py-2 px-4 rounded-lg font-bold text-sm bg-gray-900 text-white transition-all duration-300 hover:shadow-lg'>
                  Sign up
                </button>
              </div>
            </SignedOut>
            <SignedIn>
              <div className='pt-2 space-y-2 border-t border-gray-200'>
                <button onClick={() => {clerk.signOut()}} className='w-full cursor-pointer text-center py-2 px-4 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-all duration-300'>
                  Sign out
                </button>
                <div onClick={openUserProfile} className='w-full text-center cursor-pointer py-2 px-4 rounded-lg font-bold text-sm bg-gray-900 text-white transition-all duration-300 hover:shadow-lg'>
                  {user?.fullName}
                </div>
              </div>
            </SignedIn>
          </div>
        )}
      </nav>

      {/* This will be the outlet for other element to be displayed */}
      <Outlet />
    </div>
  )
}

export default Layout