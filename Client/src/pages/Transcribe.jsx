/* file: Client/src/pages/Transcribe.jsx */
import React, { useState } from 'react';
import { 
  Mic, UploadCloud, FileAudio, Settings, Download, 
  Cpu, Languages, Play, Pause, Eraser, Wand2, 
  ChevronDown, Type, AlignLeft, Clock, UserCheck,
  Split, Save, FileText, FileCode, Film
} from 'lucide-react';

const Transcribe = () => {
  // --- STATE ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasResult, setHasResult] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Configuration
  const [selectedModel, setSelectedModel] = useState('base');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  
  // Advanced Formatting (New Features)
  const [wordsPerLine, setWordsPerLine] = useState(8);
  const [maxChars, setMaxChars] = useState(42);
  const [diarization, setDiarization] = useState(false);
  
  // Mock Transcription Data
  const [transcription, setTranscription] = useState(
    `[00:00:00] Speaker 1: Welcome back to the studio. Today we're discussing the future of generative AI.\n\n[00:00:05] Speaker 2: It's a fascinating topic. The pace of innovation is just staggering. We're seeing models that can understand context in ways we never thought possible just a few years ago.\n\n[00:00:15] Speaker 1: Exactly. And for creators, this means tools like MixMaker and Transcribe are becoming essential parts of the workflow.`
  );

  const handleTranscribe = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setHasResult(true);
    }, 2000);
  };

  return (
    <div className="relative min-h-screen w-full bg-[#F5F6F9] text-slate-800 font-sans overflow-x-hidden">
      
      {/* --- BACKGROUND --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
         <div className="absolute top-[-10%] left-[10%] w-[600px] h-[600px] bg-emerald-300/20 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
         <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-teal-300/20 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
      </div>

      {/* --- MAIN CONTAINER --- */}
      <div className="relative z-10 max-w-[1920px] mx-auto px-4 md:px-8 pt-24 pb-10">
        
        {/* --- GRID LAYOUT (Refined) --- */}
        {/* Left: 65% (Result/Editor) | Right: 35% (Settings/Preview) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-8 items-start h-[calc(100vh-140px)]">
          
          {/* ==========================================
              LEFT COLUMN: RESULT & EDITOR (Wide)
             ========================================== */}
          <section className="h-full flex flex-col bg-white/70 backdrop-blur-xl rounded-[2.5rem] border border-white shadow-xl shadow-emerald-900/5 overflow-hidden relative">
              {/* Top Accent */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />

              {/* Header / Toolbar */}
              <div className="bg-white/50 border-b border-slate-100 p-6 flex items-center justify-between gap-4">
                 <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                      <FileText className="w-6 h-6 text-teal-600" />
                      Transcript Editor
                    </h1>
                    {hasResult && <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold tracking-wide border border-teal-200">Synced</span>}
                 </div>

                 {hasResult && (
                   <div className="flex items-center gap-2">
                      <div className="hidden md:flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg mr-2">
                         <Clock className="w-3.5 h-3.5" /> 03:45 Total
                      </div>
                      <button className="p-2.5 rounded-xl bg-white text-slate-600 hover:text-red-500 hover:bg-red-50 border border-slate-200 hover:border-red-200 transition-all shadow-sm" title="Clear Text">
                         <Eraser className="w-4.5 h-4.5" />
                      </button>
                      <button className="p-2.5 rounded-xl bg-teal-500 text-white hover:bg-teal-600 hover:shadow-lg hover:shadow-teal-500/20 transition-all shadow-sm flex items-center gap-2 font-bold text-sm pr-4">
                         <Save className="w-4 h-4" /> Save
                      </button>
                   </div>
                 )}
              </div>

              {/* Main Text Area */}
              <div className="flex-1 p-8 relative overflow-hidden flex flex-col">
                 {!hasResult && !isProcessing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 pointer-events-none">
                       <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
                          <Type className="w-10 h-10 opacity-20" />
                       </div>
                       <p className="font-bold text-xl text-slate-300">Ready to Transcribe</p>
                       <p className="text-sm opacity-60 mt-2">Upload audio on the right to begin</p>
                    </div>
                 )}

                 {isProcessing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-20">
                       <div className="relative">
                         <div className="w-20 h-20 border-4 border-slate-100 rounded-full"></div>
                         <div className="w-20 h-20 border-4 border-teal-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                         <div className="absolute inset-0 flex items-center justify-center font-bold text-teal-600 text-xs">AI</div>
                       </div>
                       <p className="font-bold text-slate-600 mt-6 animate-pulse">Processing Audio...</p>
                    </div>
                 )}

                 {/* Editor */}
                 <textarea 
                   className="w-full h-full resize-none outline-none text-lg leading-loose text-slate-700 placeholder-slate-300 bg-transparent font-medium custom-scrollbar p-2"
                   placeholder="Transcription will appear here..."
                   value={hasResult ? transcription : ''}
                   onChange={(e) => setTranscription(e.target.value)}
                   disabled={!hasResult}
                 />
              </div>

              {/* Audio Player Footer */}
              <div className="bg-white border-t border-slate-100 p-4">
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-center gap-4">
                   <button 
                      onClick={() => setIsPlaying(!isPlaying)}
                      className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                    >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                   </button>
                   
                   <div className="flex-1">
                      <div className="flex justify-between text-xs font-bold text-slate-400 mb-1.5">
                        <span>Current Segment</span>
                        <span>00:12 / 03:45</span>
                      </div>
                      {/* Fake Waveform Visualizer */}
                      <div className="h-8 flex items-end gap-0.5 opacity-50">
                          {[...Array(60)].map((_, i) => (
                            <div key={i} className="w-full bg-teal-500 rounded-t-sm transition-all duration-300" style={{height: isPlaying ? `${20 + Math.random() * 80}%` : '30%'}} />
                          ))}
                      </div>
                   </div>
                </div>
              </div>
          </section>

          {/* ==========================================
              RIGHT COLUMN: CONFIG & PREVIEW (Decent Big)
             ========================================== */}
          <div className="flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar pr-1 pb-20">
            
            {/* 1. UPLOAD & MODEL (Collapsed view logic could be added, keeping it expanded for now) */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100">
               <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                 <Settings className="w-4 h-4" /> Configuration
               </h3>

               <div className="space-y-4">
                  {/* Upload Box */}
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:bg-slate-50 hover:border-teal-400 transition-all cursor-pointer group">
                      <UploadCloud className="w-8 h-8 text-slate-300 mx-auto mb-2 group-hover:text-teal-500 transition-colors" />
                      <p className="text-sm font-bold text-slate-600">Drop Audio File</p>
                      <p className="text-[10px] text-slate-400">or click to browse</p>
                  </div>

                  {/* Model Settings */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Model</label>
                      <div className="relative">
                         <select 
                            value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20"
                         >
                            <option value="base">Whisper Base</option>
                            <option value="large">Whisper Large</option>
                         </select>
                         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Language</label>
                      <div className="relative">
                         <select 
                            value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-teal-500/20"
                         >
                            <option value="auto">Auto Detect</option>
                            <option value="en">English</option>
                         </select>
                         <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleTranscribe}
                    disabled={isProcessing}
                    className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isProcessing ? 'Processing...' : 'Start Transcription'}
                  </button>
               </div>
            </div>

            {/* 2. FORMATTING OPTIONS (The "New Features" you requested) */}
            <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex-1">
               <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                 <Type className="w-4 h-4" /> Subtitle Formatting
               </h3>

               <div className="space-y-6">
                  
                  {/* Words Per Line */}
                  <div className="space-y-3">
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                           <AlignLeft className="w-3.5 h-3.5 text-teal-500" /> Words per Line
                        </label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-md font-bold text-slate-500">{wordsPerLine}</span>
                     </div>
                     <input 
                       type="range" min="1" max="20" step="1"
                       value={wordsPerLine} onChange={(e) => setWordsPerLine(Number(e.target.value))}
                       className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                     />
                     <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                        <span>Single Word</span>
                        <span>Sentence</span>
                     </div>
                  </div>

                  {/* Max Characters */}
                  <div className="space-y-3">
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-2">
                           <Type className="w-3.5 h-3.5 text-teal-500" /> Max Characters
                        </label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded-md font-bold text-slate-500">{maxChars}</span>
                     </div>
                     <input 
                       type="range" min="10" max="100" step="2"
                       value={maxChars} onChange={(e) => setMaxChars(Number(e.target.value))}
                       className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                     />
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* Toggles */}
                  <div className="space-y-3">
                     <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer" onClick={() => setDiarization(!diarization)}>
                        <div className="flex items-center gap-3">
                           <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${diarization ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-400'}`}>
                              <UserCheck className="w-4 h-4" />
                           </div>
                           <div>
                              <div className="text-xs font-bold text-slate-700">Speaker Detection</div>
                              <div className="text-[10px] text-slate-400">Identify who is talking</div>
                           </div>
                        </div>
                        <div className={`w-10 h-5 rounded-full transition-colors relative ${diarization ? 'bg-teal-500' : 'bg-slate-300'}`}>
                           <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform shadow-sm ${diarization ? 'translate-x-5' : ''}`} />
                        </div>
                     </div>

                     <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-teal-200 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center">
                              <Split className="w-4 h-4" />
                           </div>
                           <div>
                              <div className="text-xs font-bold text-slate-700">Split by Gap</div>
                              <div className="text-[10px] text-slate-400">New line on silence</div>
                           </div>
                        </div>
                        <div className="w-10 h-5 rounded-full bg-slate-300 relative">
                           <div className="absolute top-1 left-1 w-3 h-3 bg-white rounded-full shadow-sm" />
                        </div>
                     </div>
                  </div>

                  {/* Export Quick Links */}
                  <div className="pt-4">
                     <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Quick Export</label>
                     <div className="grid grid-cols-3 gap-2">
                        <button className="py-2.5 rounded-lg border border-slate-200 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 transition-all text-xs font-bold text-slate-500 flex flex-col items-center gap-1">
                           <FileCode className="w-4 h-4" /> SRT
                        </button>
                        <button className="py-2.5 rounded-lg border border-slate-200 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 transition-all text-xs font-bold text-slate-500 flex flex-col items-center gap-1">
                           <FileText className="w-4 h-4" /> TXT
                        </button>
                        <button className="py-2.5 rounded-lg border border-slate-200 hover:bg-teal-50 hover:border-teal-200 hover:text-teal-600 transition-all text-xs font-bold text-slate-500 flex flex-col items-center gap-1">
                           <Film className="w-4 h-4" /> VTT
                        </button>
                     </div>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </div>

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
      `}</style>
    </div>
  );
};

export default Transcribe;