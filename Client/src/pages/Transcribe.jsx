import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileAudio, Settings, Wand2, FileText, Type, AlignLeft, Split, Download, Lock, Unlock, Trash2, Copy, Clock, CheckCircle2, History, Loader2, AlertCircle, Save, X } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';

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
   const { user } = useUser();

   // --- STATE ---
   const [isProcessing, setIsProcessing] = useState(false);
   const [file, setFile] = useState(null);

   // Active Job State (Preview Area)
   const [activeJobId, setActiveJobId] = useState(null);
   const [progress, setProgress] = useState(0);
   const [statusMessage, setStatusMessage] = useState('Idle');
   const [transcriptionResult, setTranscriptionResult] = useState(null);
   const [previewStatus, setPreviewStatus] = useState('idle'); // idle, loading, streaming, completed, error
   const [activeJobError, setActiveJobError] = useState(null);

   // History State
   const [history, setHistory] = useState([]);
   const [isLoadingHistory, setIsLoadingHistory] = useState(false);

   // Editor State
   const [isLocked, setIsLocked] = useState(true);
   const [copied, setCopied] = useState(false);
   const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, jobId: null });
   const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

   // Configuration
   const [selectedModel, setSelectedModel] = useState('base');
   const [selectedLanguage, setSelectedLanguage] = useState('auto');
   const [timestamps, setTimestamps] = useState(true);
   const [wordsPerLine, setWordsPerLine] = useState(8);
   const [beamSize, setBeamSize] = useState(5);

   const fileInputRef = useRef(null);
   const streamControllerRef = useRef(null);

   // --- INITIAL FETCH ---
   useEffect(() => {
      if (user) {
         fetchHistory();
         const interval = setInterval(fetchHistory, 3000); // Poll for updates every 3s
         return () => clearInterval(interval);
      }
   }, [user]);

   const fetchHistory = async () => {
      if (!user) return;
      try {
         const res = await fetch(`${import.meta.env.VITE_HUGGING_FACE_TRANSCRIBER}/transcriptions/${user.id}`);
         if (res.ok) {
            const data = await res.json();
            setHistory(data);
         }
      } catch (err) {
         console.error("Failed to fetch history", err);
      }
   };

   // --- STREAMING LOGIC ---
   useEffect(() => {
      if (!activeJobId) {
         setTranscriptionResult(null);
         setProgress(0);
         setStatusMessage('Idle');
         setPreviewStatus('idle');
         return;
      }

      const job = history.find(j => j._id === activeJobId);

      if (job) {
         if (job.status === 'completed' && job.result) {
            setTranscriptionResult(job.result);
            setPreviewStatus('completed');
            setProgress(100);
            setStatusMessage('Completed');
            return;
         }
         if (job.status === 'failed') {
            setPreviewStatus('error');
            setActiveJobError(job.message || job.error);
            return;
         }
      }

      setPreviewStatus('streaming');
      startStreaming(activeJobId);

      return () => {
         if (streamControllerRef.current) {
            streamControllerRef.current.abort();
         }
      };
   }, [activeJobId, history.length]);

   const startStreaming = async (jobId) => {
      if (streamControllerRef.current) {
         streamControllerRef.current.abort();
      }
      const controller = new AbortController();
      streamControllerRef.current = controller;

      try {
         const response = await fetch(`${import.meta.env.VITE_HUGGING_FACE_TRANSCRIBER}/stream/${jobId}`, {
            signal: controller.signal
         });

         if (!response.ok) throw new Error("Stream connection failed");

         const reader = response.body.getReader();
         const decoder = new TextDecoder();
         let buffer = '';

         while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
               if (!line.trim()) continue;
               try {
                  const event = JSON.parse(line);
                  if (event.type === 'progress') {
                     setProgress(event.progress);
                     setStatusMessage(event.message);
                  } else if (event.type === 'result') {
                     setTranscriptionResult(event.data);
                     setPreviewStatus('completed');
                     setProgress(100);
                     setStatusMessage('Complete!');
                     fetchHistory();
                  } else if (event.type === 'error') {
                     setPreviewStatus('error');
                     setActiveJobError(event.message);
                     fetchHistory();
                  }
               } catch (e) {
                  // ignore
               }
            }
         }
      } catch (error) {
         if (error.name !== 'AbortError') {
            console.warn("Stream disconnected:", error.message);
         }
      }
   };

   // --- ACTIONS ---

   const handleUploadClick = () => {
      fileInputRef.current.click();
   };

   const handleFileChange = (event) => {
      const selectedFile = event.target.files[0];
      if (selectedFile) {
         setFile(selectedFile);
      }
   };

   const handleTranscribe = async () => {
      if (!file || !user) {
         alert("Please select a file and ensure you are logged in!");
         return;
      }
      setIsProcessing(true);

      try {
         const activeUserId = user.id;
         const apiUrl = `${import.meta.env.VITE_HUGGING_FACE_TRANSCRIBER}/transcribe`;

         const formData = new FormData();
         formData.append('file', file);
         formData.append('user_id', activeUserId);
         formData.append('model_size', selectedModel);
         formData.append('language', selectedLanguage);
         formData.append('timestamps', timestamps);
         formData.append('words_per_line', wordsPerLine);
         formData.append('beam_size', beamSize);

         const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData,
         });

         if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
         }

         const data = await response.json();
         await fetchHistory();
         setActiveJobId(data.jobId);

      } catch (error) {
         console.error("Submission failed:", error);
         alert("Failed to submit job. Please try again.");
      } finally {
         setIsProcessing(false);
      }
   };

   // --- NEW ACTIONS ---
   const showNotification = (message, type = 'success') => {
      setNotification({ show: true, message, type });
      setTimeout(() => setNotification(prev => ({ ...prev, show: false })), 3000);
   };

   const handleSave = async () => {
      if (!activeJobId || !transcriptionResult?.formatted_text) return;
      try {
         const response = await fetch(`${import.meta.env.VITE_HUGGING_FACE_TRANSCRIBER}/transcription/${activeJobId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: transcriptionResult.formatted_text })
         });

         if (response.ok) {
            showNotification("Transcription saved successfully!", "success");
            fetchHistory();
         } else {
            showNotification("Failed to save transcription.", "error");
         }
      } catch (error) {
         console.error("Save failed:", error);
         showNotification("Error saving transcription.", "error");
      }
   };

   const handleDelete = (jobId, e) => {
      e.stopPropagation();
      setDeleteConfirmation({ isOpen: true, jobId });
   };

   const confirmDelete = async () => {
      const jobId = deleteConfirmation.jobId;
      if (!jobId) return;

      try {
         const response = await fetch(`${import.meta.env.VITE_HUGGING_FACE_TRANSCRIBER}/transcription/${jobId}`, {
            method: 'DELETE'
         });

         if (response.ok) {
            if (activeJobId === jobId) {
               setActiveJobId(null);
               setTranscriptionResult(null);
            }
            fetchHistory();
         } else {
            alert("Failed to delete transcription.");
         }
      } catch (error) {
         console.error("Delete failed:", error);
         alert("Error deleting transcription.");
      } finally {
         setDeleteConfirmation({ isOpen: false, jobId: null });
      }
   };

   const handleDownloadSRT = () => {
      if (!transcriptionResult?.formatted_text) return;

      const element = document.createElement("a");
      const file = new Blob([transcriptionResult.formatted_text], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `transcription-${activeJobId}.srt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
   };

   return (
      <div className="h-[calc(100vh-2rem)] pt-24 md:pt-4 px-4 lg:px-6 max-w-[1920px] mx-auto overflow-x-hidden">
         <div className="h-full flex flex-col lg:flex-row gap-6">

            {/* --- LEFT COLUMN: CONFIGURATION --- */}
            <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 lg:mt-24 h-[calc(100%-6rem)]">
               <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-6 overflow-y-auto custom-scrollbar h-full">

                  {/* Header */}
                  <div className="flex items-center gap-3 shrink-0">
                     <h2 className="text-2xl font-black text-slate-800 tracking-tight">Configuration</h2>
                  </div>

                  {/* File Upload */}
                  <div className="space-y-4 shrink-0">
                     <div
                        onClick={handleUploadClick}
                        className={`
                           relative group cursor-pointer overflow-hidden
                           rounded-2xl border-2 border-dashed transition-all duration-300
                           ${file ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}
                        `}
                     >
                        <input
                           type="file"
                           ref={fileInputRef}
                           onChange={handleFileChange}
                           accept="audio/*,video/*"
                           className="hidden"
                        />
                        <div className="p-8 flex flex-col items-center justify-center text-center gap-3">
                           <div className={`
                              w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300
                              ${file ? 'bg-indigo-100 text-indigo-600 shadow-indigo-200' : 'bg-slate-100 text-slate-400 group-hover:scale-110 group-hover:bg-indigo-50 group-hover:text-indigo-500'}
                              shadow-lg
                           `}>
                              {file ? <FileAudio className="w-6 h-6" /> : <UploadCloud className="w-6 h-6" />}
                           </div>
                           <div className="space-y-1">
                              <p className={`font-bold transition-colors ${file ? 'text-indigo-900' : 'text-slate-700'}`}>
                                 {file ? file.name : "Click to upload"}
                              </p>
                              {!file && <p className="text-xs text-slate-400 font-medium">MP3, WAV, M4A, MP4</p>}
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Settings */}
                  <div className="space-y-5 flex-1">
                     <div className="space-y-4">
                        <CustomSelect
                           label="Model Size"
                           options={[
                              { value: 'tiny', label: 'Tiny (Fastest)' },
                              { value: 'base', label: 'Base (Balanced)' },
                              { value: 'small', label: 'Small (Better)' },
                              { value: 'medium', label: 'Medium (Accurate)' },
                              { value: 'large-v2', label: 'Large V2 (Best)' },
                              { value: 'large-v3', label: 'Large V3 (SOTA)' },
                           ]}
                           value={selectedModel}
                           onChange={setSelectedModel}
                        />

                        <CustomSelect
                           label="Language"
                           options={[
                              { value: 'auto', label: 'Auto Detect' },
                              { value: 'en', label: 'English' },
                              { value: 'es', label: 'Spanish' },
                              { value: 'fr', label: 'French' },
                              { value: 'de', label: 'German' },
                              { value: 'it', label: 'Italian' },
                              { value: 'pt', label: 'Portuguese' },
                              { value: 'nl', label: 'Dutch' },
                              { value: 'ja', label: 'Japanese' },
                              { value: 'zh', label: 'Chinese' },
                              { value: 'hi', label: 'Hindi' },
                           ]}
                           value={selectedLanguage}
                           onChange={setSelectedLanguage}
                        />

                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Words / Line</label>
                              <input
                                 type="number"
                                 min="1"
                                 max="50"
                                 value={wordsPerLine}
                                 onChange={(e) => setWordsPerLine(parseInt(e.target.value))}
                                 className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition-all"
                              />
                           </div>
                           <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Beam Size</label>
                              <input
                                 type="number"
                                 min="1"
                                 max="10"
                                 value={beamSize}
                                 onChange={(e) => setBeamSize(parseInt(e.target.value))}
                                 className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium transition-all"
                              />
                           </div>
                        </div>

                        <div className="pt-2">
                           <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:border-indigo-200 transition-all">
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${timestamps ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'}`}>
                                 {timestamps && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <input
                                 type="checkbox"
                                 checked={timestamps}
                                 onChange={(e) => setTimestamps(e.target.checked)}
                                 className="hidden"
                              />
                              <span className="text-sm font-bold text-slate-600">Include Timestamps</span>
                           </label>
                        </div>
                     </div>
                  </div>

                  {/* Transcribe Button */}
                  <button
                     onClick={handleTranscribe}
                     disabled={isProcessing || !file}
                     className={`
                        w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-indigo-200
                        flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]
                        ${isProcessing || !file
                           ? 'bg-slate-300 cursor-not-allowed shadow-none text-slate-500'
                           : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-300'
                        }
                     `}
                  >
                     {isProcessing ? (
                        <>
                           <Loader2 className="w-5 h-5 animate-spin" />
                           <span>Processing...</span>
                        </>
                     ) : (
                        <>
                           <Wand2 className="w-5 h-5" />
                           <span>Start Transcription</span>
                        </>
                     )}
                  </button>
               </div>
            </div>

            {/* --- CENTER COLUMN: PREVIEW --- */}
            <div className="flex-1 flex flex-col gap-4 min-w-0 min-h-[500px] lg:h-full">
               <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex-1 flex flex-col relative overflow-hidden h-full">

                  {/* Header */}
                  <div className="flex items-center justify-between mb-6 shrink-0">
                     <div className="flex items-center gap-3">
                        <div>
                           <div className='flex items-center gap-2'>
                              <h2 className="text-xl font-black text-slate-800 tracking-tight">Transcription Preview</h2>
                              {previewStatus !== 'idle' && (
                                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide
                                              ${previewStatus === 'streaming' ? 'bg-amber-100 text-amber-600' : ''}
                                              ${previewStatus === 'completed' ? 'bg-green-100 text-green-600' : ''}
                                              ${previewStatus === 'error' ? 'bg-red-100 text-red-600' : ''}
                                           `}>
                                    {previewStatus}
                                 </span>
                              )}
                           </div>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        <button
                           onClick={() => setIsLocked(!isLocked)}
                           className={`p-2 rounded-xl transition-all ${isLocked ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-200'}`}
                           title={isLocked ? "Unlock to edit" : "Lock editing"}
                        >
                           {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>

                        {!isLocked && (
                           <button
                              onClick={handleSave}
                              className="p-2 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 border border-green-200 transition-all active:scale-95"
                              title="Save Changes"
                           >
                              <Save className="w-4 h-4" />
                           </button>
                        )}

                        <button
                           onClick={() => {
                              if (transcriptionResult?.formatted_text) {
                                 navigator.clipboard.writeText(transcriptionResult.formatted_text);
                                 setCopied(true);
                                 setTimeout(() => setCopied(false), 2000);
                              }
                           }}
                           className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all active:scale-95"
                           title="Copy Text"
                        >
                           {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>

                        <button
                           onClick={handleDownloadSRT}
                           disabled={!transcriptionResult?.formatted_text}
                           className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50"
                           title="Export as SRT"
                        >
                           <Download className="w-4 h-4" />
                        </button>
                     </div>
                  </div>

                  {/* Progress Bar (Visible when streaming) */}
                  {previewStatus === 'streaming' && (
                     <div className="mb-6 bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                           <div className="flex items-center gap-2">
                              <Loader2 className="w-3 h-3 text-indigo-500 animate-spin" />
                              <span className="text-xs font-bold text-slate-700">{statusMessage}</span>
                           </div>
                           <span className="text-xs font-bold text-indigo-600">{progress}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                           <div
                              className="h-full bg-indigo-500 transition-all duration-300 ease-out rounded-full shadow-[0_0_12px_rgba(99,102,241,0.5)] relative overflow-hidden"
                              style={{ width: `${progress}%` }}
                           >
                              <div className="absolute inset-0 bg-white/30 w-full animate-[shimmer_1.5s_infinite] -skew-x-12" />
                           </div>
                        </div>
                     </div>
                  )}

                  {/* Content Area */}
                  <div className="flex-1 overflow-hidden relative rounded-2xl bg-slate-50 border border-slate-200 group/editor">
                     {activeJobId ? (
                        previewStatus === 'error' ? (
                           <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4 p-8 text-center">
                              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                                 <AlertCircle className="w-8 h-8 text-red-400" />
                              </div>
                              <div>
                                 <p className="font-bold text-slate-600">Processing Failed</p>
                                 <p className="text-sm mt-1">{activeJobError || "Unknown error occurred"}</p>
                              </div>
                           </div>
                        ) : (
                           <textarea
                              value={transcriptionResult?.formatted_text || ""}
                              readOnly={isLocked}
                              onChange={(e) => setTranscriptionResult(prev => ({ ...prev, formatted_text: e.target.value }))}
                              className="w-full h-full p-6 bg-transparent border-0 resize-none focus:ring-0 text-slate-700 font-mono text-sm leading-relaxed outline-none"
                              placeholder={previewStatus === 'streaming' ? "Transcription appearing here..." : "No result available..."}
                              spellCheck="false"
                           />
                        )
                     ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4">
                           <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                              <Split className="w-8 h-8 opacity-50" />
                           </div>
                           <p className="font-medium">Select a transcription from the history</p>
                        </div>
                     )}

                     {/* Overlay when locked */}
                     {isLocked && activeJobId && previewStatus !== 'error' && (
                        <div className="absolute top-4 right-4 pointer-events-none">
                           <div className="bg-slate-900/10 backdrop-blur-sm text-slate-500 text-[10px] font-bold px-2 py-1 rounded-md border border-slate-200/50 flex items-center gap-1.5">
                              <Lock className="w-3 h-3" />
                              Read Only
                           </div>
                        </div>
                     )}
                  </div>
               </div>
            </div>

            {/* --- RIGHT COLUMN: HISTORY --- */}
            <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
               <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 border border-slate-100 flex-1 flex flex-col relative overflow-hidden h-full">
                  <div className="flex items-center gap-3 mb-6 shrink-0">
                     <div className="flex-1">
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Recent</h2>
                     </div>
                     <button onClick={fetchHistory} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <Clock className="w-4 h-4" />
                     </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar -mr-2 pr-2 space-y-3">
                     {history.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                           <p className="text-sm">No recent transcriptions</p>
                        </div>
                     ) : (
                        history.map((job) => (
                           <div
                              key={job._id}
                              onClick={() => setActiveJobId(job._id)}
                              className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 group relative overflow-hidden
                                 ${activeJobId === job._id
                                    ? 'bg-indigo-50 border-indigo-200 shadow-sm'
                                    : 'bg-white border-slate-100 hover:border-indigo-100 hover:shadow-md'
                                 }
                              `}
                           >
                              {job.status === 'processing' && (
                                 <div className="absolute bottom-0 left-0 h-1 bg-indigo-100 w-full">
                                    <div
                                       className="h-full bg-indigo-500 transition-all duration-1000"
                                       style={{ width: `${job.progress}%` }}
                                    />
                                 </div>
                              )}

                              <div className="flex justify-between items-start mb-2 relative z-10">
                                 <h3 className={`font-bold text-sm line-clamp-1 ${activeJobId === job._id ? 'text-indigo-900' : 'text-slate-700'}`}>
                                    {job.fileName}
                                 </h3>
                                 {job.status === 'completed' ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                 ) : job.status === 'processing' || job.status === 'queued' ? (
                                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                                 ) : (
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                 )}
                              </div>

                              <div className="flex items-center justify-between text-xs relative z-10 mt-2">
                                 <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full font-medium capitalize
                                               ${job.status === 'completed' ? 'bg-green-100 text-green-700' : ''}
                                               ${job.status === 'processing' ? 'bg-amber-100 text-amber-700' : ''}
                                               ${job.status === 'queued' ? 'bg-slate-100 text-slate-600' : ''}
                                               ${job.status === 'failed' ? 'bg-red-100 text-red-600' : ''}
                                           `}>
                                       {job.status}
                                    </span>
                                    <span className="text-slate-400">
                                       {new Date(job.createdAt).toLocaleDateString()}
                                    </span>
                                 </div>
                                 <button
                                    onClick={(e) => handleDelete(job._id, e)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                                    title="Delete"
                                 >
                                    <Trash2 className="w-3.5 h-3.5" />
                                 </button>
                              </div>
                           </div>
                        ))
                     )}
                  </div>
               </div>
            </div>

         </div>

         {/* Delete Confirmation Modal */}
         {deleteConfirmation.isOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
               <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-6 text-center">
                     <div className="w-16 h-16 rounded-full bg-red-100 mx-auto flex items-center justify-center mb-4">
                        <Trash2 className="w-8 h-8 text-red-500" />
                     </div>
                     <h3 className="text-xl font-bold text-slate-800 mb-2">Delete Transcription?</h3>
                     <p className="text-slate-500 text-sm mb-6">
                        Are you sure you want to delete this transcription? This action cannot be undone.
                     </p>

                     <div className="flex gap-3">
                        <button
                           onClick={() => setDeleteConfirmation({ isOpen: false, jobId: null })}
                           className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                           Cancel
                        </button>
                        <button
                           onClick={confirmDelete}
                           className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-200 transition-all active:scale-95"
                        >
                           Delete
                        </button>
                     </div>
                  </div>
               </div>
            </div>
         )}

         {/* Toast Notification */}
         <div className={`fixed bottom-6 right-6 z-50 transition-all duration-500 transform ${notification.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'}`}>
            <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border ${notification.type === 'success'
                  ? 'bg-white border-green-100 text-green-700'
                  : 'bg-white border-red-100 text-red-700'
               }`}>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notification.type === 'success' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                  {notification.type === 'success' ? (
                     <CheckCircle2 className="w-5 h-5" />
                  ) : (
                     <AlertCircle className="w-5 h-5" />
                  )}
               </div>
               <p className="font-bold pr-2">{notification.message}</p>
            </div>
         </div>

      </div>
   );
};

export default Transcribe;
