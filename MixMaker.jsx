import React, { useState } from 'react';

const MixMaker = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(1);
  const [viewMode, setViewMode] = useState('list'); // 'grid' | 'list'
  const [isPlaying, setIsPlaying] = useState(false);

  // Placeholder Data
  const folders = [
    { id: 1, name: 'Chill Vibes', fileCount: 12, color: 'from-indigo-500 to-purple-500' },
    { id: 2, name: 'Workout', fileCount: 24, color: 'from-orange-400 to-pink-500' },
    { id: 3, name: 'Focus Mode', fileCount: 8, color: 'from-emerald-400 to-cyan-500' },
    { id: 4, name: 'Late Night', fileCount: 15, color: 'from-blue-600 to-indigo-900' },
  ];

  const allSongs = [
    { id: 1, name: 'Sunset Dreams', artist: 'Luna Wave', type: 'Lo-Fi', duration: '3:45' },
    { id: 2, name: 'Neon Highway', artist: 'Synth City', type: 'Synthwave', duration: '4:12' },
    { id: 3, name: 'Deep Blue', artist: 'Ocean Sounds', type: 'Ambient', duration: '5:30' },
    { id: 4, name: 'Coffee Shop', artist: 'Jazzy Beats', type: 'Jazz Hop', duration: '2:50' },
    { id: 5, name: 'Digital Love', artist: 'Cyber Punk', type: 'Electronic', duration: '3:22' },
    { id: 6, name: 'Rainy Day', artist: 'Nature Tones', type: 'Acoustic', duration: '3:10' },
  ];

  const songs = selectedFolder ? allSongs : [];

  return (
    <div className="relative min-h-screen bg-[#F5F6F9] text-slate-800 font-sans overflow-hidden selection:bg-indigo-500/30">
      
      {/* --- AMBIENT BACKGROUND LIGHTING --- */}
      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-300/30 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-300/30 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
      <div className="fixed top-[20%] right-[20%] w-[400px] h-[400px] bg-pink-300/30 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-4000" />

      {/* --- MAIN LAYOUT CONTAINER --- */}
      <div className="relative z-10 max-w-[1600px] mx-auto h-screen flex flex-col md:flex-row overflow-hidden">
        
        {/* --- LEFT SIDEBAR (Desktop Only) --- */}
        <aside className="hidden md:flex flex-col w-[280px] p-6 gap-6 bg-white/40 backdrop-blur-xl border-r border-white/60">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">MixMaker</span>
          </div>

          <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 mb-2">Your Library</div>
            {folders.map(folder => (
              <button 
                key={folder.id}
                onClick={() => setSelectedFolder(folder.id)}
                className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-300 text-left ${
                  selectedFolder === folder.id 
                  ? 'bg-white shadow-[0_8px_20px_-6px_rgba(99,102,241,0.3)] ring-1 ring-white' 
                  : 'hover:bg-white/50 hover:shadow-sm'
                }`}
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${folder.color} flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-105`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                </div>
                <div>
                  <div className="font-semibold text-sm text-slate-800">{folder.name}</div>
                  <div className="text-xs text-slate-500">{folder.fileCount} tracks</div>
                </div>
              </button>
            ))}
            
            <button 
              onClick={() => setIsModalOpen(true)}
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-500 font-semibold hover:bg-indigo-50 hover:border-indigo-300 transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>New Folder</span>
            </button>
          </div>
        </aside>

        {/* --- MAIN CONTENT AREA --- */}
        <main className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {/* Header & Mobile Toggles */}
          <header className="flex-shrink-0 p-6 md:px-10 md:py-8 flex items-center justify-between z-20">
            <div className="flex items-center gap-3 md:hidden">
               <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white shadow-indigo-500/30">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              </div>
              <h1 className="text-xl font-bold text-slate-900">MixMaker</h1>
            </div>
            
            <div className="hidden md:block">
              <h2 className="text-2xl font-bold text-slate-900">
                {folders.find(f => f.id === selectedFolder)?.name || 'Select Folder'}
              </h2>
              <p className="text-slate-500 text-sm">Updated 2 hours ago</p>
            </div>

            {/* View Toggle & Search */}
            <div className="flex items-center gap-3 bg-white/60 backdrop-blur-md p-1.5 rounded-xl border border-white shadow-sm">
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              </button>
            </div>
          </header>

          {/* Mobile Horizontal Folder Scroll */}
          <div className="md:hidden flex-shrink-0 px-6 mb-6 overflow-x-auto no-scrollbar pb-2">
            <div className="flex gap-3">
              <button 
                 onClick={() => setIsModalOpen(true)}
                 className="flex-shrink-0 w-14 h-14 rounded-2xl border-2 border-dashed border-indigo-200 flex items-center justify-center text-indigo-400 bg-indigo-50/50"
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </button>
              {folders.map(folder => (
                <div 
                  key={folder.id}
                  onClick={() => setSelectedFolder(folder.id)}
                  className={`flex-shrink-0 flex flex-col items-center gap-2 transition-all ${selectedFolder === folder.id ? 'scale-105' : 'opacity-70'}`}
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${folder.color} shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white`}>
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  </div>
                  <span className="text-[10px] font-bold text-slate-600 truncate w-16 text-center">{folder.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Content Scroll Area */}
          <div className="flex-1 overflow-y-auto px-6 pb-40 md:px-10 md:pb-24 scroll-smooth">
            {viewMode === 'list' ? (
              <div className="flex flex-col gap-3">
                {songs.map((song, i) => (
                  <div 
                    key={song.id}
                    className="group flex items-center gap-4 p-3 bg-white/40 hover:bg-white/80 backdrop-blur-md border border-white/50 rounded-2xl transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.04)] cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-500 transition-colors">
                      <span className="font-bold text-sm">{i + 1}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800 text-[15px]">{song.name}</h4>
                      <p className="text-xs text-slate-500 font-medium">{song.artist}</p>
                    </div>
                    <div className="hidden sm:block text-xs font-semibold text-slate-400 px-3 py-1 bg-slate-100/50 rounded-full">{song.type}</div>
                    <div className="text-xs text-slate-400 font-mono">{song.duration}</div>
                    <button className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:shadow-md transition-all">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {songs.map((song) => (
                  <div 
                    key={song.id}
                    className="group relative p-4 bg-white/40 hover:bg-white/80 backdrop-blur-md border border-white/50 rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(99,102,241,0.2)] cursor-pointer"
                  >
                    <div className="aspect-square w-full rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 mb-4 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"/>
                      <svg className="w-12 h-12 text-indigo-300 group-hover:scale-110 transition-transform duration-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                      
                      {/* Play Overlay */}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/5 backdrop-blur-[2px]">
                        <button className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform scale-50 group-hover:scale-100 transition-transform duration-300">
                           <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                      </div>
                    </div>
                    <h4 className="font-bold text-slate-800 text-[15px] truncate">{song.name}</h4>
                    <p className="text-xs text-slate-500 font-medium truncate">{song.artist}</p>
                    <div className="absolute top-6 right-6 px-2 py-1 bg-white/90 backdrop-blur rounded-lg text-[10px] font-bold text-slate-600 shadow-sm">
                      {song.type}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- FLOATING PLAYER BAR --- */}
          <div className="fixed bottom-[80px] md:bottom-6 left-4 right-4 md:left-[304px] md:right-10 z-40 animate-[slideUp_0.5s_ease-out]">
             <div className="bg-white/80 backdrop-blur-xl border border-white/50 p-3 pr-6 rounded-[20px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-900 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                   {/* Album Art Placeholder */}
                   <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-80"></div>
                   <svg className="w-6 h-6 text-white relative z-10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-900 text-sm truncate">Sunset Dreams</h4>
                  <p className="text-xs text-slate-500 truncate">Luna Wave</p>
                </div>

                {/* Audio Waveform Visualizer */}
                <div className="hidden sm:flex items-center gap-1 h-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className={`w-1 bg-indigo-500 rounded-full ${isPlaying ? 'animate-music-bar' : 'h-1'}`} style={{animationDelay: `${i * 0.1}s`}}></div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button className="text-slate-400 hover:text-indigo-600 transition-colors"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/40 hover:scale-105 transition-transform"
                  >
                    {isPlaying ? (
                       <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                       <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </button>
                  <button className="text-slate-400 hover:text-indigo-600 transition-colors"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
                </div>
             </div>
          </div>

          {/* --- MOBILE BOTTOM NAVIGATION (Mobile Only) --- */}
          {/* FIXED: Wrapped multiple SVG elements in Fragments <> ... </> */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 z-50 pb-safe">
            <div className="flex justify-around items-center h-[70px] px-2">
              <NavIcon icon={<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />} label="Home" active />
              
              <NavIcon icon={<><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>} label="Search" />
              
              <div className="relative -top-6">
                 <button 
                   onClick={() => setIsModalOpen(true)}
                   className="w-14 h-14 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xl shadow-indigo-500/20 border-4 border-[#F5F6F9]"
                 >
                   <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                 </button>
              </div>

              <NavIcon icon={<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>} label="Library" />
              
              <NavIcon icon={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} label="Profile" />
            </div>
          </div>

        </main>
      </div>

      {/* --- MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white/90 backdrop-blur-xl border border-white rounded-3xl w-[90%] max-w-[400px] shadow-2xl p-6 animate-[slideUp_0.3s_ease]" onClick={(e) => e.stopPropagation()}>
             <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-bold text-slate-900">Create New Mix</h2>
               <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors">
                 <svg className="w-5 h-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
               </button>
             </div>
             
             <div className="space-y-4">
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
                 <input type="text" placeholder="e.g. Summer 2025" className="w-full p-4 bg-slate-50 border-none rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
               </div>
               <div>
                 <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Color Theme</label>
                 <div className="flex gap-3">
                   {['bg-indigo-500', 'bg-pink-500', 'bg-orange-400', 'bg-cyan-400'].map((c, i) => (
                     <div key={i} className={`w-10 h-10 rounded-full ${c} cursor-pointer hover:scale-110 transition-transform ring-2 ring-offset-2 ring-transparent hover:ring-slate-200`}></div>
                   ))}
                 </div>
               </div>
               <button onClick={() => setIsModalOpen(false)} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1 transition-all mt-2">
                 Create Mix
               </button>
             </div>
          </div>
        </div>
      )}

      {/* FIXED: Removed 'jsx global' to work in standard React */}
      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
      .animate-blob {
          animation: blob 7s infinite;
        }
      .animation-delay-2000 {
          animation-delay: 2s;
        }
      .animation-delay-4000 {
          animation-delay: 4s;
        }
      .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
      .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes music-bar {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      .animate-music-bar {
          animation: music-bar 1s ease-in-out infinite;
        }
      .pb-safe {
          padding-bottom: env(safe-area-inset-bottom);
        }
      `}</style>
    </div>
  );
};

// Helper Component for Mobile Nav Icons
const NavIcon = ({ icon, label, active }) => (
  <div className={`flex flex-col items-center gap-1 ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {icon}
    </svg>
    <span className="text-[10px] font-medium">{label}</span>
  </div>
);

export default MixMaker;