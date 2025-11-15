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
      {/* Navigation bar - horizontal top bar with minimal style */}
      <nav className="sticky top-4 z-50 mx-4 sm:mx-6 lg:mx-8">
        <div className="max-w-7xl mx-auto bg-white/70 backdrop-blur-md rounded-[2rem] border border-gray-200/50 shadow-lg px-6 sm:px-8 py-4">
          <div className="flex justify-between items-center">
            {/* Logo left */}
            <NavLink
              to='/'
              className='flex items-center gap-2 sm:gap-3 group transition-all duration-300'
              onClick={() => setMobileMenuOpen(false)}
            >
              <img
                src={Logo}
                alt="Logo"
                className="h-8 sm:h-10 w-auto transition-all duration-300 group-hover:scale-110"
              />
              <div className='text-xl sm:text-2xl font-black text-gray-900 transition-all duration-300 group-hover:text-gray-700'>
                frebies
              </div>
            </NavLink>

            {/* Menu center - desktop */}
            <div className='hidden md:flex gap-8 items-center'>
              <NavLink
                to='/dashboard' end
                className={({ isActive }) =>
                  `text-sm font-bold transition-all duration-300 relative group
                  ${isActive
                    ? 'text-purple-600'
                    : 'text-gray-700 hover:text-purple-600'
                  }`
                }
              >
                <span className='relative z-10'>Dashboard</span>
                <span className='absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 group-hover:w-full'></span>
              </NavLink>

              <NavLink
                to='/dashboard/mix-maker'
                className={({ isActive }) =>
                  `text-sm font-bold transition-all duration-300 relative group
                  ${isActive
                    ? 'text-purple-600'
                    : 'text-gray-700 hover:text-purple-600'
                  }`
                }
              >
                <span className='relative z-10'>Mix Maker</span>
                <span className='absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 group-hover:w-full'></span>
              </NavLink>

              <NavLink
                to='/dashboard/transcribe'
                className={({ isActive }) =>
                  `text-sm font-bold transition-all duration-300 relative group
                  ${isActive
                    ? 'text-purple-600'
                    : 'text-gray-700 hover:text-purple-600'
                  }`
                }
              >
                <span className='relative z-10'>Transcribe</span>
                <span className='absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300 group-hover:w-full'></span>
              </NavLink>
            </div>

            {/* Actions right - desktop */}
            <SignedOut>
              <div className='hidden md:flex gap-4 items-center'>
                <button onClick={openLogin} className='text-gray-700 font-bold transition-all duration-300 cursor-pointer hover:text-purple-600 relative group px-4 py-2'>
                  Login
                </button>
                <button onClick={openSignup} className='px-6 py-3 rounded-full font-black text-sm bg-gray-900 text-white transition-all duration-300 hover:shadow-lg hover:shadow-gray-900/30 hover:scale-105 relative overflow-hidden group'>
                  <span className='relative z-10 cursor-pointer'>Sign up</span>
                  <span className='absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100'></span>
                </button>
              </div>
            </SignedOut>

            <SignedIn>
              <div className='hidden md:flex gap-4 items-center'>
                <div onClick={() => openUserProfile()} className='text-sm font-semibold text-[#505050] border-2 border-[#00000000] hover:border-2 hover:scale-103 transition-all duration-300 cursor-pointer hover:border-[#00000026] py-1 px-2 hover:shadow-lg hover:shadow-[#80808046] rounded-2xl'>{user?.fullName}</div>
                <UserButton />
              </div>
            </SignedIn>

            {/* Mobile menu button */}
            <button
              className='md:hidden p-2 text-gray-900'
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className='w-6 h-6' /> : <Menu className='w-6 h-6' />}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className='md:hidden mt-4 pb-4 space-y-4'>
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

              <NavLink
                to='/dashboard/mix-maker'
                className={({ isActive }) =>
                  `block py-2 px-4 rounded-lg font-bold transition-all duration-300
                  ${isActive
                    ? 'text-purple-600 bg-purple-50'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                Mix Maker
              </NavLink>

              <NavLink
                to='/dashboard/transcribe'
                className={({ isActive }) =>
                  `block py-2 px-4 rounded-lg font-bold transition-all duration-300
                  ${isActive
                    ? 'text-purple-600 bg-purple-50'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                Transcribe
              </NavLink>

              <SignedOut>
                <div className='pt-4 space-y-3'>
                  <button onClick={openLogin} className='w-full cursor-pointer text-center py-2 px-4 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-all duration-300'>
                    Login
                  </button>
                  <button onClick={openSignup} className='w-full cursor-pointer py-3 px-6 rounded-full font-black text-sm bg-gray-900 text-white transition-all duration-300 hover:shadow-lg'>
                    Sign up
                  </button>
                </div>
              </SignedOut>
              <SignedIn>
                <div className='pt-4 space-y-3'>
                  <button onClick={() => {clerk.signOut()}} className='w-full cursor-pointer text-center py-2 px-4 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-all duration-300'>
                    Sign out
                  </button>
                  <div onClick={openUserProfile} className='w-full text-center cursor-pointer py-3 px-6 rounded-full font-black text-sm bg-gray-900 text-white transition-all duration-300 hover:shadow-lg'>
                    {user?.fullName}
                  </div>
                </div>
              </SignedIn>
            </div>
          )}
        </div>
      </nav>

      {/* This will be the outlet for other element to be displayed */}
      <Outlet />
    </div>
  )
}

export default Layout