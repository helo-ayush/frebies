import React, { useState } from 'react';

const MixMaker = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(1);
  const [viewMode, setViewMode] = useState('list');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCreateMixMode, setIsCreateMixMode] = useState(false);
  const [selectedMixFolder, setSelectedMixFolder] = useState(null);
  const [customSongs, setCustomSongs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoCrossfade, setAutoCrossfade] = useState(false);
  const [customCrossfade, setCustomCrossfade] = useState(3);
  const [normalize, setNormalize] = useState(false);

  const [newFolderName, setNewFolderName] = useState('');
  const [driveLink, setDriveLink] = useState('');

  // Function to handle creation (resets inputs and closes modal)
  const handleCreateFolder = () => {
    console.log("Creating folder:", newFolderName, "Link:", driveLink);
    // Add your logic to save the folder here
    setNewFolderName('');
    setDriveLink('');
    setIsModalOpen(false);
  };

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
    { id: 7, name: 'Morning Glow', artist: 'Sunrise Co', type: 'Ambient', duration: '4:05' },
    { id: 8, name: 'City Lights', artist: 'Urban Beat', type: 'Electronic', duration: '3:55' },
  ];

  const songs = selectedFolder ? allSongs : [];

  const filteredSongs = allSongs.filter(song =>
    song.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addSongToMix = (song) => {
    if (!customSongs.find(s => s.id === song.id)) {
      setCustomSongs([...customSongs, song]);
    }
  };

  const removeSongFromMix = (songId) => {
    setCustomSongs(customSongs.filter(s => s.id !== songId));
  };

  const moveSong = (index, direction) => {
    const newSongs = [...customSongs];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < newSongs.length) {
      [newSongs[index], newSongs[newIndex]] = [newSongs[newIndex], newSongs[index]];
      setCustomSongs(newSongs);
    }
  };

  return (
    <div className="relative bg-[#F5F6F9] text-slate-800 font-sans selection:bg-indigo-500/30 h-screen overflow-hidden pl-6">

      <div className="fixed top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-300/30 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-300/30 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
      <div className="fixed top-[20%] right-[20%] w-[400px] h-[400px] bg-pink-300/30 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-4000" />

      <div className="relative max-w-[1600px] mx-auto h-full flex flex-col md:flex-row pt-20">

        <aside className="hidden md:flex flex-col w-[280px] pl-0 pr-6 py-6 gap-6 border-r border-gray-200/50 h-full overflow-y-auto">
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
                onClick={() => {
                  setSelectedFolder(folder.id);
                  setIsCreateMixMode(false);
                }}
                className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-300 text-left ${
                  selectedFolder === folder.id && !isCreateMixMode
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
            
            {/* --- NEW ADD FOLDER BUTTON --- */}
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/50 hover:border-indigo-400 transition-all group mt-2"
            >
               <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                 <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
               </div>
               <div className="font-semibold text-sm">New Folder</div>
            </button>

            {/* --- CREATE MIX BUTTON --- */}
            <button 
              onClick={() => {
                setIsCreateMixMode(true);
                setSelectedFolder(null);
              }}
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Create Mix</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col h-full overflow-hidden relative">

          <header className="flex-shrink-0 p-6 md:px-10 md:py-8 flex items-center justify-between z-20">
            <div className="flex items-center gap-3 md:hidden">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-lg flex items-center justify-center text-white shadow-indigo-500/30">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
              </div>
              <h1 className="text-xl font-bold text-slate-900">MixMaker</h1>
            </div>

            <div className="hidden md:block">
              {isCreateMixMode ? (
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Create Your Mix</h2>
                  <p className="text-slate-500 text-sm">Build your perfect audio blend</p>
                </div>
              ) : (
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {folders.find(f => f.id === selectedFolder)?.name || 'Select Folder'}
                  </h2>
                  <p className="text-slate-500 text-sm">Updated 2 hours ago</p>
                </div>
              )}
            </div>

            {!isCreateMixMode && (
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
            )}
          </header>

          {!isCreateMixMode && (
            <div className="md:hidden flex-shrink-0 px-6 mb-6 overflow-x-auto no-scrollbar pb-2">
              <div className="flex gap-3">
                <button
                  onClick={() => setIsCreateMixMode(true)}
                  className="flex-shrink-0 w-14 h-14 rounded-2xl border-2 border-dashed border-indigo-200 flex items-center justify-center text-indigo-400 bg-indigo-50/50"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
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
          )}

          <div className="flex-1 overflow-y-auto px-6 pb-40 md:px-10 md:pb-24 scroll-smooth">
            {isCreateMixMode ? (
              <div className="max-w-5xl mx-auto space-y-6">

                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-lg">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">1</span>
                    Select Source Folder
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {folders.map(folder => (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedMixFolder(folder.id)}
                        className={`p-4 rounded-2xl border-2 transition-all ${selectedMixFolder === folder.id
                            ? 'border-indigo-600 bg-indigo-50/50 shadow-lg'
                            : 'border-transparent bg-white/50 hover:bg-white/80'
                          }`}
                      >
                        <div className={`w-12 h-12 mx-auto rounded-xl bg-gradient-to-br ${folder.color} flex items-center justify-center text-white mb-2`}>
                          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                        </div>
                        <div className="text-sm font-bold text-slate-800 text-center truncate">{folder.name}</div>
                        <div className="text-xs text-slate-500 text-center">{folder.fileCount} tracks</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-lg">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">2</span>
                    Add Custom Songs
                  </h3>

                  <div className="relative mb-4">
                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search songs to add..."
                      className="w-full pl-12 pr-4 py-3 bg-white/80 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  {searchQuery && (
                    <div className="mb-4 max-h-48 overflow-y-auto space-y-2 bg-white/80 rounded-xl p-3 border border-slate-200">
                      {filteredSongs.map(song => (
                        <button
                          key={song.id}
                          onClick={() => {
                            addSongToMix(song);
                            setSearchQuery('');
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-indigo-50 transition-all text-left"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-slate-800 truncate">{song.name}</div>
                            <div className="text-xs text-slate-500 truncate">{song.artist}</div>
                          </div>
                          <svg className="w-5 h-5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-sm font-bold text-slate-600 mb-2">
                      Selected Songs ({customSongs.length})
                    </div>
                    {customSongs.length === 0 ? (
                      <div className="text-center py-8 text-slate-400">
                        <svg className="w-12 h-12 mx-auto mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                        Search and add songs to your mix
                      </div>
                    ) : (
                      customSongs.map((song, index) => (
                        <div key={song.id} className="flex items-center gap-3 p-3 bg-white/80 rounded-xl border border-slate-200">
                          <div className="flex gap-1">
                            <button
                              onClick={() => moveSong(index, 'up')}
                              disabled={index === 0}
                              className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 15l-6-6-6 6" />
                              </svg>
                            </button>
                            <button
                              onClick={() => moveSong(index, 'down')}
                              disabled={index === customSongs.length - 1}
                              className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M6 9l6 6 6-6" />
                              </svg>
                            </button>
                          </div>
                          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm text-slate-800 truncate">{song.name}</div>
                            <div className="text-xs text-slate-500 truncate">{song.artist}</div>
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{song.duration}</div>
                          <button
                            onClick={() => removeSongFromMix(song.id)}
                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-lg">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">3</span>
                    Mix Settings
                  </h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white/80 rounded-xl border border-slate-200">
                      <div>
                        <div className="font-bold text-sm text-slate-800">Auto Crossfade</div>
                        <div className="text-xs text-slate-500">Automatically blend tracks together</div>
                      </div>
                      <button
                        onClick={() => setAutoCrossfade(!autoCrossfade)}
                        className={`relative w-12 h-6 rounded-full transition-all ${autoCrossfade ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${autoCrossfade ? 'translate-x-6' : ''
                          }`} />
                      </button>
                    </div>

                    <div className="p-4 bg-white/80 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-bold text-sm text-slate-800">Crossfade Duration</div>
                        <div className="text-sm font-bold text-indigo-600">{customCrossfade}s</div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={customCrossfade}
                        onChange={(e) => setCustomCrossfade(Number(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #4F46E5 0%, #4F46E5 ${customCrossfade * 10}%, #E2E8F0 ${customCrossfade * 10}%, #E2E8F0 100%)`
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-white/80 rounded-xl border border-slate-200">
                      <div>
                        <div className="font-bold text-sm text-slate-800">Normalize Audio</div>
                        <div className="text-xs text-slate-500">Balance volume levels across tracks</div>
                      </div>
                      <button
                        onClick={() => setNormalize(!normalize)}
                        className={`relative w-12 h-6 rounded-full transition-all ${normalize ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${normalize ? 'translate-x-6' : ''
                          }`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-6 shadow-lg">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">4</span>
                    Preview & Export
                  </h3>

                  <div className="mb-4 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100">
                    <div className="text-center mb-4">
                      <div className="text-sm font-bold text-slate-600 mb-2">Mix Preview</div>
                      <div className="text-2xl font-bold text-slate-900">
                        {customSongs.length} tracks • {customSongs.reduce((acc, s) => {
                          const [min, sec] = s.duration.split(':').map(Number);
                          return acc + min * 60 + sec;
                        }, 0) / 60 | 0} min
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-1 h-16 mb-4">
                      {[...Array(60)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-indigo-400 rounded-full"
                          style={{
                            height: `${Math.random() * 60 + 20}%`,
                            opacity: 0.3 + Math.random() * 0.7
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex justify-center gap-3">
                      <button className="p-3 rounded-full bg-white text-slate-600 hover:text-indigo-600 shadow-md hover:shadow-lg transition-all">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
                      </button>
                      <button className="p-4 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 hover:shadow-indigo-500/60 hover:scale-105 transition-all">
                        <svg className="w-7 h-7 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </button>
                      <button className="p-3 rounded-full bg-white text-slate-600 hover:text-indigo-600 shadow-md hover:shadow-lg transition-all">
                        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button className="flex items-center justify-center gap-2 py-4 px-6 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30
                    hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      <span>Download Mix</span>
                    </button>

                    <button className="flex items-center justify-center gap-2 py-4 px-6 bg-white text-indigo-600 border-2 border-indigo-100 font-bold rounded-xl hover:bg-indigo-50 transition-all">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      <span>Download Timecodes</span>
                    </button>
                  </div>
                </div>

              </div>
            ) : (
              /* --- FOLDER VIEW MODE (When not creating a mix) --- */
              <>
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
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
                        </button>
                      </div>
                    ))}
                    {songs.length === 0 && (
                      <div className="text-center py-20 text-slate-400">Select a folder to view songs</div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {songs.map((song) => (
                      <div
                        key={song.id}
                        className="group relative p-4 bg-white/40 hover:bg-white/80 backdrop-blur-md border border-white/50 rounded-3xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(99,102,241,0.2)] cursor-pointer"
                      >
                        <div className="aspect-square w-full rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 mb-4 flex items-center justify-center relative overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                          <svg className="w-12 h-12 text-indigo-300 group-hover:scale-110 transition-transform duration-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 bg-black/5 backdrop-blur-[2px]">
                            <button className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg transform scale-50 group-hover:scale-100 transition-transform duration-300">
                              <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            </button>
                          </div>
                        </div>
                        <h4 className="font-bold text-slate-800 text-[15px] truncate">{song.name}</h4>
                        <p className="text-xs text-slate-500 font-medium truncate">{song.artist}</p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* --- FLOATING PLAYER BAR --- */}
          <div className="fixed bottom-[80px] md:bottom-6 left-4 right-4 md:left-[304px] md:right-10 z-40 animate-[slideUp_0.5s_ease-out]">
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 p-3 pr-6 rounded-[20px] shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-900 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 opacity-80"></div>
                <svg className="w-6 h-6 text-white relative z-10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm truncate">Sunset Dreams</h4>
                <p className="text-xs text-slate-500 truncate">Luna Wave</p>
              </div>

              <div className="hidden sm:flex items-center gap-1 h-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className={`w-1 bg-indigo-500 rounded-full ${isPlaying ? 'animate-music-bar' : 'h-1'}`} style={{ animationDelay: `${i * 0.1}s` }}></div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/40 hover:scale-105 transition-transform"
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                  ) : (
                    <svg className="w-5 h-5 translate-x-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* --- MOBILE NAV --- */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 z-50 pb-safe">
            <div className="flex justify-around items-center h-[70px] px-2">
              <div className="flex flex-col items-center gap-1 text-indigo-600">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
                <span className="text-[10px] font-medium">Home</span>
              </div>
              <div className="flex flex-col items-center gap-1 text-slate-400">
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                <span className="text-[10px] font-medium">Library</span>
              </div>
            </div>
          </div>
          {/* --- NEW FOLDER MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-all" style={{zIndex: 9999}} onClick={() => setIsModalOpen(false)}>
          <div 
            className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl animate-[slideUp_0.3s_ease-out] m-4 relative overflow-hidden" 
            onClick={e => e.stopPropagation()}
          >
            {/* Decorative gradient blob in modal */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-100 rounded-bl-full -mr-8 -mt-8 opacity-50 pointer-events-none"></div>

            <h3 className="text-2xl font-bold text-slate-900 mb-2 relative z-10">New Folder</h3>
            <p className="text-slate-500 text-sm mb-6 relative z-10">Import songs from your Google Drive</p>

            <div className="space-y-5">
              {/* Input 1: Folder Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                  Folder Name
                </label>
                <div className="relative">
                   <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                   </div>
                   <input 
                    type="text" 
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Summer Hits 2025" 
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* Input 2: Google Drive Link */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">
                  Google Drive Link
                </label>
                <div className="relative">
                   <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"></path><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                   </div>
                   <input 
                    type="text" 
                    value={driveLink}
                    onChange={(e) => setDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..." 
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 ml-1">Make sure the link is set to "Anyone with the link"</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-8 pt-2">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3.5 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleCreateFolder}
                  className="flex-1 py-3.5 rounded-xl font-bold bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all"
                >
                  Import Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

        </main>
      </div>

      {/* CSS Styles */}
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

export default MixMaker;