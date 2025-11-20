import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Zap, Shield, Sparkles, ChevronRight, Star, Users, TrendingUp } from 'lucide-react';
import { useClerk, useUser } from '@clerk/clerk-react';

export default function HomePage() {
  const [email, setEmail] = useState('');
  const clerk = useClerk();
  const { user, isSignedIn } = useUser();
  const navigate = useNavigate();

  const openLogin = () => clerk.openSignIn({ redirectUrl: "/dashboard" });

  return (
    <div className="min-h-screen bg-[#F5F6F9]">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-8 p-24 md:py-24 relative overflow-hidden">
        {/* Decorative floating shapes */}
        <div className="absolute top-20 left-10 w-24 h-24 bg-gradient-to-br from-yellow-400 to-yellow-300 rounded-full blur-2xl opacity-60 animate-pulse"></div>
        <div className="absolute top-40 right-20 w-32 h-32 bg-gradient-to-br from-blue-400 to-purple-400 rounded-full blur-3xl opacity-50"></div>
        <div className="absolute bottom-20 left-1/4 w-20 h-20 bg-gradient-to-br from-pink-400 to-pink-300 rounded-full blur-xl opacity-40"></div>

        <div className="text-center max-w-5xl mx-auto relative z-10">
          {/* Large rounded geometric headline */}
          <h1 className="text-5xl md:text-8xl font-black mb-8 leading-[1.1] tracking-tight select-none">
            <span className="text-gray-900">Hi {clerk.isSignedIn ? user.firstName : "Editor"}<span className="inline-block animate-[wiggle-slow_2s_ease-in-out_infinite] md:animate-none md:hover:animate-[wiggle_0.5s_ease-in-out] cursor-pointer">
              👋
            </span></span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">Explore tools For free!!</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 mb-16 max-w-3xl mx-auto leading-relaxed font-medium">
            Do what you want with our website, its completely free, dont forget to suggest for new features
          </p>

          {/* CTA with pill-shaped button */}
          <div className="flex flex-col sm:flex-row gap-5 justify-center items-center mb-16">
            <div onClick={() => { isSignedIn ? navigate("/dashboard") : openLogin({ redirectUrl: '/dashboard' }) }} className="group relative w-full sm:w-auto bg-gray-900 cursor-pointer text-white px-10 py-5 rounded-full font-bold text-lg hover:shadow-2xl hover:shadow-gray-900/30 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3">
              <span>Get Started Free</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </div>
            <button className="w-full sm:w-auto cursor-pointer bg-white text-gray-900 px-10 py-5 rounded-full font-bold text-lg shadow-lg shadow-gray-200/50 hover:shadow-xl hover:scale-105 transition-all duration-300">
              Watch Demo
            </button>
          </div>
        </div>

        {/* Dashboard Preview with decorative elements */}
        <div className="mt-32 relative">
          {/* Ambient glow behind */}
          <div className="absolute inset-0 bg-gradient-to-r from-purple-200 via-pink-200 to-blue-200 blur-[100px] opacity-40"></div>

          <div className="relative bg-white rounded-[2rem] p-10 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.15)]">
            {/* Window controls */}
            <div className="flex items-center gap-2 mb-8">
              <div className="w-3 h-3 bg-red-400 rounded-full shadow-sm"></div>
              <div className="w-3 h-3 bg-yellow-400 rounded-full shadow-sm"></div>
              <div className="w-3 h-3 bg-green-400 rounded-full shadow-sm"></div>
            </div>

            {/* Feature cards with playful colors */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="group bg-gradient-to-br from-purple-50 to-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.1)] hover:scale-105 transition-all duration-300">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-purple-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-purple-200 group-hover:shadow-xl group-hover:shadow-purple-300 transition-all">
                  <Zap className="w-8 h-8 text-white" />

                </div>
                <h3 className="text-xl font-black mb-3 text-gray-900">Local Render</h3>
                <p className="text-gray-600 leading-relaxed">Speed based on your computer specs</p>
              </div>

              <div className="group bg-gradient-to-br from-blue-50 to-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.1)] hover:scale-105 transition-all duration-300">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200 group-hover:shadow-xl group-hover:shadow-blue-300 transition-all">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-black mb-3 text-gray-900">Google Drive</h3>
                <p className="text-gray-600 leading-relaxed">Can use google drive for data transfer</p>
              </div>

              <div className="group bg-gradient-to-br from-pink-50 to-white p-8 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:shadow-[0_20px_50px_rgb(0,0,0,0.1)] hover:scale-105 transition-all duration-300">
                <div className="w-16 h-16 bg-gradient-to-br from-pink-400 to-pink-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-pink-200 group-hover:shadow-xl group-hover:shadow-pink-300 transition-all">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-black mb-3 text-gray-900">Whisper</h3>
                <p className="text-gray-600 leading-relaxed">OpenAi Whisper for transcribe</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-8 py-18">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-black mb-6 text-gray-900">Everything you need</h2>
          <p className="text-2xl text-gray-600 font-medium">All the tools to build, ship, and scale</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">

          <div className="group bg-white p-10 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(59,130,246,0.15)] hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
              <div className='text-4xl'>📑</div>
            </div>
            <h3 className="text-3xl font-black mb-4 text-gray-900">Transcribe</h3>
            <p className="text-gray-600 mb-8 text-lg leading-relaxed">Helps people with hearing problem, by generating captions for them</p>
            <Link to='/dashboard/transcribe' className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 transition font-bold group-hover:gap-3">
              Explore <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="group bg-white p-10 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(34,197,94,0.15)] hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-blue-200">
              <div className='text-4xl'>🎧</div>
            </div>
            <h3 className="text-3xl font-black mb-4 text-gray-900">Mix Creator</h3>
            <p className="text-gray-600 mb-8 text-lg leading-relaxed">For lazy peoples it generates whole mix with just few clicks</p>
            <Link to='/dashboard/mix-maker' className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 transition font-bold group-hover:gap-3">
              Explore <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="group bg-white p-10 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(147,51,234,0.15)] hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-purple-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-purple-200">
              <Users className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-3xl font-black mb-4 text-gray-900">Real-time Collaboration</h3>
            <p className="text-gray-600 mb-8 text-lg leading-relaxed">Work together seamlessly with your team in real-time. See changes as they happen.</p>
            <a href="#" className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 transition font-bold group-hover:gap-3">
              Explore <ChevronRight className="w-5 h-5" />
            </a>
          </div>

          <div className="group bg-white p-10 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(236,72,153,0.15)] hover:scale-105 transition-all duration-300">
            <div className="w-14 h-14 bg-gradient-to-br from-pink-400 to-pink-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-pink-200">
              <TrendingUp className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-3xl font-black mb-4 text-gray-900">Advanced Analytics</h3>
            <p className="text-gray-600 mb-8 text-lg leading-relaxed">Get deep insights of your youtube channel and compare with others.</p>
            <a href="#" className="inline-flex items-center gap-2 text-pink-600 hover:text-pink-700 transition font-bold group-hover:gap-3">
              Explore <ChevronRight className="w-5 h-5" />
            </a>
          </div>


        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-7xl mx-auto px-8 py-32">
        <div className="text-center mb-20">
          <h2 className="text-5xl md:text-6xl font-black mb-6 text-gray-900">Loved by teams worldwide</h2>
          <p className="text-2xl text-gray-600 font-medium">See what our customers have to say</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-1 mb-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-sm">
                  <Star className="w-4 h-4 text-white fill-white" />
                </div>
              ))}
            </div>
            <p className="text-gray-700 mb-8 text-lg leading-relaxed font-medium">"Somenody paid me to write this review, i am not even an video editor"</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-purple-500 rounded-full flex items-center justify-center font-black text-white text-lg shadow-lg">
                JD
              </div>
              <div>
                <p className="font-black text-gray-900">Elan Mosk</p>
                <p className="text-sm text-gray-500 font-semibold">Unemployed</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-1 mb-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-sm">
                  <Star className="w-4 h-4 text-white fill-white" />
                </div>
              ))}
            </div>
            <p className="text-gray-700 mb-8 text-lg leading-relaxed font-medium">"How much money do you want to sell this website?💰"</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full flex items-center justify-center font-black text-white text-lg shadow-lg">
                MS
              </div>
              <div>
                <p className="font-black text-gray-900">Mark Zarvis </p>
                <p className="text-sm text-gray-500 font-semibold">Mota</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_60px_rgba(0,0,0,0.12)] hover:scale-105 transition-all duration-300">
            <div className="flex items-center gap-1 mb-6">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center shadow-sm">
                  <Star className="w-4 h-4 text-white fill-white" />
                </div>
              ))}
            </div>
            <p className="text-gray-700 mb-8 text-lg leading-relaxed font-medium">"Hi👋, are you by yourself? ahem!!"</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-pink-400 to-pink-500 rounded-full flex items-center justify-center font-black text-white text-lg shadow-lg">
                SJ
              </div>
              <div>
                <p className="font-black text-gray-900">Bull Grades</p>
                <p className="text-sm text-gray-500 font-semibold">Amazan Forest</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-8 py-32">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-[3rem] p-16 md:p-24 text-center relative overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.3)]">
          {/* Decorative gradient orbs */}
          <div className="absolute top-0 left-1/4 w-64 h-64 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full blur-[100px] opacity-30"></div>
          <div className="absolute bottom-0 right-1/4 w-64 h-64 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full blur-[100px] opacity-30"></div>

          <div className="relative z-10">
            <h2 className="text-5xl md:text-7xl font-black mb-6 text-white leading-tight">Ready to get started?</h2>
            <p className="text-2xl mb-12 text-white/80 font-medium">Start your new journey using our platform</p>
            <button onClick={() => { isSignedIn ? navigate("/dashboard") : openLogin({ redirectUrl: '/dashboard' }) }} className="group cursor-pointer bg-white text-gray-900 px-12 py-6 rounded-full font-black text-xl hover:scale-110 hover:shadow-[0_20px_60px_rgba(255,255,255,0.3)] transition-all duration-300">
              Start Now
              <span className="inline-block ml-2 group-hover:translate-x-2 transition-transform">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-32 bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-16">
          {/* Partner logos strip with low opacity */}
          <div className="mb-16 pb-12 border-b border-gray-200">
            <p className="text-center text-sm font-semibold text-gray-400 mb-8 uppercase tracking-wide">Waiting for getting trusted by these teams 😂</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-10 justify-items-center items-center opacity-30 grayscale">
              <div className="text-3xl font-black text-gray-400">Macrosoft</div>
              <div className="text-3xl font-black text-gray-400">Tasla</div>
              <div className="text-3xl font-black text-gray-400">Guggle</div>
              <div className="text-3xl font-black text-gray-400">Navidi</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 mb-12">
            <div>
              <h4 className="font-black mb-5 text-gray-900 text-lg">Product</h4>
              <ul className="space-y-3 text-gray-600">
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Features</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Pricing</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Security</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-black mb-5 text-gray-900 text-lg">Company</h4>
              <ul className="space-y-3 text-gray-600">
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">About</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Blog</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-black mb-5 text-gray-900 text-lg">Resources</h4>
              <ul className="space-y-3 text-gray-600">
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Documentation</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Help Center</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Community</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-black mb-5 text-gray-900 text-lg">Legal</h4>
              <ul className="space-y-3 text-gray-600">
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Privacy</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Terms</a></li>
                <li><a href="#" className="hover:text-purple-600 transition font-semibold">Cookie Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-10 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-500 font-semibold">© No rights reserved. Please dont copy this website.</p>
            <div className="flex gap-8 text-gray-500">
              <a href="#" className="hover:text-purple-600 transition font-semibold">Twitter</a>
              <a href="#" className="hover:text-purple-600 transition font-semibold">GitHub</a>
              <a href="#" className="hover:text-purple-600 transition font-semibold">LinkedIn</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}