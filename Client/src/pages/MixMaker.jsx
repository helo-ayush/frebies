/* file: Client/src/pages/MixMaker.jsx 
*/
import React, { useState, useEffect } from 'react';
import { 
  Music, Play, Pause, Plus, HardDrive, Folder, Search, 
  Settings, Download, Zap, Clock, Sliders, CheckCircle2,
  FileAudio, AlignLeft, ChevronDown, GripVertical, X
} from 'lucide-react';

const MixMaker = () => {
  // --- STATE ---
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [mixSongs, setMixSongs] = useState([]); 
  
  // Mix Configuration State
  const [mixDuration, setMixDuration] = useState(60); // Minutes
  const [crossfadeType, setCrossfadeType] = useState('auto'); // 'auto' | 'custom'
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(4);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // --- MOCK DATA ---
  const folders = [
    { id: 1, name: 'Chill Vibes 2024', count: 12, color: 'from-violet-500 to-fuchsia-500' },
    { id: 2, name: 'Gym Workout', count: 24, color: 'from-orange-400 to-amber-500' },
    { id: 3, name: 'Deep Focus', count: 8, color: 'from-emerald-400 to-teal-500' },
    { id: 4, name: 'Late Night Jazz', count: 15, color: 'from-blue-600 to-indigo-900' },
  ];

  const allSongs = [
    { id: 1, name: 'Sunset Dreams', artist: 'Luna Wave', duration: '3:45' },
    { id: 2, name: 'Neon Highway', artist: 'Synth City', duration: '4:12' },
    { id: 3, name: 'Deep Blue', artist: 'Ocean Sounds', duration: '5:30' },
    { id: 4, name: 'Coffee Shop', artist: 'Jazzy Beats', duration: '2:50' },
    { id: 5, name: 'Digital Love', artist: 'Cyber Punk', duration: '3:22' },
    { id: 6, name: 'Rainy Day', artist: 'Nature Tones', duration: '3:10' },
    { id: 7, name: 'Midnight Drive', artist: 'Retrowave', duration: '4:05' },
    { id: 8, name: 'Golden Hour', artist: 'Solaris', duration: '3:55' },
  ];

  // Filter songs for the bottom box
  const folderSongs = allSongs.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addToMix = (song) => {
    setMixSongs([...mixSongs, { ...song, uniqueId: Date.now() }]);
  };

  const removeFromMix = (uniqueId) => {
    setMixSongs(mixSongs.filter(s => s.uniqueId !== uniqueId));
  };

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExportComplete(true);
    }, 2000);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#F5F6F9] text-slate-800 font-sans overflow-x-hidden">
      
      {/* --- BACKGROUND ELEMENTS --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
         <div className="absolute top-[-10%] left-[20%] w-[600px] h-[600px] bg-indigo-300/20 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
         <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-purple-300/20 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
      </div>

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
             <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
             
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
               <button 
                 key={folder.id}
                 onClick={() => setSelectedFolderId(folder.id)}
                 className={`group w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all duration-300 ${
                   selectedFolderId === folder.id 
                   ? 'bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] ring-1 ring-white/50 translate-x-1' 
                   : 'hover:bg-white/40 text-slate-600 hover:translate-x-1'
                 }`}
               >
                 <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${folder.color} flex items-center justify-center text-white shadow-sm group-hover:scale-110 transition-transform`}>
                   <Folder className="w-4 h-4" />
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className={`font-bold text-sm truncate ${selectedFolderId === folder.id ? 'text-slate-900' : 'text-slate-700'}`}>{folder.name}</div>
                   <div className="text-[10px] text-slate-400">{folder.count} Songs</div>
                 </div>
                 {selectedFolderId === folder.id && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                 )}
               </button>
             ))}
          </div>
        </aside>

        {/* --- MAIN CONTENT --- */}
        {/* W-full to take remaining space, padded appropriately */}
        <main className="flex-1 h-full overflow-y-auto pt-24 md:pt-28 pb-10 px-4 md:px-8 custom-scrollbar relative scroll-smooth">
          
          <div className="w-full max-w-[98%] mx-auto space-y-6">
            
            {/* === BOX 1: MIX GENERATOR (Expanded Width) === */}
            <section className="relative bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] border border-white overflow-hidden">
              {/* Decorative Top Gradient */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              
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
                              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
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
                                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${crossfadeType === 'auto' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                              >
                                Auto
                              </button>
                              <button 
                                onClick={() => setCrossfadeType('custom')}
                                className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${crossfadeType === 'custom' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
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
                   <div className="bg-slate-900 rounded-3xl p-1 shadow-inner overflow-hidden flex flex-col">
                      {/* Player Visualizer */}
                      <div className="bg-slate-800/50 rounded-t-[1.3rem] p-6 relative overflow-hidden">
                          <div className="flex items-center justify-between relative z-10">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-indigo-500 flex items-center justify-center text-white font-bold">
                                  {mixSongs.length}
                                </div>
                                <div>
                                  <div className="text-white font-bold text-sm">Tracks Selected</div>
                                  <div className="text-slate-400 text-xs">Total Time: {mixSongs.reduce((acc, s) => acc + parseInt(s.duration.split(':')[0]), 0) * 1} mins</div>
                                </div>
                             </div>
                             <button 
                              onClick={() => setIsPlaying(!isPlaying)}
                              className="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                             >
                               {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                             </button>
                          </div>
                          
                          {/* Fake Visualizer Bars */}
                          <div className="flex items-end justify-between h-16 mt-6 gap-1 opacity-30">
                             {[...Array(20)].map((_, i) => (
                               <div key={i} className="w-full bg-indigo-400 rounded-t-sm transition-all duration-300" style={{ height: isPlaying ? `${Math.random() * 100}%` : '10%' }}></div>
                             ))}
                          </div>
                      </div>

                      {/* Droppable Area */}
                      <div className="flex-1 bg-slate-900 p-4 overflow-y-auto custom-scrollbar min-h-[300px]">
                         {mixSongs.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-700 rounded-2xl p-8">
                               <p className="font-bold mb-2">Mix Workspace Empty</p>
                               <p className="text-xs text-center max-w-[200px]">Add songs from the library below to start building your mix.</p>
                            </div>
                         ) : (
                            <div className="space-y-2">
                               {mixSongs.map((song, idx) => (
                                  <div key={song.uniqueId} className="flex items-center gap-3 p-3 bg-slate-800 rounded-xl border border-slate-700 animate-in slide-in-from-bottom-2 duration-200">
                                     <div className="text-slate-500 cursor-grab"><GripVertical className="w-4 h-4" /></div>
                                     <div className="w-6 h-6 rounded bg-slate-700 text-slate-400 flex items-center justify-center text-xs font-bold">{idx + 1}</div>
                                     <div className="flex-1 min-w-0">
                                        <div className="text-white text-sm font-bold truncate">{song.name}</div>
                                        <div className="text-slate-500 text-xs truncate">{song.artist}</div>
                                     </div>
                                     <button onClick={() => removeFromMix(song.uniqueId)} className="text-slate-500 hover:text-red-400 p-1"><X className="w-4 h-4" /></button>
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
            <section className="bg-white/80 backdrop-blur-lg rounded-[2rem] border border-white shadow-sm overflow-hidden">
               <div className="p-6 md:px-10 md:py-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                     <span className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Music className="w-5 h-5" />
                     </span>
                     <span>Songs in "{folders.find(f => f.id === selectedFolderId)?.name}"</span>
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

               <div className="max-h-[500px] overflow-y-auto custom-scrollbar p-4 md:p-6">
                  {folderSongs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {folderSongs.map((song, i) => (
                        <div key={song.id} className="group flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-200">
                           <div className="flex items-center gap-4 min-w-0">
                              <div className="w-10 h-10 rounded-xl bg-white text-slate-400 flex items-center justify-center font-bold text-xs shadow-sm group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                 {i + 1}
                              </div>
                              <div className="min-w-0">
                                 <div className="font-bold text-slate-800 text-sm truncate pr-2">{song.name}</div>
                                 <div className="text-xs text-slate-500 truncate">{song.artist}</div>
                              </div>
                           </div>
                           
                           <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-xs font-mono text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-100 hidden sm:block">{song.duration}</span>
                              <button 
                                onClick={() => addToMix(song)}
                                className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm active:scale-95"
                                title="Add to end of mix"
                              >
                                 <Plus className="w-5 h-5" />
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

      {/* --- IMPORT MODAL --- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setIsImportModalOpen(false)}>
           <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
                    <input type="text" placeholder="e.g. My Playlist" className="w-full p-4 bg-slate-50 rounded-xl font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Drive Link</label>
                    <input type="text" placeholder="https://drive.google.com/..." className="w-full p-4 bg-slate-50 rounded-xl font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" />
                 </div>
                 <div className="flex gap-3 pt-2">
                    <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors">Cancel</button>
                    <button onClick={() => setIsImportModalOpen(false)} className="flex-1 py-4 font-bold bg-indigo-600 text-white rounded-xl hover:scale-[1.02] hover:shadow-lg hover:shadow-indigo-500/30 transition-all">Import Folder</button>
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