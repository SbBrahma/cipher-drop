import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Upload, 
  Download, 
  Copy, 
  Check, 
  Wifi, 
  WifiOff, 
  File, 
  ShieldCheck, 
  ArrowRight,
  RefreshCw,
  QrCode,
  X,
  Camera,
  Moon,
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';

const CHUNK_SIZE = 64 * 1024; // 64KB

type ViewState = 'landing' | 'waiting' | 'transfer';
type ConnectionStatus = 'disconnected' | 'waiting' | 'connected' | 'error';

interface TransferFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'transferring' | 'completed' | 'error';
  speed?: number;
  type?: string;
}

export default function App() {
  const [view, setView] = useState<ViewState>('landing');
  const [roomId, setRoomId] = useState('');
  const roomIdRef = useRef('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // File transfer state
  const [sendFiles, setSendFiles] = useState<TransferFile[]>([]);
  const [receiveFiles, setReceiveFiles] = useState<TransferFile[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);
  const [activeTransferId, setActiveTransferId] = useState<string | null>(null);
  const activeTransferIdRef = useRef<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const receivedChunksRef = useRef<Record<string, ArrayBuffer[]>>({});
  const startTimeRef = useRef<number>(0);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);
  const isSendingRef = useRef<boolean>(false);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('user-joined', () => {
      setStatus('connected');
      setView('transfer');
      createOffer();
    });

    socketRef.current.on('room-created', (id) => {
      setRoomId(id);
      roomIdRef.current = id;
      setStatus('waiting');
      setView('waiting');
      setIsHost(true);
      setIsConnecting(false);
    });

    socketRef.current.on('room-joined', (id) => {
      setRoomId(id);
      roomIdRef.current = id;
      setStatus('waiting');
      setView('waiting');
      setIsHost(false);
      setIsConnecting(false);
    });

    socketRef.current.on('offer', async (offer) => {
      await handleOffer(offer);
    });

    socketRef.current.on('answer', async (answer) => {
      await handleAnswer(answer);
    });

    socketRef.current.on('ice-candidate', async (candidate) => {
      if (peerRef.current && peerRef.current.remoteDescription) {
        try {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding ice candidate", e);
        }
      } else {
        iceCandidatesQueue.current.push(candidate);
      }
    });

    socketRef.current.on('user-left', () => {
      setStatus('disconnected');
      resetConnection();
    });

    socketRef.current.on('error', (msg) => {
      setError(msg);
      setStatus('error');
      setIsConnecting(false);
    });

    return () => {
      socketRef.current?.disconnect();
      stopScanner();
    };
  }, []);

  useEffect(() => {
    activeTransferIdRef.current = activeTransferId;
  }, [activeTransferId]);

  const resetConnection = () => {
    peerRef.current?.close();
    peerRef.current = null;
    dataChannelRef.current = null;
    iceCandidatesQueue.current = [];
    setView('landing');
    setRoomId('');
    setStatus('disconnected');
    setSendFiles([]);
    setReceiveFiles([]);
    setIsTransferring(false);
    setActiveTransferId(null);
    receivedChunksRef.current = {};
    isSendingRef.current = false;
  };

  const generateRoomId = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCreateRoom = () => {
    const id = generateRoomId();
    setIsConnecting(true);
    socketRef.current?.emit('create-room', id);
  };

  const handleJoinRoom = (code?: string) => {
    const targetCode = code || inputRoomId;
    if (targetCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }
    setError('');
    setIsHost(false);
    setIsConnecting(true);
    socketRef.current?.emit('join-room', targetCode);
    stopScanner();
  };

  const startScanner = async () => {
    setIsScannerOpen(true);
    setError('');
    
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("reader");
        qrScannerRef.current = scanner;
        
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            if (/^\d{6}$/.test(decodedText)) {
              setInputRoomId(decodedText);
              handleJoinRoom(decodedText);
            }
          },
          () => {}
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setError("Could not access camera. Please check permissions.");
        setIsScannerOpen(false);
      }
    }, 100);
  };

  const stopScanner = async () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    setIsScannerOpen(false);
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('ice-candidate', { roomId: roomIdRef.current, candidate: event.candidate });
      }
    };

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      setupDataChannel(channel);
    };

    peerRef.current = pc;
    return pc;
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    
    channel.onopen = () => {
      setStatus('connected');
      setView('transfer');
    };

    channel.onmessage = (event) => {
      if (typeof event.data === 'string') {
        const metadata = JSON.parse(event.data);
        if (metadata.type === 'metadata') {
          const newFile: TransferFile = {
            id: metadata.fileId,
            name: metadata.name,
            size: metadata.size,
            progress: 0,
            status: 'transferring',
            type: metadata.fileType
          };
          setReceiveFiles(prev => [...prev, newFile]);
          setActiveTransferId(metadata.fileId);
          activeTransferIdRef.current = metadata.fileId;
          receivedChunksRef.current[metadata.fileId] = [];
          setIsTransferring(true);
          startTimeRef.current = Date.now();
        }
      } else {
        const currentId = activeTransferIdRef.current;
        if (!currentId) return;
        
        receivedChunksRef.current[currentId].push(event.data);
        const chunks = receivedChunksRef.current[currentId];
        const receivedSize = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        
        setReceiveFiles(prev => prev.map(f => {
          if (f.id === currentId) {
            const timeElapsed = (Date.now() - startTimeRef.current) / 1000;
            const speed = timeElapsed > 0 ? receivedSize / timeElapsed : 0;
            const progress = (receivedSize / f.size) * 100;
            
            if (receivedSize >= f.size) {
              // Trigger download after state update
              setTimeout(() => downloadFile(f.id, f.name, f.type), 0);
              return { ...f, progress: 100, status: 'completed', speed };
            }
            return { ...f, progress, speed };
          }
          return f;
        }));
      }
    };

    channel.onclose = () => {
      resetConnection();
    };

    dataChannelRef.current = channel;
  };

  const createOffer = async () => {
    const pc = createPeerConnection();
    const channel = pc.createDataChannel('fileTransfer');
    setupDataChannel(channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('offer', { roomId: roomIdRef.current, offer });
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Process queued candidates
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift();
      if (candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('answer', { roomId: roomIdRef.current, answer });
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (peerRef.current) {
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process queued candidates
      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift();
        if (candidate) {
          await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles: TransferFile[] = Array.from(files).map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      size: f.size,
      progress: 0,
      status: 'pending',
      type: f.type,
      file: f // Store the actual file object temporarily
    } as any));
    setSendFiles(prev => [...prev, ...newFiles]);
  };

  const startSending = () => {
    if (isSendingRef.current) return;
    processQueue();
  };

  const processQueue = async () => {
    const nextFile = sendFiles.find(f => f.status === 'pending');
    if (!nextFile || !dataChannelRef.current) {
      isSendingRef.current = false;
      setIsTransferring(false);
      return;
    }

    isSendingRef.current = true;
    setIsTransferring(true);
    setActiveTransferId(nextFile.id);
    startTimeRef.current = Date.now();

    // Update status to transferring
    setSendFiles(prev => prev.map(f => f.id === nextFile.id ? { ...f, status: 'transferring' } : f));

    const fileObj = (nextFile as any).file as File;
    
    dataChannelRef.current.send(JSON.stringify({
      type: 'metadata',
      fileId: nextFile.id,
      name: nextFile.name,
      size: nextFile.size,
      fileType: nextFile.type
    }));

    const reader = new FileReader();
    let offset = 0;

    const readNextChunk = () => {
      if (dataChannelRef.current?.readyState !== 'open') return;
      const slice = fileObj.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      const chunk = e.target?.result as ArrayBuffer;
      if (dataChannelRef.current?.readyState === 'open') {
        dataChannelRef.current.send(chunk);
        offset += chunk.byteLength;
        
        const timeElapsed = (Date.now() - startTimeRef.current) / 1000;
        const speed = timeElapsed > 0 ? offset / timeElapsed : 0;
        const progress = (offset / nextFile.size) * 100;

        setSendFiles(prev => prev.map(f => f.id === nextFile.id ? { ...f, progress, speed } : f));

        if (offset < nextFile.size) {
          // Use a small timeout to avoid blocking the main thread too much
          // and allow UI updates
          if (offset % (CHUNK_SIZE * 10) === 0) {
            setTimeout(readNextChunk, 0);
          } else {
            readNextChunk();
          }
        } else {
          setSendFiles(prev => prev.map(f => f.id === nextFile.id ? { ...f, status: 'completed', progress: 100 } : f));
          setActiveTransferId(null);
          setTimeout(processQueue, 100); // Process next file
        }
      }
    };

    readNextChunk();
  };

  const downloadFile = (fileId: string, fileName: string, fileType?: string) => {
    const chunks = receivedChunksRef.current[fileId];
    if (!chunks) return;
    
    const blob = new Blob(chunks, { type: fileType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    
    // Cleanup chunks to save memory
    delete receivedChunksRef.current[fileId];
    
    // Check if all received files are completed to stop transferring state
    setReceiveFiles(prev => {
      const allDone = prev.every(f => f.id === fileId ? true : f.status === 'completed');
      if (allDone) setIsTransferring(false);
      return prev;
    });
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSec: number) => {
    return formatSize(bytesPerSec) + '/s';
  };

  return (
    <div className={`min-h-screen transition-colors duration-500 flex items-center justify-center p-4 font-sans ${isDarkMode ? 'bg-zinc-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      
      {/* Background Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20 ${isDarkMode ? 'bg-indigo-500' : 'bg-indigo-300'}`} />
        <div className={`absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20 ${isDarkMode ? 'bg-pink-500' : 'bg-pink-300'}`} />
      </div>

      <div className={`w-full max-w-md relative z-10 backdrop-blur-2xl border rounded-[2.5rem] shadow-2xl overflow-hidden transition-all duration-500 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white/80 border-slate-200'}`}>
        
        {/* Header */}
        <div className={`p-8 text-center border-b transition-colors duration-500 ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}>
          <div className="flex justify-between items-center absolute top-6 left-6 right-6">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : status === 'waiting' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
                {status}
              </span>
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-xl transition-all ${isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white/60' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 mt-4 transition-colors duration-500 ${isDarkMode ? 'bg-white/10' : 'bg-indigo-600 shadow-lg shadow-indigo-200'}`}
          >
            <Wifi className={`w-8 h-8 ${isDarkMode ? 'text-white' : 'text-white'}`} />
          </motion.div>
          <h1 className="text-3xl font-black tracking-tight mb-1">CipherDrop</h1>
          <p className={`text-sm font-medium ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>Drop Files. Leave No Trace.</p>
        </div>

        <div className="p-8">
          <AnimatePresence mode="wait">
            {view === 'landing' && (
              <motion.div
                key="landing"
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                className="space-y-6"
              >
                <button
                  onClick={handleCreateRoom}
                  disabled={isConnecting}
                  className={`w-full py-4 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 group shadow-xl ${isDarkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Create Room
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className={`w-full border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
                    <span className={`px-4 ${isDarkMode ? 'bg-transparent text-white/20' : 'bg-white text-slate-300'}`}>Or Join Room</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="Enter 6-digit code"
                      value={inputRoomId}
                      onChange={(e) => setInputRoomId(e.target.value.replace(/\D/g, ''))}
                      className={`w-full border rounded-2xl py-4 px-6 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 transition-all placeholder:text-opacity-20 ${isDarkMode ? 'bg-white/5 border-white/10 text-white focus:ring-white/20 placeholder:text-white' : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-indigo-500/20 placeholder:text-slate-400'}`}
                    />
                    <button
                      onClick={startScanner}
                      className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-colors ${isDarkMode ? 'bg-white/10 hover:bg-white/20 text-white/60' : 'bg-slate-200 hover:bg-slate-300 text-slate-600'}`}
                      title="Scan QR Code"
                    >
                      <Camera className="w-5 h-5" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleJoinRoom()}
                    disabled={inputRoomId.length !== 6 || isConnecting}
                    className={`w-full py-4 font-bold rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isDarkMode ? 'bg-white/5 border border-white/10 text-white hover:bg-white/10' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      'Join Room'
                    )}
                  </button>
                </div>

                {error && (
                  <p className="text-red-500 text-xs font-bold text-center bg-red-500/10 py-3 rounded-xl border border-red-500/20">
                    {error}
                  </p>
                )}

                <div className={`flex items-center justify-center gap-8 pt-4 ${isDarkMode ? 'text-white/20' : 'text-slate-300'}`}>
                  <div className="flex flex-col items-center gap-1">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-[9px] uppercase font-black tracking-widest">Secure</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <WifiOff className="w-5 h-5" />
                    <span className="text-[9px] uppercase font-black tracking-widest">P2P Only</span>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'waiting' && (
              <motion.div
                key="waiting"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="text-center space-y-8"
              >
                <div className="space-y-2">
                  <p className={`text-[10px] uppercase font-black tracking-widest ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
                    {isHost ? 'Room Code' : 'Connecting to Room'}
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-5xl font-mono font-black tracking-tighter">{roomId}</span>
                    {isHost && (
                      <button 
                        onClick={copyRoomId}
                        className={`p-3 rounded-xl transition-colors ${isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                      >
                        {copied ? <Check className="w-6 h-6 text-emerald-500" /> : <Copy className="w-6 h-6" />}
                      </button>
                    )}
                  </div>
                </div>

                {isHost ? (
                  <div className="flex justify-center">
                    <div className={`p-6 rounded-[2rem] shadow-xl ${isDarkMode ? 'bg-white' : 'bg-white border border-slate-100'}`}>
                      <QRCodeSVG value={roomId} size={160} />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center py-12">
                    <div className="relative">
                      <div className={`w-24 h-24 rounded-full border-4 border-dashed animate-spin ${isDarkMode ? 'border-white/20' : 'border-indigo-200'}`} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Wifi className={`w-8 h-8 animate-pulse ${isDarkMode ? 'text-white/40' : 'text-indigo-500'}`} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-col items-center gap-4">
                  <div className={`flex items-center gap-3 px-5 py-2.5 rounded-full border transition-colors ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                    <RefreshCw className={`w-4 h-4 animate-spin ${isDarkMode ? 'text-white/40' : 'text-indigo-500'}`} />
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                      {isHost ? 'Waiting for peer...' : 'Establishing P2P connection...'}
                    </span>
                  </div>
                  <button 
                    onClick={resetConnection}
                    className={`text-xs font-bold underline underline-offset-4 transition-colors ${isDarkMode ? 'text-white/20 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}

            {view === 'transfer' && (
              <motion.div
                key="transfer"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="space-y-6"
              >
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div 
                      className={`border-2 border-dashed rounded-[2rem] p-12 text-center transition-all cursor-pointer group ${isDarkMode ? 'border-white/10 hover:border-white/30 bg-white/5' : 'border-slate-200 hover:border-indigo-300 bg-slate-50'}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleFileSelect(e.dataTransfer.files);
                      }}
                      onClick={() => document.getElementById('fileInput')?.click()}
                    >
                      <input 
                        type="file" 
                        id="fileInput" 
                        multiple
                        className="hidden" 
                        onChange={(e) => handleFileSelect(e.target.files)}
                      />
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform ${isDarkMode ? 'bg-white/10' : 'bg-indigo-100 text-indigo-600'}`}>
                        <Upload className="w-8 h-8" />
                      </div>
                      <p className="font-black text-lg mb-1">Drop Files Here</p>
                      <p className={`text-[10px] uppercase font-black tracking-widest ${isDarkMode ? 'text-white/20' : 'text-slate-400'}`}>Multiple Files Supported</p>
                    </div>

                    {sendFiles.length > 0 && (
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {sendFiles.map((f) => (
                          <motion.div 
                            key={f.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`border rounded-2xl p-4 flex items-center gap-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-white/10' : 'bg-slate-100 text-slate-600'}`}>
                              <File className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-bold truncate text-xs ${!isDarkMode && 'text-slate-900'}`}>{f.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <p className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>{formatSize(f.size)}</p>
                                {f.status === 'transferring' && (
                                  <span className="text-[9px] font-bold text-indigo-500 animate-pulse">Sending...</span>
                                )}
                                {f.status === 'completed' && (
                                  <span className="text-[9px] font-bold text-emerald-500">Sent</span>
                                )}
                              </div>
                              {f.status === 'transferring' && (
                                <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500" style={{ width: `${f.progress}%` }} />
                                </div>
                              )}
                            </div>
                            {f.status === 'pending' && (
                              <button 
                                onClick={() => setSendFiles(prev => prev.filter(item => item.id !== f.id))}
                                className={`p-2 rounded-lg hover:bg-red-500/10 text-red-500/60 hover:text-red-500 transition-colors`}
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {sendFiles.some(f => f.status === 'pending') && (
                      <button 
                        onClick={startSending}
                        disabled={isTransferring}
                        className={`w-full py-4 font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 ${isDarkMode ? 'bg-white text-zinc-950 hover:bg-zinc-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100'}`}
                      >
                        <Upload className="w-5 h-5" />
                        Send {sendFiles.filter(f => f.status === 'pending').length} Files
                      </button>
                    )}
                  </div>

                  {receiveFiles.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      <h3 className={`text-[10px] uppercase font-black tracking-widest ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Received Files</h3>
                      <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {receiveFiles.map((f) => (
                          <motion.div 
                            key={f.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`border rounded-2xl p-4 flex items-center gap-4 ${isDarkMode ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}
                          >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-white/10' : 'bg-indigo-500/10 text-indigo-500'}`}>
                              <Download className={`w-5 h-5 ${f.status === 'transferring' ? 'animate-bounce' : ''}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`font-bold truncate text-xs ${!isDarkMode && 'text-slate-900'}`}>{f.name}</p>
                              <div className="flex items-center justify-between mt-1">
                                <p className={`text-[9px] font-black uppercase tracking-widest ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>{formatSize(f.size)}</p>
                                <span className={`text-[9px] font-bold ${f.status === 'completed' ? 'text-emerald-500' : 'text-indigo-500'}`}>
                                  {f.status === 'completed' ? 'Downloaded' : `${f.progress.toFixed(0)}%`}
                                </span>
                              </div>
                              {f.status === 'transferring' && (
                                <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${f.progress}%` }} />
                                </div>
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-4">
                  <button 
                    onClick={resetConnection}
                    className={`w-full py-3 text-xs font-black uppercase tracking-widest transition-colors ${isDarkMode ? 'text-white/20 hover:text-white/60' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Disconnect
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* QR Scanner Modal */}
      <AnimatePresence>
        {isScannerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden relative shadow-2xl"
            >
              <div className="p-6 flex items-center justify-between border-b border-white/5">
                <h3 className="font-black text-lg flex items-center gap-3">
                  <div className="p-2 bg-white/10 rounded-xl">
                    <Camera className="w-5 h-5" />
                  </div>
                  Scan Room QR
                </h3>
                <button 
                  onClick={stopScanner}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-8">
                <div id="reader" className="overflow-hidden rounded-3xl bg-black aspect-square border-4 border-white/5"></div>
                <div className="mt-8 text-center space-y-2">
                  <p className="text-white font-bold">Align QR Code</p>
                  <p className="text-white/40 text-xs">
                    Point your camera at the QR code on the other device to join instantly
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
