import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, 
  Pause,
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Music, 
  Wind, 
  Zap, 
  Volume2,
  Brain
} from "lucide-react";

// --- Game 1: BPM Guesser ---
const BPMGuesser = () => {
  const [targetBPM, setTargetBPM] = useState(0);
  const [options, setOptions] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const nextClickTime = useRef(0);
  const timerId = useRef<number | null>(null);

  const startNewRound = () => {
    const bpm = Math.floor(Math.random() * (160 - 60 + 1)) + 60;
    setTargetBPM(bpm);
    setResult(null);
    
    const ops = [bpm];
    while (ops.length < 4) {
      const offset = (Math.floor(Math.random() * 5) + 1) * 5 * (Math.random() > 0.5 ? 1 : -1);
      const op = bpm + offset;
      if (op > 50 && op < 180 && !ops.includes(op)) ops.push(op);
    }
    setOptions(ops.sort((a, b) => a - b));
  };

  useEffect(() => {
    startNewRound();
    return () => stopMetronome();
  }, []);

  const playClick = (time: number) => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioContext.current.createOscillator();
    const envelope = audioContext.current.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, time);
    envelope.gain.setValueAtTime(0.5, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

    osc.connect(envelope);
    envelope.connect(audioContext.current.destination);

    osc.start(time);
    osc.stop(time + 0.1);
  };

  const scheduler = () => {
    while (nextClickTime.current < audioContext.current!.currentTime + 0.1) {
      playClick(nextClickTime.current);
      const secondsPerBeat = 60.0 / targetBPM;
      nextClickTime.current += secondsPerBeat;
    }
    timerId.current = window.setTimeout(scheduler, 25.0);
  };

  const startMetronome = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext.current.state === "suspended") audioContext.current.resume();
    nextClickTime.current = audioContext.current.currentTime;
    setPlaying(true);
    scheduler();
  };

  const stopMetronome = () => {
    if (timerId.current) clearTimeout(timerId.current);
    setPlaying(false);
  };

  const handleGuess = (bpm: number) => {
    if (bpm === targetBPM) {
      setResult("correct");
      stopMetronome();
    } else {
      setResult("wrong");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center justify-center p-12 bg-white/2 rounded-3xl border border-white/5 relative overflow-hidden">
         <div className="absolute top-0 right-0 p-6 opacity-5">
          <Zap size={120} />
        </div>
        <div className="mb-8">
          <button 
            onClick={playing ? stopMetronome : startMetronome}
            className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${playing ? 'bg-red-500 shadow-lg shadow-red-500/20' : 'bg-green-500 shadow-lg shadow-green-500/20'}`}
          >
            {playing ? <Pause className="text-black fill-black" size={32} /> : <Play className="text-black fill-black ml-1" size={32} />}
          </button>
        </div>
        <p className="text-[10px] uppercase text-gray-500 font-bold tracking-[0.3em]">BPM PULSE SIGNAL</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {options.map((bpm) => (
          <button
            key={bpm}
            onClick={() => handleGuess(bpm)}
            disabled={result === "correct"}
            className={`p-6 mood-card transition-all ${result === "correct" && bpm === targetBPM ? 'bg-green-500/20 border-green-500/50 text-green-500' : 'hover:border-[#5eff00]/40'}`}
          >
            <span className="text-2xl font-black italic tracking-tighter uppercase">{bpm}</span>
            <p className="text-[10px] text-gray-500 font-bold mt-1">BPM</p>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-6 rounded-2xl flex items-center justify-between ${result === "correct" ? "bg-green-500/10 border border-green-500/20 text-green-500" : "bg-red-500/10 border border-red-500/20 text-red-500"}`}
          >
            <div className="flex items-center gap-4">
              {result === "correct" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              <span className="text-xs font-black uppercase tracking-widest">{result === "correct" ? "Signal Match Confirmed" : "Negative Frequency Pattern"}</span>
            </div>
            {result === "correct" && (
              <button 
                onClick={startNewRound}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Next Sequence <RotateCcw size={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Game 2: Pitch Trainer ---
const PitchTrainer = () => {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const frequencies: Record<string, number> = {
    "C": 261.63, "C#": 277.18, "D": 293.66, "D#": 311.13, "E": 329.63, "F": 349.23,
    "F#": 369.99, "G": 391.99, "G#": 415.30, "A": 440.00, "A#": 466.16, "B": 493.88
  };
  
  const [targetNote, setTargetNote] = useState("");
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);

  const startNewRound = () => {
    const note = notes[Math.floor(Math.random() * notes.length)];
    setTargetNote(note);
    setResult(null);
  };

  useEffect(() => {
    startNewRound();
  }, []);

  const playPitch = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext.current.state === "suspended") audioContext.current.resume();
    
    setPlaying(true);
    const osc = audioContext.current.createOscillator();
    const envelope = audioContext.current.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(frequencies[targetNote], audioContext.current.currentTime);
    
    envelope.gain.setValueAtTime(0, audioContext.current.currentTime);
    envelope.gain.linearRampToValueAtTime(0.5, audioContext.current.currentTime + 0.05);
    envelope.gain.exponentialRampToValueAtTime(0.001, audioContext.current.currentTime + 1.2);

    osc.connect(envelope);
    envelope.connect(audioContext.current.destination);

    osc.start();
    osc.stop(audioContext.current.currentTime + 1.5);
    
    setTimeout(() => setPlaying(false), 1500);
  };

  const handleGuess = (note: string) => {
    if (note === targetNote) {
      setResult("correct");
    } else {
      setResult("wrong");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center justify-center p-12 bg-white/2 rounded-3xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5 text-green-500">
          <Music size={120} />
        </div>
        <button 
          onClick={playPitch}
          disabled={playing}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all bg-[#5eff00] shadow-lg shadow-[#5eff00]/10 disabled:opacity-50`}
        >
          <Volume2 className="text-black fill-black" size={32} />
        </button>
        <p className="text-[10px] uppercase text-gray-500 font-bold tracking-[0.3em] mt-8">SONIC IDENTITY PROBE</p>
      </div>

      <div className="grid grid-cols-4 lg:grid-cols-6 gap-3">
        {notes.map((note) => (
          <button
            key={note}
            onClick={() => handleGuess(note)}
            disabled={result === "correct"}
            className={`p-4 mood-card transition-all ${result === "correct" && note === targetNote ? 'bg-green-500/20 border-green-500/50 text-green-500' : 'hover:border-[#5eff00]/40'}`}
          >
            <span className="text-xl font-black">{note}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-6 rounded-2xl flex items-center justify-between ${result === "correct" ? "bg-green-500/10 border border-green-500/20 text-green-500" : "bg-red-500/10 border border-red-500/20 text-red-500"}`}
          >
            <div className="flex items-center gap-4">
              {result === "correct" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              <span className="text-xs font-black uppercase tracking-widest">{result === "correct" ? "Chromatic Calibration Confirmed" : "Spectral Interference Detected"}</span>
            </div>
            {result === "correct" && (
              <button 
                onClick={startNewRound}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Next Level <RotateCcw size={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Game 3: Interval Guessing ---
const IntervalGuessing = () => {
  const intervals = [
    { name: "m2", label: "Minor 2nd", semitones: 1 },
    { name: "M2", label: "Major 2nd", semitones: 2 },
    { name: "m3", label: "Minor 3rd", semitones: 3 },
    { name: "M3", label: "Major 3rd", semitones: 4 },
    { name: "P4", label: "Perfect 4th", semitones: 5 },
    { name: "TT", label: "Tritone", semitones: 6 },
    { name: "P5", label: "Perfect 5th", semitones: 7 },
    { name: "m6", label: "Minor 6th", semitones: 8 },
    { name: "M6", label: "Major 6th", semitones: 9 },
    { name: "m7", label: "Minor 7th", semitones: 10 },
    { name: "M7", label: "Major 7th", semitones: 11 },
    { name: "P8", label: "Octave", semitones: 12 },
  ];

  const [targetInterval, setTargetInterval] = useState<any>(null);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [playing, setPlaying] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);

  const startNewRound = () => {
    const interval = intervals[Math.floor(Math.random() * intervals.length)];
    setTargetInterval(interval);
    setResult(null);
  };

  useEffect(() => {
    startNewRound();
  }, []);

  const playInterval = () => {
    if (!audioContext.current) audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContext.current.state === "suspended") audioContext.current.resume();
    
    setPlaying(true);
    const baseFreq = 220 + Math.random() * 220; // Random starting pitch A3-A4
    const nextFreq = baseFreq * Math.pow(2, targetInterval.semitones / 12);

    const playNote = (freq: number, timeOffset: number) => {
      const osc = audioContext.current!.createOscillator();
      const envelope = audioContext.current!.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioContext.current!.currentTime + timeOffset);
      envelope.gain.setValueAtTime(0, audioContext.current!.currentTime + timeOffset);
      envelope.gain.linearRampToValueAtTime(0.5, audioContext.current!.currentTime + timeOffset + 0.05);
      envelope.gain.exponentialRampToValueAtTime(0.001, audioContext.current!.currentTime + timeOffset + 0.8);
      osc.connect(envelope);
      envelope.connect(audioContext.current!.destination);
      osc.start(audioContext.current!.currentTime + timeOffset);
      osc.stop(audioContext.current!.currentTime + timeOffset + 1);
    };

    playNote(baseFreq, 0);
    playNote(nextFreq, 0.8);
    
    setTimeout(() => setPlaying(false), 2000);
  };

  const handleGuess = (name: string) => {
    if (name === targetInterval.name) {
      setResult("correct");
    } else {
      setResult("wrong");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center justify-center p-12 bg-white/2 rounded-3xl border border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5 text-blue-500">
          <Wind size={120} />
        </div>
        <button 
          onClick={playInterval}
          disabled={playing}
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all bg-blue-500 shadow-lg shadow-blue-500/20 disabled:opacity-50`}
        >
          <Play className="text-black fill-black ml-1" size={32} />
        </button>
        <p className="text-[10px] uppercase text-gray-500 font-bold tracking-[0.3em] mt-8">RELATIONAL EAR CALIBRATION</p>
      </div>

      <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
        {intervals.map((interval) => (
          <button
            key={interval.name}
            onClick={() => handleGuess(interval.name)}
            disabled={result === "correct"}
            className={`p-4 mood-card transition-all ${result === "correct" && interval.name === targetInterval.name ? 'bg-blue-500/20 border-blue-500/50 text-blue-500' : 'hover:border-blue-500/40'}`}
          >
            <span className="text-[10px] font-black uppercase tracking-widest">{interval.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-6 rounded-2xl flex items-center justify-between ${result === "correct" ? "bg-green-500/10 border border-green-500/20 text-green-500" : "bg-red-500/10 border border-red-500/20 text-red-500"}`}
          >
            <div className="flex items-center gap-4">
              {result === "correct" ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
              <span className="text-xs font-black uppercase tracking-widest">{result === "correct" ? "Interval Synchronized" : "Harmonic Drift Detected"}</span>
            </div>
            {result === "correct" && (
              <button 
                onClick={startNewRound}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
              >
                Next Pulse <RotateCcw size={14} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const Training = () => {
  const [activeGame, setActiveGame] = useState("bpm");

  const games = [
    { id: "bpm", label: "BPM Guesser", icon: Zap, desc: "Synchronize your internal clock with varying rhythmic pulses." },
    { id: "pitch", label: "Pitch Trainer", icon: Music, desc: "Identify exact chromatic frequencies with surgical precision." },
    { id: "interval", label: "Interval Guessing", icon: Wind, desc: "Map the harmonic distance between relative signal points." }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-3">Training Grounds</h2>
          <p className="text-gray-500 font-medium max-w-md italic tracking-tight">Sharpen your sonic intuition. Mastery of the signal is the edge in any arena.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => setActiveGame(game.id)}
            className={`mood-card p-6 flex flex-col gap-4 text-left transition-all ${activeGame === game.id ? 'border-[#5eff00]/50 bg-white/2' : 'opacity-60 hover:opacity-100'}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeGame === game.id ? 'bg-[#5eff00] text-black shadow-lg shadow-[#5eff00]/20' : 'bg-white/5 text-gray-500'}`}>
              <game.icon size={20} />
            </div>
            <div>
              <h3 className="font-black italic uppercase tracking-tighter">{game.label}</h3>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 leading-relaxed">{game.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="mood-card p-1">
        <div className="h-1 w-full bg-gradient-to-r from-[#5eff00] to-transparent mb-10" />
        <div className="px-10 pb-10">
          {activeGame === "bpm" && <BPMGuesser />}
          {activeGame === "pitch" && <PitchTrainer />}
          {activeGame === "interval" && <IntervalGuessing />}
        </div>
      </div>
    </div>
  );
};
