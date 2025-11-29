import React, { useState, useEffect, useRef } from 'react';
import {
   UploadCloud, FileAudio, Settings, Download,
   Cpu, Languages, Play, Pause, Eraser, Wand2,
   ChevronDown, ChevronUp, Type, AlignLeft, UserCheck,
   Split, Save, FileText, FileCode, Film, Copy, Check,
   Maximize2, MoreHorizontal, History
} from 'lucide-react';

// --- CUSTOM DROPDOWN COMPONENT ---
const CustomSelect = ({ label, value, options, onChange, disabled }) => {
   const [isOpen, setIsOpen] = useState(false);
   const dropdownRef = useRef(null);

   useEffect(() => {
      const handleClickOutside = (event) => {
         if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
            setIsOpen(false);
         }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
   }, []);

   const selectedOption = options.find(opt => opt.value === value);

   return (
      <div className="space-y-2" ref={dropdownRef}>
         <label className="text-xs font-bold text-slate-600">{label}</label>
         <div className="relative">
            <button
               onClick={() => !disabled && setIsOpen(!isOpen)}
               disabled={disabled}
               className={`w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer hover:bg-slate-100 hover:border-indigo-200 ${disabled ? 'opacity-60 cursor-not-allowed hover:bg-slate-50 hover:border-slate-200' : ''}`}
            >
               <span>{selectedOption?.label || value}</span>
               {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isOpen && !disabled && (
               <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                     {options.map((option) => (
                        <button
                           key={option.value}
                           onClick={() => {
                              onChange(option.value);
                              setIsOpen(false);
                           }}
                           className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${value === option.value ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                        >
                           {option.label}
                           {value === option.value && <Check className="w-3.5 h-3.5" />}
                        </button>
                     ))}
                  </div>
               </div>
            )}
         </div>
      </div>
   );
};

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
      `[00:00:00] Speaker A: Welcome to the future of audio processing. This interface is designed to be clean, efficient, and powerful.\n\n[00:00:08] Speaker B: Absolutely. The glassmorphism effects really add a layer of depth that feels modern and professional.\n\n[00:00:15] Speaker A: We've removed all the green accents and replaced them with a neutral slate and subtle indigo palette. It's much easier on the eyes for long editing sessions.`
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
      <div className="relative h-screen w-full bg-[#F0F4F8] text-slate-800 font-sans overflow-y-auto md:overflow-hidden selection:bg-indigo-200 selection:text-indigo-900">

         {/* --- BACKGROUND ACCENTS --- */}
         <div className="fixed inset-0 pointer-events-none z-0">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/40 rounded-full blur-[120px] mix-blend-multiply animate-blob" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-200/40 rounded-full blur-[120px] mix-blend-multiply animate-blob animation-delay-2000" />
         </div>

         {/* --- MAIN LAYOUT (Sidebar + Content) --- */}
         <div className="relative z-10 flex flex-col md:flex-row h-auto md:h-full min-h-screen md:min-h-0">

            {/* ==========================================
            LEFT SIDEBAR (Fixed Width)
            Fits beneath the navbar (approx 80px top padding)
           ========================================== */}
            <div className="w-full md:w-[400px] h-auto md:h-full flex flex-col pt-24 md:pt-28 pb-6 px-6 gap-6 shrink-0 border-r-0 md:border-r border-b md:border-b-0 border-slate-200/50 bg-white/30 md:rounded-r-[2rem] backdrop-blur-sm overflow-y-visible md:overflow-y-auto custom-scrollbar">

               {/* Upload Card */}
               <div className="bg-white/80 backdrop-blur-xl rounded-[2rem] p-1 shadow-sm border border-white/60 shrink-0 transition-transform hover:scale-[1.02] duration-300">
                  <div className="border-2 border-dashed border-slate-200 rounded-[1.8rem] p-6 text-center hover:bg-slate-50 hover:border-indigo-300 transition-all cursor-pointer group flex flex-col items-center gap-3">
                     <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 group-hover:bg-indigo-50 group-hover:shadow-md">
                        <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                     </div>
                     <div>
                        <p className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">Upload Audio</p>
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
                     <div className="bg-slate-50 p-1 rounded-xl flex relative group/switch">
                        <div
                           className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-out ${renderMode === 'cloud' ? 'left-1' : 'left-[calc(50%+4px)]'}`}
                        />
                        <button
                           onClick={() => setRenderMode('cloud')}
                           className={`flex-1 relative z-10 text-xs font-bold py-2 text-center transition-colors cursor-pointer hover:text-indigo-700 ${renderMode === 'cloud' ? 'text-indigo-600' : 'text-slate-500'}`}
                        >
                           Cloud Render
                        </button>
                        <button
                           onClick={() => setRenderMode('local')}
                           className={`flex-1 relative z-10 text-xs font-bold py-2 text-center transition-colors cursor-pointer hover:text-indigo-700 ${renderMode === 'local' ? 'text-indigo-600' : 'text-slate-500'}`}
                        >
                           Local Render
                        </button>
                     </div>

                     {/* Model */}
                     <CustomSelect
                        label="Model Size"
                        value={selectedModel}
                        onChange={setSelectedModel}
                        disabled={renderMode === 'local'}
                        options={[
                           { value: 'base', label: `Whisper Base ${renderMode === 'local' ? '(Default)' : ''}` },
                           ...(renderMode === 'cloud' ? [
                              { value: 'small', label: 'Whisper Small' },
                              { value: 'large', label: 'Whisper Large' }
                           ] : [])
                        ]}
                     />

                     {/* Language */}
                     <CustomSelect
                        label="Language"
                        value={selectedLanguage}
                        onChange={setSelectedLanguage}
                        options={[
                           { value: 'auto', label: 'Auto Detect' },
                           { value: 'en', label: 'English' },
                           { value: 'es', label: 'Spanish' },
                           { value: 'fr', label: 'French' },
                           { value: 'de', label: 'German' }
                        ]}
                     />

                     {/* Toggles */}
                     <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-600">Timestamps</span>
                           <button
                              onClick={() => setTimestamps(!timestamps)}
                              className={`w-10 h-5 rounded-full transition-all duration-300 relative cursor-pointer hover:shadow-md ${timestamps ? 'bg-indigo-500 ring-2 ring-indigo-200' : 'bg-slate-300 hover:bg-slate-400'}`}
                           >
                              <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm ${timestamps ? 'translate-x-5' : ''}`} />
                           </button>
                        </div>
                        <div className="flex items-center justify-between">
                           <span className="text-xs font-bold text-slate-600">Speaker ID</span>
                           <button
                              onClick={() => setDiarization(!diarization)}
                              className={`w-10 h-5 rounded-full transition-all duration-300 relative cursor-pointer hover:shadow-md ${diarization ? 'bg-indigo-500 ring-2 ring-indigo-200' : 'bg-slate-300 hover:bg-slate-400'}`}
                           >
                              <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm ${diarization ? 'translate-x-5' : ''}`} />
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
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
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
                              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                           />
                        </div>
                     </div>
                  </div>

                  <div className="p-5 border-t border-slate-100 bg-slate-50/50">
                     <button
                        onClick={handleTranscribe}
                        disabled={isProcessing}
                        className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold shadow-lg hover:bg-slate-800 hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
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
            <div className="flex-1 min-h-[600px] md:min-h-0 md:h-full p-4 md:p-6 flex flex-col gap-4 min-w-0">

               {/* Editor Card */}
               <div className="flex-1 bg-white/70 backdrop-blur-xl rounded-[2.5rem] border border-white/60 shadow-sm flex flex-col overflow-hidden relative">

                  {/* Toolbar */}
                  <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white/30">
                     <div className="flex items-center gap-1">
                        <button className="p-2 rounded-lg hover:bg-white/80 text-slate-500 hover:text-slate-800 transition-all cursor-pointer hover:shadow-sm"><Type className="w-4 h-4" /></button>
                        <button className="p-2 rounded-lg hover:bg-white/80 text-slate-500 hover:text-slate-800 transition-all cursor-pointer hover:shadow-sm"><AlignLeft className="w-4 h-4" /></button>
                        <div className="w-px h-4 bg-slate-300 mx-2" />
                        <button className="p-2 rounded-lg hover:bg-white/80 text-slate-500 hover:text-slate-800 transition-all cursor-pointer hover:shadow-sm"><Split className="w-4 h-4" /></button>
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={handleCopy} className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-all px-3 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer active:scale-95">
                           {copied ? 'Copied!' : 'Copy Text'}
                        </button>
                        <button className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-all cursor-pointer hover:shadow-sm"><Eraser className="w-4 h-4" /></button>
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
                        className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:scale-110 hover:shadow-lg active:scale-95 transition-all duration-300 shadow-md shrink-0 cursor-pointer group"
                     >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current group-hover:scale-90 transition-transform" /> : <Play className="w-4 h-4 fill-current ml-0.5 group-hover:scale-110 transition-transform" />}
                     </button>

                     <div className="flex-1 flex flex-col justify-center gap-1 cursor-pointer group">
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden w-full group-hover:h-2 transition-all">
                           <div className="h-full bg-indigo-500 w-[30%] rounded-full group-hover:bg-indigo-600 transition-colors" />
                        </div>
                        <div className="flex justify-between text-[10px] font-bold text-slate-400 group-hover:text-slate-600 transition-colors">
                           <span>00:12</span>
                           <span>03:45</span>
                        </div>
                     </div>

                     <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                        <button className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold shadow-sm hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all flex items-center gap-2 cursor-pointer">
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