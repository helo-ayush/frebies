import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileAudio, Settings, Wand2, FileText, Type, AlignLeft, Split, Download, Lock, Unlock, Trash2, Copy } from 'lucide-react';

// Custom Select Component
const CustomSelect = ({ label, value, onChange, options, disabled }) => (
   <div className="space-y-2">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</label>
      <div className="relative">
         <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl py-3 px-4 pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:border-indigo-200 cursor-pointer"
         >
            {options.map((opt) => (
               <option key={opt.value} value={opt.value}>
                  {opt.label}
               </option>
            ))}
         </select>
         <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
         </div>
      </div>
   </div>
);

const Transcribe = () => {
   // --- STATE ---
   const [isProcessing, setIsProcessing] = useState(false);
   const [hasResult, setHasResult] = useState(false);
   const [isPlaying, setIsPlaying] = useState(false);
   const [copied, setCopied] = useState(false);
   const [file, setFile] = useState(null);
   const [progress, setProgress] = useState(0);
   const [transcription, setTranscription] = useState('');
   const [isLocked, setIsLocked] = useState(true); // Default locked

   // Configuration
   const [selectedModel, setSelectedModel] = useState('base');
   const [selectedLanguage, setSelectedLanguage] = useState('auto');
   const [timestamps, setTimestamps] = useState(true);
   const [wordsPerLine, setWordsPerLine] = useState(8);
   const [beamSize, setBeamSize] = useState(5);
   const [renderMode, setRenderMode] = useState('cloud'); // 'cloud' | 'local'
   const fileInputRef = useRef(null);

   const handleUploadClick = () => {
      fileInputRef.current.click();
   };

   const handleFileChange = (event) => {
      const selectedFile = event.target.files[0];
      if (selectedFile) {
         setFile(selectedFile);
      }
   };

   // Effect to handle model selection based on render mode
   useEffect(() => {
      if (renderMode === 'local') {
         setSelectedModel('base');
      }
   }, [renderMode]);

   const [statusMessage, setStatusMessage] = useState('Initializing...');

   const handleTranscribe = async () => {
      if (!file) {
         alert("Please select a file first!");
         return;
      }
      setIsProcessing(true);
      setProgress(0);
      setStatusMessage('Initializing...');

      try {
         // 1. Create FormData
         const formData = new FormData();
         formData.append('file', file);
         formData.append('model_size', selectedModel);
         formData.append('language', selectedLanguage);
         formData.append('timestamps', timestamps);
         formData.append('words_per_line', wordsPerLine);
         formData.append('beam_size', beamSize);

         // 2. Send Request
         const apiUrl = renderMode === 'local'
            ? 'http://localhost:8000/transcribe'
            : 'https://helo-ayush-frebies-transcribe.hf.space/transcribe';

         const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData,
         });

         if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
         }

         // 3. Handle Streaming Response
         const reader = response.body.getReader();
         const decoder = new TextDecoder();
         let buffer = '';

         while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');

            // Process all complete lines
            buffer = lines.pop() || ''; // Keep the last incomplete line in buffer

            for (const line of lines) {
               if (!line.trim()) continue;
               try {
                  const event = JSON.parse(line);

                  if (event.type === 'progress') {
                     setProgress(event.progress);
                     setStatusMessage(event.message || 'Processing...');
                  } else if (event.type === 'result') {
                     const data = event.data;
                     setTranscription(data.formatted_text || data.text);
                     setHasResult(true);
                     setStatusMessage('Complete!');
                  } else if (event.type === 'error') {
                     throw new Error(event.message);
                  }
               } catch (e) {
                  console.warn("Error parsing stream chunk:", e);
               }
            }
         }
      } catch (error) {
         console.error("Transcription failed:", error);
         alert("Transcription failed. Please try again.");
      } finally {
         setIsProcessing(false);
         setProgress(0);
      }
   };

   const handleCopy = () => {
      navigator.clipboard.writeText(transcription);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
   };

   const handleExportSRT = () => {
      if (!transcription) return;
      const blob = new Blob([transcription], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcription.srt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   };

   const handleExportTXT = () => {
      if (!transcription) return;
      // Simple strip of timestamps for TXT export if needed, or just dump raw
      // For now, let's dump raw as requested, or maybe a simple cleanup?
      // Let's just dump the current view.
      const blob = new Blob([transcription], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'transcription.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
   };

   const handleClear = () => {
      if (window.confirm("Are you sure you want to clear the transcription?")) {
         setTranscription('');
         setHasResult(false);
         setProgress(0);
         setStatusMessage('Initializing...');
      }
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
                  <div
                     onClick={handleUploadClick}
                     className={`border-2 border-dashed rounded-[1.8rem] p-6 text-center transition-all cursor-pointer group flex flex-col items-center gap-3 ${file ? 'border-indigo-300 bg-indigo-50/30' : 'border-slate-200 hover:bg-slate-50 hover:border-indigo-300'}`}
                  >
                     <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="audio/*"
                     />

                     {file ? (
                        <>
                           <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm">
                              <FileAudio className="w-6 h-6 text-indigo-600" />
                           </div>
                           <div className="w-full overflow-hidden">
                              <p className="text-sm font-bold text-indigo-700 truncate px-2">{file.name}</p>
                              <p className="text-[10px] text-indigo-400 font-medium">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                           </div>
                        </>
                     ) : (
                        <>
                           <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform duration-300 group-hover:bg-indigo-50 group-hover:shadow-md">
                              <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                           </div>
                           <div>
                              <p className="text-sm font-bold text-slate-700 group-hover:text-indigo-700 transition-colors">Upload Audio</p>
                              <p className="text-[10px] text-slate-400 font-medium">MP3, WAV, AAC...</p>
                           </div>
                        </>
                     )}
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
                           { value: 'hi', label: 'Hindi' },
                           { value: 'es', label: 'Spanish' },
                           { value: 'fr', label: 'French' },
                           { value: 'de', label: 'German' }
                        ]}
                     />

                     {/* Words Per Line */}
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

                     {/* Beam Size */}
                     <div className="space-y-2">
                        <div className="flex justify-between items-center">
                           <label className="text-xs font-bold text-slate-600">Beam Size</label>
                           <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-600">{beamSize}</span>
                        </div>
                        <input
                           type="range" min="1" max="10"
                           value={beamSize} onChange={(e) => setBeamSize(Number(e.target.value))}
                           className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <p className="text-[10px] text-slate-400">Lower = Faster, Higher = More Accurate</p>
                     </div>

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
                  <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-white/30 relative z-50 pointer-events-auto">
                     <div className="flex items-center gap-1">
                        {/* Lock / Unlock */}
                        <button
                           onClick={() => setIsLocked(!isLocked)}
                           className={`p-2 rounded-lg transition-all cursor-pointer hover:shadow-sm ${isLocked ? 'text-indigo-600 bg-indigo-50' : 'text-slate-500 hover:bg-white/80 hover:text-slate-800'}`}
                           title={isLocked ? "Unlock Editing" : "Lock Editing"}
                        >
                           {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>

                        {/* Download TXT */}
                        <button
                           onClick={handleExportTXT}
                           className="p-2 rounded-lg hover:bg-white/80 text-slate-500 hover:text-slate-800 transition-all cursor-pointer hover:shadow-sm"
                           title="Download as .txt"
                        >
                           <FileText className="w-4 h-4" />
                        </button>

                        <div className="w-px h-4 bg-slate-300 mx-2" />

                        {/* Clear */}
                        <button
                           onClick={handleClear}
                           className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all cursor-pointer hover:shadow-sm"
                           title="Clear Transcription"
                        >
                           <Trash2 className="w-4 h-4" />
                        </button>
                     </div>
                     <div className="flex items-center gap-2">
                        <button onClick={handleCopy} className="text-xs font-bold text-slate-500 hover:text-indigo-600 transition-all px-3 py-1.5 rounded-lg hover:bg-indigo-50 cursor-pointer active:scale-95 flex items-center gap-2">
                           {copied ? 'Copied!' : <><Copy className="w-3.5 h-3.5" /> Copy Text</>}
                        </button>
                        <button
                           onClick={handleExportSRT}
                           className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold shadow-sm hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                        >
                           <Download className="w-3.5 h-3.5" /> Export SRT
                        </button>
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
                        className={`w-full h-full resize-none bg-transparent p-8 outline-none text-lg leading-loose text-slate-700 font-medium custom-scrollbar ${isLocked ? 'cursor-default' : ''}`}
                        value={hasResult ? transcription : ''}
                        onChange={(e) => !isLocked && setTranscription(e.target.value)}
                        readOnly={isLocked}
                        spellCheck={false}
                     />
                  </div>

                  {/* Footer / Progress Area */}
                  <div className="p-4 bg-white/40 border-t border-slate-100">
                     {isProcessing ? (
                        <div className="flex flex-col gap-2 animate-in fade-in duration-300">
                           <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                              <span className="flex items-center gap-2">
                                 <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                                 {statusMessage}
                              </span>
                              <span>{Math.round(progress)}%</span>
                           </div>
                           <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                 className="h-full bg-indigo-500 rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                                 style={{ width: `${Math.max(2, progress)}%` }}
                              >
                                 <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite] skew-x-12" />
                              </div>
                           </div>
                        </div>
                     ) : (
                        <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                           <span className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${hasResult ? 'bg-green-500' : 'bg-slate-300'}`} />
                              {hasResult ? 'Transcription Complete' : 'Ready to Start'}
                              {isLocked && hasResult && <Lock className="w-3 h-3 ml-1 opacity-50" />}
                           </span>
                           {hasResult && <span>{transcription.length} chars</span>}
                        </div>
                     )}
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
           @keyframes shimmer {
             0% { transform: translateX(-100%) skewX(-12deg); }
             100% { transform: translateX(200%) skewX(-12deg); }
           }
           .animate-blob { animation: blob 10s infinite; }
           .animation-delay-2000 { animation-delay: 2s; }
         `}</style>
      </div>
   );
};

export default Transcribe;
