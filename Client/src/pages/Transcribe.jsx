import React, { useState, useEffect } from 'react';
import {
   UploadCloud, FileAudio, Settings, Download,
   Cpu, Languages, Play, Pause, Eraser, Wand2,
   ChevronDown, Type, AlignLeft, UserCheck,
   Split, Save, FileText, FileCode, Film, Copy, Check,
   Maximize2, MoreHorizontal, History
} from 'lucide-react';

const Transcribe = () => {
   // --- STATE ---
   const [isProcessing, setIsProcessing] = useState(false);
   const [hasResult, setHasResult] = useState(false);
   const [isPlaying, setIsPlaying] = useState(false);
   const [copied, setCopied] = useState(false);

   // Configuration
   const [selectedModel, setSelectedModel] = useState('base');
   const [selectedLanguage, setSelectedLanguage] = useState('auto');
   const [timestamps, setTimestamps] = useState(true);
   const [diarization, setDiarization] = useState(false);
   const [wordsPerLine, setWordsPerLine] = useState(8);
   const [maxChars, setMaxChars] = useState(42);
   const [renderMode, setRenderMode] = useState('cloud'); // 'cloud' | 'local'

   // Effect to handle model selection based on render mode
   useEffect(() => {
      if (renderMode === 'local') {
         setSelectedModel('base');
      }
   }, [renderMode]);

   // Mock Transcription Data
   const [transcription, setTranscription] = useState(
      `[00:00:00] Speaker A: Welcome to the future of audio processing. This interface is designed to be clean, efficient, and powerful.\n\n[00:00:08] Speaker B: Absolutely. The glassmorphism effects really add a layer of depth that feels modern and professional.\n\n[00:00:15] Speaker A: We've removed all the green accents and replaced them with a neutral slate and subtle violet palette. It's much easier on the eyes for long editing sessions.`
   );

   const handleTranscribe = () => {
      setIsProcessing(true);
      setTimeout(() => {
         setIsProcessing(false);
         setHasResult(true);
      }, 2000);
   };

   const handleCopy = () => {
      navigator.clipboard.writeText(transcription);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
   };

   return (
      <div className="relative h-screen w-full bg-[#F0F4F8] text-slate-800 font-sans overflow-hidden selection:bg-violet-200 selection:text-violet-900">

         {/* --- BACKGROUND ACCENTS --- */}
         <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-200/40 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-200/40 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
         </div>

         {/* --- MAIN LAYOUT (Sidebar + Content) --- */}
         <div className="relative z-10 flex h-full">

            {/* ==========================================
            LEFT SIDEBAR (Fixed Width)
            Fits beneath the navbar (approx 80px top padding)
           ========================================== */}
            <div className="w-[400px] h-full flex flex-col pt-28 pb-6 px-6 gap-6 overflow-y-auto custom-scrollbar shrink-0 border-r border-slate-200/50 bg-white/30 backdrop-blur-sm">

               {/* Upload Card */}
               <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-1 shadow-sm border border-white/60 shrink-0">
                  <div className="border-2 border-dashed border-slate-200 rounded-[1.8rem] p-6 text-center hover:bg-slate-50 hover:border-violet-300 transition-all cursor-pointer group flex flex-col items-center gap-3">
                     <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform group-hover:bg-violet-50">
                        <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-violet-500" />
                     </div>
                     <div>
                        <p className="text-sm font-bold text-slate-700">Upload Audio</p>
                        <p className="text-[10px] text-slate-400 font-medium">MP3, WAV (Max 500MB)</p>
                     </div>
                  </div>
               </div>

               {/* Settings Panel */}
               <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] flex-1 border border-white/60 shadow-sm flex flex-col overflow-hidden min-h-[400px]">
                  <div className="p-5 border-b border-slate-100 flex items-center gap-2">
                     <Settings className="w-4 h-4 text-slate-400" />
                     <span className="text-xs font-black uppercase tracking-widest text-slate-400">Settings</span>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">

                     {/* Render Mode Switch */}
                     <div className="bg-slate-50 p-1 rounded-xl flex relative">
                        <div
                           className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-out ${renderMode === 'cloud' ? 'left-1' : 'left-[calc(50%+4px)]'}`}
                        />
                        <button
                           onClick={() => setRenderMode('cloud')}
                           className={`flex-1 relative z-10 text-xs font-bold py-2 text-center transition-colors ${renderMode === 'cloud' ? 'text-violet-600' : 'text-slate-500'}`}
                        >
                           Cloud Render
                        </button>
                        <button
                           onClick={() => setRenderMode('local')}
                           className={`flex-1 relative z-10 text-xs font-bold py-2 text-center transition-colors ${renderMode === 'local' ? 'text-violet-600' : 'text-slate-500'}`}
                        >
                           Local Render
                        </button>
                     </div>

                     {/* Model */}
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-600">Model Size</label>
                        <div className="relative">
                           <select
                              value={selectedModel}
                              onChange={(e) => setSelectedModel(e.target.value)}
                              disabled={renderMode === 'local'}
                              className={`w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-all`}
                           >
                              <option value="base">Whisper Base {renderMode === 'local' && '(Default)'}</option>
                              {renderMode === 'cloud' && (
                                 <>
                                    <option value="small">Whisper Small</option>
                                    <option value="large">Whisper Large</option>
                                 </>
                              )}
                           </select>
                           <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                     </div>

                     {/* Language */}
                     <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-600">Language</label>
                        <div className="relative">
                           <select
                              value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}
                              className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-violet-500/20"
                           >
                              <option value="auto">Auto Detect</option>
                              <option value="en">English</option>
                              <option value="es">Spanish</option>
                           </select>
                           <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                        </div>
                     </div>

                     {/* Toggles */}
                     <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-600">Timestamps</span>
                           <button
                              onClick={() => setTimestamps(!timestamps)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${timestamps ? 'bg-violet-500' : 'bg-slate-300'}`}
                           >
                              <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${timestamps ? 'translate-x-5' : ''}`} />
                           </button>
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-600">Speaker ID</span>
                           <button
                              onClick={() => setDiarization(!diarization)}
                              className={`w-10 h-5 rounded-full transition-colors relative ${diarization ? 'bg-violet-500' : 'bg-slate-300'}`}
                           >
                              <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${diarization ? 'translate-x-5' : ''}`} />
                           </button>
                        </div>
                     </div>

                     {/* Formatting Sliders */}
                     <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="space-y-2">
                           <div className="flex justify-between items-center">
                              <label className="text-xs font-bold text-slate-600">Words per Line</label>
                              <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">{wordsPerLine}</span>
                           </div>
                           <input
                              type="range" min="1" max="20"
                              value={wordsPerLine} onChange={(e) => setWordsPerLine(Number(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
                           />
                        </div>

                        <div className="space-y-2">
                           <div className="flex justify-between items-center">
                              <label className="text-xs font-bold text-slate-600">Max Characters</label>
                              <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">{maxChars}</span>
                           </div>
                           <input
                              type="range" min="10" max="100" step="2"
                              value={maxChars} onChange={(e) => setMaxChars(Number(e.target.value))}
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-violet-500"
                           />
                        </div>
                     </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                     <button
                        onClick={handleTranscribe}
                        disabled={isProcessing}
                        className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold shadow-lg hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        {isProcessing ? 'Processing...' : 'Start'}
                     </button>
                  </div>
               </div>
            </div>

            {/* ==========================================
            RIGHT MAIN AREA (Editor)
            No top padding, fills the rest
           ========================================== */}
            <div className="flex-1 h-full p-4 md:p-6 flex flex-col gap-4 min-w-0">

               {/* Editor Card */}
               <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-sm flex flex-col overflow-hidden relative">

                  {/* Toolbar */}
                  <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white/30">
                     <div className="flex items-center gap-1">
                        <button className="p-2 rounded-lg hover:bg-white/80 text-slate-500 transition-all"><Type className="w-4 h-4" /></button>
                        <button className="p-2 rounded-lg hover:bg-white/80 text-slate-500 transition-all"><AlignLeft className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-slate-300 mx-2" />
                        <button className="p-2 rounded-lg hover:bg-white/80 text-slate-500 transition-all"><Split className="w-4 h-4" /></button>
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={handleCopy} className="text-xs font-bold text-slate-500 hover:text-violet-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-violet-50">
                           {copied ? 'Copied!' : 'Copy Text'}
                        </button>
                        <button className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all"><Eraser className="w-4 h-4" /></button>
                     </div>
                  </div>

                  {/* Text Area */}
                  <div className="flex-1 relative">
                     {!hasResult && !isProcessing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 pointer-events-none select-none">
                           <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mb-4 border border-slate-100">
                              <FileText className="w-8 h-8 opacity-30" />
                           </div>
                           <p className="font-bold text-lg text-slate-400">Ready to Transcribe</p>
                        </div>
                     )}
                     <textarea
                        className="w-full h-full resize-none bg-transparent p-8 outline-none text-lg leading-loose text-slate-700 font-medium custom-scrollbar"
                        value={hasResult ? transcription : ''}
                        onChange={(e) => setTranscription(e.target.value)}
                        spellCheck={false}
                     />
                  </div>

                  {/* Footer / Player */}
                  <div className="p-4 bg-white/40 border-t border-slate-100 flex items-center gap-4">
                     <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md shrink-0"
                     >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                     </button>

                     <div className="flex-1 flex flex-col justify-center gap-1">
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden w-full">
                           <div className="h-full bg-violet-500 w-[30%] rounded-full" />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-400">
                           <span>00:12</span>
                           <span>03:45</span>
                        </div>
                     </div>

                     <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                        <button className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold shadow-sm hover:border-violet-200 hover:text-violet-600 transition-all flex items-center gap-2">
                           <Download className="w-3.5 h-3.5" /> Export
                        </button>
                     </div>
                  </div>
               </div>

            </div>

         </div>

         <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(148, 163, 184, 0.2); border-radius: 20px; }
        .custom-scrollbar:hover::-webkit-scrollbar-thumb { background-color: rgba(148, 163, 184, 0.4); }
        
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob { animation: blob 10s infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
      </div>
   );
};

export default Transcribe;