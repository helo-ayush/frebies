import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, Mic2, ArrowRight, Sparkles } from 'lucide-react'

const Dashboard = () => {
  const navigate = useNavigate();

  const features = [
    {
      id: 'mixmaker',
      title: 'MixMaker',
      description: 'Create seamless audio mixes with custom crossfades and professional blending',
      icon: Music,
      gradient: 'from-indigo-500 to-purple-600',
      bgGradient: 'from-indigo-50 to-purple-50',
      path: '/dashboard/mix-maker',
      features: ['Auto Crossfade', 'Custom Song Order', 'Normalize Audio', 'Export Mix']
    },
    {
      id: 'transcribe',
      title: 'Transcribe',
      description: 'Convert audio files to text with high accuracy and multiple language support',
      icon: Mic2,
      gradient: 'from-emerald-500 to-teal-600',
      bgGradient: 'from-emerald-50 to-teal-50',
      path: '/dashboard/transcribe',
      features: ['Audio to Text', 'Multi-language', 'High Accuracy', 'Export Formats']
    }
  ];

  return (
    <div className="min-h-screen bg-[#F5F6F9] pt-24 pb-16 px-6">
      {/* Decorative background blobs */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-purple-300/20 rounded-full blur-[120px] mix-blend-multiply" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-blue-300/20 rounded-full blur-[120px] mix-blend-multiply" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-md px-4 py-2 rounded-full border border-gray-200/50 shadow-sm mb-6">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-bold text-gray-700">Choose Your Tool</span>
          </div>
          <h1 className="text-5xl font-black text-gray-900 mb-4 tracking-tight">
            Welcome to Your Dashboard
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Select a tool below to get started with your audio projects
          </p>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                onClick={() => navigate(feature.path)}
                className="group relative bg-white/60 backdrop-blur-md border border-gray-200/50 rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer hover:-translate-y-2"
              >
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-linear-to-br ${feature.bgGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl`} />

                <div className="relative z-10">
                  {/* Icon */}
                  <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br ${feature.gradient} shadow-lg shadow-purple-500/30 mb-6 group-hover:scale-110 transition-transform duration-500`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    {feature.description}
                  </p>

                  {/* Features List */}
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    {feature.features.map((item, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-linear-to-br from-purple-500 to-pink-500" />
                        <span className="text-sm font-medium text-gray-700">{item}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA Button */}
                  <div className="flex items-center gap-2 text-purple-600 font-bold group-hover:gap-4 transition-all duration-300">
                    <span>Get Started</span>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>

                {/* Decorative corner element */}
                <div className={`absolute top-0 right-0 w-32 h-32 bg-linear-to-br ${feature.gradient} opacity-5 rounded-bl-full -mr-4 -mt-4 group-hover:opacity-10 transition-opacity duration-500`} />
              </div>
            );
          })}
        </div>

        {/* Additional Info Section */}
        <div className="mt-16 text-center">
          <div className="bg-white/40 backdrop-blur-md border border-gray-200/50 rounded-2xl p-8 shadow-lg">
            <h3 className="text-xl font-bold text-gray-900 mb-3">Need Help?</h3>
            <p className="text-gray-600 mb-4">
              Check out our documentation or contact support for assistance
            </p>
            <div className="flex gap-4 justify-center">
              <button className="px-6 py-2.5 rounded-full font-bold text-sm bg-gray-900 text-white hover:shadow-lg hover:scale-105 transition-all duration-300">
                View Docs
              </button>
              <button className="px-6 py-2.5 rounded-full font-bold text-sm border-2 border-gray-300 text-gray-700 hover:bg-gray-100 transition-all duration-300">
                Contact Support
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
