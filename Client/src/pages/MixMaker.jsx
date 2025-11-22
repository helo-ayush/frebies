import React, { useState, useRef, useEffect } from 'react';
import {
  Music, Play, Pause, Plus, HardDrive, Folder, Search,
  Settings, Download, Zap, Clock, Sliders,
  FileAudio, AlignLeft, ChevronDown, GripVertical, X, Delete, Volume2,
  BrushCleaning, Minus
} from 'lucide-react';

import { SignedIn, useUser } from '@clerk/clerk-react';

const MixMaker = () => {
  // --- STATE ---
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [mixSongs, setMixSongs] = useState([]);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState({ isOpen: false, folderId: null, folderName: null });
  const { user } = useUser();

  // Mix Configuration State
  const [mixDuration, setMixDuration] = useState(60);
  const [crossfadeType, setCrossfadeType] = useState('auto');
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(4);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [driveLink, setDriveLink] = useState('');
  const [folderAdded, setFolderAdded] = useState(false);
  const [selectedFolderSongs, setSelectedFolderSongs] = useState([]);
  const [volume, setVolume] = useState(80);
  const [currentSelectedSong, setCurrentSelectedSong] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // --- Folder DATA ---
  const [folders, setFolders] = useState([]);

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/getFolders`, {
          method: 'POST',
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            userId: user.id   // 👈 send userId here
          })
        });

        const data = await res.json();

        if (data.ok) {
          await setFolders(data.folders);
          console.log(data.folders);
        }
      } catch (err) {
        console.error("Error fetching folders:", err);
      }
    };

    if (SignedIn) fetchFolders();
  }, [SignedIn, isImportModalOpen, folderAdded]);

  function songNameExtractor(filename) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      return parts.slice(1).join(' - ').trim();
    }

    return nameWithoutExt.trim();
  }

  function artistNameExtractor(filename) {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");

    if (nameWithoutExt.includes(' - ')) {
      const parts = nameWithoutExt.split(' - ');
      return parts[0].trim();
    }

    return 'Unknown Artist';
  }


  // Filter songs for the bottom box
  const filteredFolderSongs = selectedFolderSongs.filter(song =>
    song.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToMix = (song) => {
    setMixSongs([...mixSongs, { ...song, uniqueId: song.id }]);
    console.log(song)
  };

  const removeFromMix = (uniqueId) => {
    setMixSongs(mixSongs.filter(s => s.uniqueId !== uniqueId));
  };

  const removeFromMix2 = (song) => {
    setMixSongs(mixSongs.filter(mixSong => mixSong.id !== song.id));
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExportComplete(true);
    }, 2000);
  };


  useEffect(() => {
    setFolderName('');
    setDriveLink('');
  }, [isImportModalOpen])

  const saveToMongoDb = async () => {
    try {
      const req = await fetch(`${import.meta.env.VITE_API_BASE_URL}/saveData`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: user.id,   // 👈 userId here
          url: driveLink,
          folderName: folderName
        })
      })
      if (req.ok) {
        setFolderAdded(!folderAdded);
      }
    }
    catch (err) {
      console.log(err)
    }

  }

  const deleteFolder = async (key) => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/saveData/remove`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: user.id,
          folderId: key
        })
      })
      const data = await res.json();
      if (data.ok) {
        // Refetch folders after deletion
        setFolders(folders.filter(f => f._id !== key));
        console.log('Folder deleted successfully');
      } else {
        console.log('Delete failed:', data.error);
      }
    }
    catch (err) {
      console.log('Delete error:', err)
    }
  }

  const fetchFolderSongs = async () => {
    // Find the folder object that matches the selectedFolderId
    const selectedFolder = folders.find(f => f._id === selectedFolderId);

    // Check if folder exists before making the request
    if (!selectedFolder) {
      return;
    }

    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/data`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: `https://drive.google.com/drive/folders/${selectedFolder.folderId}`
      })
    });

    const data = await response.json();
    setSelectedFolderSongs(data);
    console.log(data)
  }

  useEffect(() => {
    // Only fetch if we have folders and a selected folder
    if (folders.length > 0 && selectedFolderId) {
      fetchFolderSongs();
    }
  }, [selectedFolderId, folders]) // Correct dependencies

  // AUDIO PLAYBACK FUNCTIONS
  const audioRef = useRef(null);

  // When song changes, reset and load new source
  useEffect(() => {
    if (!audioRef.current || !currentSelectedSong?.id) return;

    setIsLoading(true);

    // USE PROXY URL instead of direct Google Drive link
    const proxyUrl = `${import.meta.env.VITE_API_BASE_URL}/audio/${currentSelectedSong.id}`;

    console.log('🎵 Loading song:', currentSelectedSong.name);

    audioRef.current.src = proxyUrl;
    audioRef.current.load();

    // When audio is ready to play
    const handleCanPlay = () => {
      console.log('✅ Audio ready to play');
      setIsLoading(false);
      if (isPlaying) {
        audioRef.current.play().catch(error => {
          console.error("Error playing audio:", error);
          setIsPlaying(false);
        });
      }
    };

    audioRef.current.addEventListener('canplay', handleCanPlay);

    return () => {
      audioRef.current?.removeEventListener('canplay', handleCanPlay);
    };
  }, [currentSelectedSong]);

  // Handle play/pause state changes
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.play().catch(error => {
        console.error("Error playing audio:", error);
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);



  return (
    <div className="relative min-h-screen w-full bg-[#F5F6F9] text-slate-800 font-sans overflow-x-hidden">

      {/* --- BACKGROUND ELEMENTS --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-indigo-300/20 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-purple-300/20 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
      </div>

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onError={(e) => {
          console.error("Audio error:", e);
          setIsPlaying(false);
          setIsLoading(false);
        }}
      />

      {/* --- LAYOUT --- */}
      <div className="relative z-10 flex h-screen pt-0">

        {/* --- SIDEBAR --- */}
        {/* Transparent floating look to match modern aesthetic */}
        <aside className="hidden md:flex flex-col w-[300px] h-full pt-28 pb-6 px-6 border-r border-white/0 z-20">

          {/* Import CTA */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="mb-8 flex items-center gap-3 w-full p-4 rounded-2xl bg-slate-900 text-white shadow-xl shadow-slate-900/20 hover:scale-[1.02] transition-all group relative overflow-hidden"
          >
            {/* Shine effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-linear-to-r from-transparent via-white/10 to-transparent" />

            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors relative z-10">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="text-left relative z-10">
              <div className="font-bold text-sm">Import Folder</div>
              <div className="text-[10px] text-slate-400">Google Drive</div>
            </div>
          </button>

          <div className="px-2 mb-3 text-xs font-bold text-slate-400 uppercase tracking-wider">My Folders</div>

          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar pr-2">
            {folders.map(folder => (
              <div
                key={folder._id}
                className={`group w-full border-2 border-[#1717170b] flex items-center gap-3 p-3.5 rounded-2xl transition-all duration-300 ${selectedFolderId === folder._id
                  ? 'bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] ring-1 ring-white/50 border-[#17171717]'
                  : 'hover:bg-white/40'
                  }`}
              >
                <button
                  onClick={() => setSelectedFolderId(folder._id)}
                  className="flex-1 cursor-pointer flex items-center gap-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className={`font-black text-sm truncate ${selectedFolderId === folder._id ? 'text-slate-900' : 'text-slate-700'}`}>{folder.folderName}</div>
                    <div className="text-[10px] text-slate-400">{folder.count} Songs</div>
                  </div>
                  {selectedFolderId === folder._id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  )}
                </button>
                <button
                  onClick={() => { setDeleteConfirmModal({ isOpen: true, folderId: folder._id, folderName: folder.folderName }) }}
                  className="p-2 cursor-pointer rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 text-red-500 hover:text-red-600"
                  title="Delete folder"
                >
                  <BrushCleaning className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* --- MAIN CONTENT --- */}
        {/* W-full to take remaining space, padded appropriately */}
        <main className="flex-1 h-full overflow-y-auto pt-24 md:pt-6 pb-10 px-4 md:px-8 custom-scrollbar relative scroll-smooth">

          <div className="w-full max-w-[98%] mx-auto space-y-6">

            {/* === MOBILE FOLDER MANAGEMENT === */}
            <section className="md:hidden bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white overflow-hidden p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <Folder className="w-6 h-6 text-indigo-500" />
                  My Folders
                </h2>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg shadow-slate-900/20 active:scale-95 transition-transform"
                >
                  <Plus className="w-4 h-4" /> Import
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                {folders.map(folder => (
                  <div
                    key={folder._id}
                    className={`group w-full border flex items-center gap-3 p-3 rounded-2xl transition-all ${selectedFolderId === folder._id
                      ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                      : 'bg-slate-50 border-slate-100'
                      }`}
                  >
                    <button
                      onClick={() => setSelectedFolderId(folder._id)}
                      className="flex-1  flex items-center gap-3 text-left min-w-0"
                    >
                      <div className="min-w-0">
                        <div className={`font-bold text-sm truncate ${selectedFolderId === folder._id ? 'text-indigo-900' : 'text-slate-700'}`}>{folder.folderName}</div>
                        <div className="text-[10px] text-slate-400">{folder.count} Songs</div>
                      </div>
                    </button>
                    <button
                      onClick={() => { setDeleteConfirmModal({ isOpen: true, folderId: folder._id, folderName: folder.folderName }) }}
                      className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <BrushCleaning className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* === BOX 1: MIX GENERATOR (Expanded Width) === */}
            <section className="relative bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white overflow-hidden">
              <div className="p-8 lg:p-10">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-10 gap-6">
                  <div>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 flex items-center gap-3 mb-2">
                      <Zap className="w-8 h-8 md:w-10 md:h-10 text-indigo-500 fill-indigo-500" />
                      Mix Generator
                    </h1>
                    <p className="text-slate-500 text-lg max-w-xl">Configure your settings and let our engine blend your tracks perfectly.</p>
                  </div>

                  {/* Export Button Group */}
                  <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                    {exportComplete ? (
                      <div className="flex gap-2 w-full lg:w-auto animate-in fade-in zoom-in duration-300">
                        <button className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-100 transition-colors">
                          <FileAudio className="w-4 h-4" /> Download Audio
                        </button>
                        <button className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-sm hover:bg-indigo-100 transition-colors">
                          <AlignLeft className="w-4 h-4" /> Timecode
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className={`
                            flex-1 lg:flex-none relative overflow-hidden group flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-black text-lg text-white shadow-xl transition-all min-w-[200px]
                            ${isExporting ? 'bg-slate-800 cursor-wait' : 'bg-slate-900 hover:scale-105 hover:shadow-2xl hover:shadow-indigo-500/20'}
                          `}
                      >
                        {isExporting ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span>Processing...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-5 h-5 group-hover:animate-bounce" />
                            <span>Export Mix</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-16">

                  {/* LEFT COLUMN: Configuration */}
                  <div className="space-y-8">
                    {/* Option 1: Select Folder */}
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                        <Folder className="w-4 h-4 text-indigo-500" /> Source Folder
                      </label>
                      <div className="relative group">
                        <select
                          value={selectedFolderId}
                          onChange={(e) => setSelectedFolderId(Number(e.target.value))}
                          className="w-full appearance-none bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-2xl px-5 py-4 pr-12 text-slate-700 font-bold text-lg focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer shadow-sm"
                        >
                          {folders.map(f => <option key={f._id} value={f._id}>{f.folderName}</option>)}
                        </select>
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-6 h-6 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
                      </div>
                    </div>

                    {/* Option 2: Duration Slider */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-end">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                          <Clock className="w-4 h-4 text-indigo-500" /> Target Duration
                        </label>
                        <div className="text-2xl font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg">{mixDuration} <span className="text-sm font-bold text-indigo-400">min</span></div>
                      </div>
                      <div className="relative h-12 flex items-center">
                        <input
                          type="range"
                          min="10" max="180" step="5"
                          value={mixDuration}
                          onChange={(e) => setMixDuration(Number(e.target.value))}
                          className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-500 transition-all"
                        />
                      </div>
                      <div className="flex justify-between text-xs font-bold text-slate-400 px-1">
                        <span>10m</span>
                        <span>3h</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Option 3: Crossfade */}
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                          <Sliders className="w-4 h-4 text-indigo-500" /> Crossfade
                        </label>
                        <div className="p-1.5 bg-slate-100 rounded-2xl flex gap-1">
                          <button
                            onClick={() => setCrossfadeType('auto')}
                            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${crossfadeType === 'auto' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
                          >
                            Auto
                          </button>
                          <button
                            onClick={() => setCrossfadeType('custom')}
                            className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${crossfadeType === 'custom' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700 cursor-pointer'}`}
                          >
                            Custom
                          </button>
                        </div>
                        {crossfadeType === 'custom' && (
                          <div className="flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-200 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <input
                              type="range" min="1" max="12" step="0.5"
                              value={crossfadeSeconds}
                              onChange={(e) => setCrossfadeSeconds(Number(e.target.value))}
                              className="flex-1 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <span className="font-mono font-bold text-sm text-indigo-600 w-10 text-right">{crossfadeSeconds}s</span>
                          </div>
                        )}
                      </div>

                      {/* Option 4: Normalize Toggle */}
                      <div className="space-y-3">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                          <Music className="w-4 h-4 text-indigo-500" /> Audio Processing
                        </label>
                        <div
                          onClick={() => setNormalizeAudio(!normalizeAudio)}
                          className={`cursor-pointer flex items-center justify-between p-3.5 rounded-2xl border transition-all ${normalizeAudio ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}
                        >
                          <div>
                            <div className={`font-bold text-sm ${normalizeAudio ? 'text-emerald-800' : 'text-slate-700'}`}>Normalize</div>
                            <div className="text-[10px] text-slate-500">Balance volume</div>
                          </div>
                          <div className={`w-12 h-6 rounded-full transition-colors relative ${normalizeAudio ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${normalizeAudio ? 'translate-x-6' : ''}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Mix Preview / Workspace */}
                  <div className="bg-slate-900 rounded-3xl p-1 shadow-inner h-120 overflow-hidden flex flex-col">
                    {/* Player Visualizer */}
                    <div className="bg-slate-800/50 rounded-t-[1.3rem] p-6 relative overflow-hidden">
                      <div className="flex items-center justify-between relative z-10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold">
                            {mixSongs.length}
                          </div>
                          <div>
                            <div className="text-white font-bold text-sm">Tracks Selected</div>
                            {/* <div className="text-slate-400 text-xs">Total Time: {mixSongs.reduce((acc, s) => acc + parseInt(s.duration.split(':')[0]), 0) * 1} mins</div> */}
                          </div>
                        </div>
                        <button
                          onClick={() => setIsPlaying(!isPlaying)}
                          className="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                        >
                          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                        </button>
                      </div>
                    </div>

                    {/* Droppable Area */}
                    <div className="flex-1 bg-slate-900 p-4 overflow-y-scroll custom-scrollbar min-h-[300px]">
                      {mixSongs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center  text-slate-600 border-2 border-dashed border-slate-700 rounded-2xl p-8">
                          <p className="font-bold mb-2">Mix Custom Songs Empty</p>
                          <p className="text-xs text-center max-w-[200px]">Add songs from the library to make them in starting of mix.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 overflow-y-scroll">
                          {mixSongs.map((song, idx) => (
                            <div key={song.id} className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl border border-slate-700 animate-in slide-in-from-bottom-2 duration-200">
                              <div className="text-slate-500 cursor-grab"><GripVertical className="w-4 h-4" /></div>
                              <div className="w-6 h-6 rounded bg-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                              <div className="flex-1 min-w-0 ">
                                <div className="text-white text-sm font-bold truncate ">{songNameExtractor(song.name)}</div>
                                <div className="text-slate-500 text-xs truncate">{artistNameExtractor(song.name)}</div>
                              </div>
                              <button onClick={() => removeFromMix(song.uniqueId)} className="text-slate-500 hover:text-red-400 p-1"><X className="w-4 h-4 cursor-pointer" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>


            {/* === BOX 2: SOURCE SONGS (SECONDARY) === */}
            <section className="bg-white/80 backdrop-blur-lg rounded-4xl border border-white shadow-sm overflow-hidden">
              <div className="p-6 md:px-10 md:py-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Music className="w-5 h-5" />
                  </span>
                  <div className="flex items-center gap-6">
                    <button
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                    </button>
                    <div className="flex items-center gap-3 bg-slate-100 rounded-xl p-2 px-4">
                      <Volume2 className="w-4 h-4 text-slate-500" />
                      <input
                        type="range"
                        min="0" max="100"
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="w-24 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                    </div>
                  </div>
                </h3>

                {/* Search */}
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter library..."
                    className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="h-[400px] overflow-y-auto custom-scrollbar p-4 md:p-6">
                {filteredFolderSongs.length > 0 ? (
                  <div className="grid select-none cursor-pointer grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredFolderSongs.map((song, i) => (
                      <div onClick={() => {
                        // Changing Song
                        if (currentSelectedSong.id !== song.id) {
                          setCurrentSelectedSong(song);
                          setIsPlaying(true); // Play the song by default
                        } else {
                          // Toggle play/pause
                          setIsPlaying(!isPlaying);
                        }
                      }}
                        key={song.id}
                        className={`group flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-white hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-200 ${currentSelectedSong.id === song.id
                          ? "border-[#edd4ff] border bg-linear-to-r from-indigo-50 to-purple-50 shadow-xl shadow-indigo-200/50 animate-pulse-slow"
                          : "border border-slate-100 hover:border-indigo-200"
                          }`}
                      >
                        <div
                          className="flex items-center gap-4 min-w-0">
                          <div
                            className="w-10  h-10 rounded-xl bg-white text-slate-400 flex items-center justify-center font-bold text-xs shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-colors relative"
                          >
                            {/* Show pause button if this song is currently selected and playing */}
                            {currentSelectedSong.id === song.id && isPlaying ? (
                              <Pause className="w-4 h-4" />
                            ) : currentSelectedSong.id === song.id && !isPlaying ? (
                              // Show play button if this song is selected but paused
                              <Play className="w-4 h-4" />
                            ) : (
                              // Show number by default, play button on hover
                              <>
                                <span className="group-hover:hidden">{i + 1}</span>
                                <Play className="w-4 h-4 hidden group-hover:block" />
                              </>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 text-sm truncate pr-2">{songNameExtractor(song.name)}</div>
                            <div className="text-xs text-slate-500 truncate">{artistNameExtractor(song.name)}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            onClick={(e) => {
                              const songExists = mixSongs.some(mixSong => mixSong.id === song.id);
                              songExists ? removeFromMix2(song) : addToMix(song);
                              e.stopPropagation()
                            }}
                            className="w-9 h-9 rounded-xl cursor-pointer bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm active:scale-95"
                            title={mixSongs.some(mixSong => mixSong.id === song.id) ? "Remove from mix" : "Add to end of mix"}
                          >
                            {mixSongs.some(mixSong => mixSong.id === song.id) ? (
                              <Minus className="w-5 h-5" />
                            ) : (
                              <Plus className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center text-slate-400">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Search className="w-6 h-6 text-slate-300" />
                    </div>
                    <p>No songs found matching your search.</p>
                  </div>
                )}
              </div>
            </section>

          </div>
        </main>
      </div>

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-100 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setDeleteConfirmModal({ isOpen: false, folderId: null, folderName: null })}>
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-red-50 p-8 text-center border-b border-red-100">
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                <X className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Delete Folder?</h2>
              <p className="text-slate-600 text-sm mt-2">This action cannot be undone.</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Folder Name</p>
                <p className="text-slate-900 font-semibold">{deleteConfirmModal.folderName}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setDeleteConfirmModal({ isOpen: false, folderId: null, folderName: null })}
                  className="flex-1 py-3 font-bold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Handle delete here - you'll add your delete logic
                    deleteFolder(deleteConfirmModal.folderId);
                    setDeleteConfirmModal({ isOpen: false, folderId: null, folderName: null });
                  }}
                  className="flex-1 py-3 font-bold bg-red-600 text-white rounded-xl hover:scale-[1.02] hover:shadow-lg hover:shadow-red-500/30 transition-all"
                >
                  Delete Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- IMPORT MODAL --- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-100 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setIsImportModalOpen(false)}>
          <div className="bg-white w-full max-w-md rounded-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
              <div className="absolute top-[-50%] left-[-50%] w-full h-full bg-indigo-500/30 blur-3xl rounded-full" />
              <div className="relative z-10">
                <div className="w-16 h-16 mx-auto bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4 text-white border border-white/10 shadow-2xl">
                  <HardDrive className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black text-white">Import from Drive</h2>
                <p className="text-slate-400 text-sm mt-2">Sync your Google Drive folder to MixMaker</p>
              </div>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Folder Name</label>
                <input type="text" value={folderName} onChange={(e) => { setFolderName(e.target.value) }} placeholder="e.g. My Playlist" className="w-full p-4 bg-slate-50 rounded-xl font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Drive Link</label>
                <input type="text" value={driveLink} onChange={(e) => setDriveLink(e.target.value)} placeholder="https://drive.google.com/..." className="w-full p-4 bg-slate-50 rounded-xl font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                <button onClick={() => { setIsImportModalOpen(false); saveToMongoDb() }} className="flex-1 py-4 font-bold bg-indigo-600 text-white rounded-xl hover:scale-[1.02] hover:shadow-lg hover:shadow-indigo-500/30 transition-all">Import Folder</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.05); border-radius: 20px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.1); }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 10s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default MixMaker;