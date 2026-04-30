import React, { useState, useEffect, useRef } from "react";
import { 
  Music, 
  Trophy, 
  Users, 
  Timer, 
  Send, 
  Play, 
  Pause, 
  Radio, 
  Mic2, 
  Zap, 
  Settings, 
  Plus, 
  ChevronRight,
  LogOut,
  Star,
  CheckCircle2,
  Clock,
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { io, Socket } from "socket.io-client";
import { GoogleGenAI } from "@google/genai";
import { 
  getBattles, 
  createBattle, 
  getBattleInfo, 
  submitBeat, 
  getResults, 
  voteSubmission, 
  getLeaderboard,
  updateUsername,
  loginWithFirebase
} from "./lib/api";
import { signInWithGoogle } from "./lib/firebase";

// Lazy initialization for AI to prevent crashes if API key is missing during boot
let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing. AI features will not work.");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

async function generateLocalBattlePrompt() {
  const mainstreamGenres = [
    "Trap", "Boom Bap", "Lo-fi", "R&B", "Synthwave", "Afrobeats", "Phonk", "Jersey Club", "House", "Ambient",
    "Drill", "Drum & Bass", "Techno", "Hyperpop", "Reggaeton", "Future Bass", "Garage", "Grime", "Neo-Soul", "Industrial"
  ];
  const fallbackTitles = ["Lost in Echoes", "Midnight Pulse", "Neon Dreams", "Static Ghost", "Velocity", "Abstract Souls"];
  const selectedGenre = mainstreamGenres[Math.floor(Math.random() * mainstreamGenres.length)];
  const selectedTitle = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];

  try {
    const ai = getAI();
    if (!ai) throw new Error("AI not initialized");

    const promptText = `
      Generate a unique and highly creative music production prompt for a beat battle.
      Theme: High-stakes sonic warfare.
      Return a JSON object with:
      - title: 2-3 word abstract catchy title (NOT "Internal Storm" or anything generic)
      - genre: One of ${mainstreamGenres.join(", ")}
      - vibe: A descriptive mood/vibe (e.g. "Hyper-energetic", "Melancholic Cyberpunk", "Ethereal Dreamscape")
      - bpm: A reasonable integer
      Constraint: No technical constraints. Random factor: ${Math.random()}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: promptText,
      config: { responseMimeType: "application/json" }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("AI Generation Error:", error);
    return {
      title: selectedTitle,
      genre: selectedGenre,
      vibe: "Electronic and Moody",
      bpm: 100 + Math.floor(Math.random() * 40),
      constraints: ""
    };
  }
}

import { Training } from "./components/Training";

// --- Types ---
interface User {
  id: string;
  email: string;
  username: string;
  xp: number;
}

interface Battle {
  id: string;
  title: string;
  prompt: string;
  genre: string;
  bpm: number;
  constraints: string;
  status: "lobby" | "creating" | "voting" | "ended";
  startTime: number;
  duration: number; // in seconds
  creatorId: string;
  participantCount: number;
  isPrivate: boolean;
  inviteCode: string;
}

interface Submission {
  id: string;
  username: string;
  audioUrl: string;
  avgRating: number;
  voteCount: number;
}

// --- Components ---

const Sidebar = ({ user, currentTab, onTabChange, onLogout, onUpdateUser, token }: { user: User, currentTab: string, onTabChange: (tab: string) => void, onLogout: () => void, onUpdateUser: (user: User) => void, token: string }) => {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(user.username);

  useEffect(() => {
    setNewUsername(user.username);
  }, [user.username]);

  const handleUpdateUsername = async () => {
    if (newUsername.length < 3) return;
    try {
      const res = await updateUsername(token, newUsername);
      if (res.success && res.user) {
        onUpdateUser(res.user);
        setIsEditingUsername(false);
      }
    } catch (err) {
      alert("Update failed.");
    }
  };

  const tabs = [
    { id: "battles", icon: Radio, label: "Live Mood Arenas" },
    { id: "training", icon: Mic2, label: "Training Grounds" },
    { id: "leaderboard", icon: Trophy, label: "Leaderboard" }
  ];

  return (
    <div className="h-screen border-r border-white/5 flex flex-col p-8 sticky top-0 bg-[#050505]">
      <div className="flex items-center gap-4 mb-16">
        <div className="w-12 h-12 bg-[#5eff00] rounded-2xl flex items-center justify-center shadow-lg shadow-[#5eff00]/10">
          <Zap className="text-black fill-black" size={28} />
        </div>
        <h1 className="text-3xl font-black tracking-tighter uppercase italic text-white flex flex-col leading-none">
          Mood
          <span className="text-[10px] tracking-[0.4em] text-green-500 mt-1 uppercase">Battle</span>
        </h1>
      </div>

      <nav className="flex-1 space-y-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 group ${
              currentTab === tab.id 
                ? "bg-white/5 text-[#5eff00] border border-white/5" 
                : "text-gray-500 hover:text-white hover:bg-white/2"
            }`}
          >
            <tab.icon size={20} className={currentTab === tab.id ? "text-[#5eff00]" : "group-hover:text-white"} />
            <span className="text-xs font-black uppercase tracking-widest">{tab.label}</span>
            {currentTab === tab.id && (
              <motion.div layoutId="activeTab" className="ml-auto w-1.5 h-1.5 rounded-full bg-[#5eff00]" />
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto pt-8 border-t border-white/5 space-y-6">
        <div className="flex items-center gap-4 px-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white font-black text-xs shrink-0">
            {user.username.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {isEditingUsername ? (
              <div className="flex gap-1">
                <input 
                  autoFocus
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-white/5 border border-white/10 text-[10px] p-1 px-2 rounded w-full outline-none focus:border-green-500"
                />
                <button onClick={handleUpdateUsername} className="text-green-500 hover:text-white transition-colors"><CheckCircle2 size={14}/></button>
              </div>
            ) : (
              <div className="flex items-center justify-between group/user">
                <p className="text-xs font-black uppercase truncate text-white">{user.username}</p>
                <button 
                  onClick={() => setIsEditingUsername(true)}
                  className="text-gray-500 hover:text-white transition-all"
                >
                  <Settings size={12} />
                </button>
              </div>
            )}
            <p className="text-[10px] text-gray-500 font-bold mt-0.5 tracking-widest">{user.xp} XP • LVL {Math.floor(user.xp / 100) + 1}</p>
            <div className="mt-2 w-full h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${user.xp % 100}%` }}
                className="h-full bg-[#5eff00]"
              />
            </div>
            <p className="text-[8px] text-gray-600 font-black uppercase mt-1 tracking-widest leading-tight">
              {100 - (user.xp % 100)} XP TO LEVEL {Math.floor(user.xp / 100) + 2}
            </p>
          </div>
        </div>
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl text-gray-500 hover:text-red-500 hover:bg-red-500/5 transition-all text-xs font-black uppercase tracking-widest">
          <LogOut size={18} />
          <span>Sync Out</span>
        </button>
        
        <div className="mt-4 pt-6 border-t border-white/5 text-center">
          <a 
            href="https://youtube.com/@melovish?si=joZM1MsNlTXGRyXy" 
            target="_blank" 
            rel="noreferrer"
            className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-700 hover:text-[#5eff00] transition-colors"
          >
            Made by melovish
          </a>
        </div>
      </div>
    </div>
  );
};

interface BattleCardProps { 
  battle: Battle; 
  onEnter: (id: string) => void;
  key?: React.Key;
}

const BattleCard = ({ battle, onEnter }: BattleCardProps) => {
  const statusColors = {
    lobby: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    creating: "bg-red-500/20 text-red-400 border-red-500/30",
    voting: "bg-green-500/20 text-green-400 border-green-500/30",
    ended: "bg-gray-800 text-gray-500 border-white/5"
  };

  return (
    <motion.div 
      whileHover={{ y: -4, borderColor: "rgba(94, 255, 0, 0.4)" }}
      className="mood-card p-6 flex flex-col gap-6 relative overflow-hidden group cursor-pointer"
      onClick={() => onEnter(battle.id)}
    >
      <div className="flex justify-between items-start">
        <span className={`text-[10px] uppercase font-black tracking-widest px-3 py-1 rounded-full border ${statusColors[battle.status]}`}>
          {battle.status}
        </span>
        <div className="flex items-center gap-2 text-gray-500 text-[10px] font-black uppercase tracking-widest">
          <Clock size={12} />
          {battle.duration / 60}m
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-xl font-black italic tracking-tighter uppercase">{battle.title}</h3>
          {battle.isPrivate ? <Settings size={14} className="text-yellow-500" /> : null}
        </div>
        <p className="text-[10px] text-green-500 font-black tracking-[0.2em] uppercase">{battle.genre}</p>
      </div>

      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
        <div className="flex items-center gap-2 text-gray-500">
          <Users size={14} />
          <span className="text-[10px] font-black uppercase tracking-widest leading-none">
            {battle.participantCount || 0} Producers
          </span>
        </div>
        <ArrowRight size={18} className="text-gray-700 group-hover:text-green-500 group-hover:translate-x-1 transition-all" />
      </div>

      {battle.isPrivate && (
        <div className="absolute top-0 right-0 p-2 transform rotate-45 translate-x-4 -translate-y-4">
          <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[8px] font-black p-1 px-4 uppercase tracking-widest">
            Private
          </div>
        </div>
      )}
    </motion.div>
  );
};


const Login = ({ onLoginSuccess }: { onLoginSuccess: (user: User, token: string) => void }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const firebaseUser = await signInWithGoogle();
      const idToken = await firebaseUser.getIdToken();
      
      const data = await loginWithFirebase(idToken);

      if (data.token && data.user) {
        onLoginSuccess(data.user, data.token);
      } else {
        setError(data.error || "Login failed. Please try again.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Connection failed. Check your internet.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0c0d0e] p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md mood-card p-10 my-8 text-center"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-[#5eff00] rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-[#5eff00]/10">
            <Zap className="text-black fill-black" size={40} />
          </div>
          <h2 className="text-4xl font-black tracking-tighter uppercase italic text-white leading-none">Mood Battle</h2>
          <p className="text-gray-500 text-sm mt-3 font-medium italic">
            Enter the producer battlegrounds
          </p>
        </div>

        <div className="space-y-6">
          <button 
            onClick={handleGoogleLogin} 
            disabled={loading}
            className="w-full flex items-center justify-center gap-4 bg-white text-black py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] hover:bg-[#5eff00] transition-all disabled:opacity-50"
          >
            <div className="w-6 h-6 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            </div>
            {loading ? "Authenticating..." : "Login with Google"}
          </button>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black p-3 rounded-xl uppercase tracking-widest text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-[9px] text-gray-700 mt-10 uppercase tracking-[0.3em] font-black leading-relaxed">
          BY JOINING, YOU AGREE TO OUR RULES OF CREATIVE ENGAGEMENT AND HIGH-FREQUENCY PRODUCTION.
        </p>
      </motion.div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState("battles");
  const [liveBattles, setLiveBattles] = useState<any[]>([]);
  const [endedBattles, setEndedBattles] = useState<any[]>([]);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const battles = liveBattles;

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("mood_token");
      const savedUser = localStorage.getItem("mood_user");
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      }
    } catch (err) {
      console.error("Local storage access failed", err);
    } finally {
      setIsInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token && user) {
      const getSocketUrl = () => {
        const envUrl = import.meta.env.VITE_API_URL;
        if (!envUrl) return window.location.origin;
        
        try {
          // Use origin from VITE_API_URL to ensure we connect to the right host
          // without accidental path prefixes like /Abc
          const url = new URL(envUrl);
          return url.origin;
        } catch (e) {
          return window.location.origin;
        }
      };
      
      const socketUrl = getSocketUrl();
      const s = io(socketUrl);
      setSocket(s);
      fetchBattles();
      
      s.on("battle:created", () => {
        fetchBattles();
      });

      s.on("battle:updated", () => {
        fetchBattles();
      });

      return () => { s.disconnect(); };
    }
  }, [token, user, currentTab]);

  const fetchBattles = async () => {
    try {
      const data = await getBattles('live');
      setLiveBattles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await getLeaderboard();
      setLeaderboard(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (currentTab === "leaderboard") fetchLeaderboard();
    fetchBattles();
  }, [currentTab]);

  const handleLoginSuccess = (u: User, t: string) => {
    setUser(u);
    setToken(t);
    localStorage.setItem("mood_token", t);
    localStorage.setItem("mood_user", JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("mood_token");
    localStorage.removeItem("mood_user");
  };

  const [inviteCodeInput, setInviteCodeInput] = useState("");

  const handleJoinByCode = () => {
    if (inviteCodeInput.trim()) {
      setActiveBattleId(inviteCodeInput.trim().toUpperCase());
      setInviteCodeInput("");
    }
  };

  const startNewBattle = async (duration: number = 1800) => {
    try {
      const aiPrompt = await generateLocalBattlePrompt();
      const newBattle = await createBattle(token!, {
        title: aiPrompt.title || "Elite Producer Duel",
        prompt: aiPrompt.vibe || "Create a haunting atmosphere with cinematic textures.",
        genre: aiPrompt.genre || "Hybrid Trap",
        bpm: aiPrompt.bpm || 128,
        constraints: "",
        duration: duration,
        isPrivate: false
      });
      setActiveBattleId(newBattle.id);
    } catch (err) {
      alert("Failed to create battle. Try again.");
    }
  };

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-[#0c0d0e] flex items-center justify-center font-black uppercase italic text-gray-700 animate-pulse tracking-[0.4em]">
        Establishing Connection...
      </div>
    );
  }

  if (!token || !user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="mood-layout">
      <Sidebar 
        user={user} 
        currentTab={currentTab} 
        onTabChange={setCurrentTab} 
        onLogout={handleLogout} 
        onUpdateUser={(updated) => {
          setUser(updated);
          localStorage.setItem("mood_user", JSON.stringify(updated));
        }}
        token={token}
      />
      
      <main className="mood-main custom-scrollbar relative">
        <AnimatePresence mode="wait">
          {activeBattleId ? (
            <BattleRoom 
              key={`room-${activeBattleId}`}
              battleId={activeBattleId} 
              user={user} 
              token={token} 
              onClose={() => {
                setActiveBattleId(null);
                fetchBattles();
              }}
              socket={socket!}
            />
          ) : (
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="p-10 max-w-7xl mx-auto w-full"
            >
              {(currentTab === "battles") ? (
                <>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                    <div>
                      <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-3">
                        Live Mood Arenas
                      </h2>
                      <p className="text-gray-500 font-medium max-w-md italic tracking-tight">
                        Competition is the emotional catalyst. Join an arena or start your own mood session.
                      </p>
                      
                      <div className="flex gap-2 mt-6">
                        <input 
                          type="text" 
                          placeholder="ENTER INVITE CODE..." 
                          value={inviteCodeInput}
                          onChange={(e) => setInviteCodeInput(e.target.value)}
                          className="mood-input w-48 font-mono tracking-widest uppercase text-xs"
                        />
                        <button 
                          onClick={handleJoinByCode}
                          className="mood-btn py-2 px-4 text-xs font-black uppercase tracking-widest"
                        >
                          Join Code
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex bg-white/5 rounded-2xl border border-white/10 p-1 group">
                        <select 
                          onChange={(e) => startNewBattle(parseInt(e.target.value))}
                          className="bg-transparent text-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] outline-none cursor-pointer appearance-none border-r border-white/10 pr-8"
                          defaultValue=""
                        >
                          <option value="" disabled className="bg-black">SELECT DURATION</option>
                          <option value="120" className="bg-black">2 MIN BLITZ</option>
                          <option value="300" className="bg-black">5 MIN DASH</option>
                          <option value="600" className="bg-black">10 MIN SPEEDRUN</option>
                          <option value="900" className="bg-black">15 MIN SESSION</option>
                          <option value="1200" className="bg-black">20 MIN FLOW</option>
                          <option value="1800" className="bg-black">30 MIN STANDARD</option>
                          <option value="2700" className="bg-black">45 MIN MASTERY</option>
                          <option value="3600" className="bg-black">60 MIN MARATH</option>
                        </select>
                        <div className="px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#5eff00] flex items-center gap-2">
                          <Plus size={14} /> HOST
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {battles.map(battle => (
                      <BattleCard key={battle.id} battle={battle} onEnter={setActiveBattleId} />
                    ))}
                  </div>

                  {battles.length === 0 && (
                    <div className="h-[60vh] flex flex-col items-center justify-center mood-card border-dashed">
                      <Radio className="text-gray-800 mb-6 scale-[2]" size={48} />
                      <p className="text-gray-500 uppercase tracking-widest font-black text-sm">Silence in the arena</p>
                      <button onClick={() => startNewBattle(1800)} className="mt-6 text-green-500 text-xs font-bold uppercase tracking-[0.2em] border-b border-green-500/30 pb-1">Initialize Connection</button>
                    </div>
                  )}
                </>
              ) : currentTab === "leaderboard" ? (
                <div className="max-w-4xl mx-auto">
                  <div className="mb-12">
                    <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-3">Hall of Fame</h2>
                    <p className="text-gray-500 font-medium">Top producers by XP and technical dominance.</p>
                  </div>
                  <div className="mood-card overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/2">
                          <th className="p-6 text-[10px] uppercase font-black text-gray-500 tracking-widest">Rank</th>
                          <th className="p-6 text-[10px] uppercase font-black text-gray-500 tracking-widest">Producer</th>
                          <th className="p-6 text-[10px] uppercase font-black text-gray-500 tracking-widest">Combat Level</th>
                          <th className="p-6 text-[10px] uppercase font-black text-gray-500 tracking-widest text-right">XP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((u, i) => (
                          <tr key={u.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                            <td className="p-6 font-mono text-gray-500">#{String(i + 1).padStart(2, '0')}</td>
                            <td className="p-6 font-bold">{u.username}</td>
                            <td className="p-6">
                              <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded uppercase">Lvl {Math.floor(u.xp / 100) + 1}</span>
                            </td>
                            <td className="p-6 text-right font-mono font-bold text-green-500">{u.xp}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : currentTab === "training" ? (
                <Training />
              ) : (
                <div className="h-[60vh] flex flex-col items-center justify-center mood-card">
                  <h2 className="text-2xl font-black uppercase italic mb-2">{user.username}'s Studio</h2>
                  <p className="text-gray-500 text-sm">Under high-fidelity construction.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Internal View Components ---

interface BattleRoomProps { 
  key?: string;
  battleId: string; 
  user: User; 
  token: string; 
  onClose: () => void; 
  socket: Socket;
}

const BattleRoom = ({ battleId, user, token, onClose, socket }: BattleRoomProps) => {
  const [battle, setBattle] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [status, setStatus] = useState<string>("lobby");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [participantCount, setParticipantCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const data = await getBattleInfo(battleId);
        if (data.error) throw new Error(data.error);
        setBattle(data);
        setStatus(data.status);
        setParticipantCount(data.participantCount || 0);
        socket.emit("join:lobby", { battleId: data.id, userId: user.id });
      } catch (err) {
        console.error(err);
        setError("ARENA CONNECTION FAILED. RETURNING TO LOBBY...");
        setTimeout(onClose, 3000);
      }
    };

    init();

    socket.on("lobby:update", (data) => {
      setParticipantCount(data.participantCount);
    });

    socket.on("battle:status", (newStatus) => {
      setStatus(newStatus);
    });

    socket.on("battle:started", (payload: any) => {
      setStatus("creating");
      setBattle(prev => prev ? { ...prev, startTime: payload.startTime, status: 'creating' } : null);
    });

    return () => {
      if (battle?.id) {
        socket.emit("leave:lobby", { battleId: battle.id, userId: user.id });
      }
      socket.off("lobby:update");
      socket.off("battle:status");
      socket.off("battle:started");
    };
  }, [battleId, socket, user.id]);

  useEffect(() => {
    if (!battle) return;

    const interval = setInterval(() => {
      if (battle.startTime === 0) {
        setTimeLeft(battle.duration);
        return;
      }
      const now = Date.now();
      const end = battle.startTime + (battle.duration * 1000);
      const remaining = Math.max(0, Math.floor((end - now) / 1000));
      setTimeLeft(remaining);
      
      if (remaining === 0 && status === "creating") {
        setStatus("voting");
        fetchResults();
      }
    }, 1000);

    if (status === "voting") fetchResults();

    return () => clearInterval(interval);
  }, [battle, status]);

  const fetchResults = async () => {
    const data = await getResults(battleId);
    setSubmissions(data);
  };

  const handleStart = () => {
    socket.emit("battle:start", battle.id);
    setStatus("creating");
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setIsSubmitting(true);
    try {
      await submitBeat(token, battleId, selectedFile);
      setHasSubmitted(true);
    } catch (err) {
      alert("Submission failed. Check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVote = async (subId: string, rating: number) => {
    try {
      await voteSubmission(token, subId, rating);
      setVotedIds(prev => [...prev, subId]);
      fetchResults();
    } catch (err) {
      console.error(err);
    }
  };

  const copyInvite = () => {
    if (!battle) return;
    navigator.clipboard.writeText(battle.inviteCode);
    alert(`Invite code copied: ${battle.inviteCode}`);
  };

  if (error) return (
    <div className="h-[60vh] flex flex-col items-center justify-center mood-card border-red-500/20">
      <div className="text-red-500 font-black uppercase italic tracking-[0.2em] animate-pulse mb-4">{error}</div>
      <button onClick={onClose} className="text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest">Abort Mission</button>
    </div>
  );

  if (!battle) return <div className="h-screen flex items-center justify-center font-black uppercase italic text-gray-700 animate-pulse tracking-[0.4em]">Establishing Uplink...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24">
      <header className="flex flex-col md:flex-row items-center justify-between gap-6">
        <button onClick={onClose} className="text-gray-500 hover:text-white flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] transition-all group">
          <ChevronRight className="rotate-180 group-hover:-translate-x-1 transition-transform" size={16} />
          Exit Battle
        </button>
        
        <div className="flex items-center gap-8 bg-white/2 p-2 px-6 rounded-2xl border border-white/5">
          <div className="text-center md:text-right pr-8 border-r border-white/5">
            <p className="text-[10px] uppercase text-gray-500 font-bold mb-1 tracking-widest">Active Connection</p>
            <p className="font-mono text-lg font-black text-white">
              {participantCount} PRODUCERS
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-gray-500 font-bold mb-1 tracking-widest">
              {status === 'lobby' ? 'Battle Duration' : status === 'voting' ? 'Voting Over In' : 'Battle Ends In'}
            </p>
            <p className="timer-display text-green-500">
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`px-4 py-2 rounded-lg font-black text-[10px] uppercase tracking-[0.2em] border ${status === 'creating' ? 'bg-red-500/20 text-red-500 border-red-500/30' : 'bg-white/5 text-gray-500 border-white/5'}`}>
            {status}
          </div>
        </div>
      </header>

      <div className="mood-card p-1 pb-10 overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-green-500 to-transparent" />
        <div className="p-10 grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-7 space-y-10">
            <div>
              <div className="flex items-center gap-4 mb-4">
                <h1 className="text-6xl font-black italic tracking-tighter uppercase leading-none">{battle.title}</h1>
                {battle.isPrivate && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-full text-[10px] font-black uppercase">
                    <Settings size={12} />
                    Private
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <span className="px-3 py-1 bg-white/3 text-gray-400 border border-white/5 rounded-lg text-[10px] uppercase font-black tracking-widest">{battle.genre}</span>
                <span className="px-3 py-1 bg-white/3 text-gray-400 border border-white/5 rounded-lg text-[10px] uppercase font-black tracking-widest">{battle.bpm} BPM</span>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-8 bg-white/2 rounded-3xl border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-10">
                  <Mic2 size={64} />
                </div>
                <p className="text-[10px] uppercase text-gray-500 font-black tracking-[0.3em] mb-4 flex items-center gap-2">
                  <Zap size={14} className="text-green-500 fill-green-500" /> MISSION OBJECTIVE
                </p>
                <p className="text-2xl leading-snug font-bold">{battle.prompt}</p>
              </div>

              <div className="flex items-center justify-between p-6 bg-green-500/5 rounded-3xl border border-green-500/10">
                <div>
                  <p className="text-[10px] font-black uppercase text-green-500 tracking-widest mb-1">Invite Collaborators</p>
                  <p className="text-sm text-gray-500 font-medium">Share the code below to bring other producers into this arena.</p>
                </div>
                <button onClick={copyInvite} className="flex items-center gap-3 bg-white/5 px-6 py-3 rounded-2xl border border-white/5 hover:bg-white/10 transition-all active:scale-95 group">
                  <span className="font-mono font-black text-xl tracking-widest">{battle.inviteCode}</span>
                  <Plus className="text-gray-500 group-hover:text-white" size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-8">
            <AnimatePresence mode="wait">
              {status === "lobby" && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-full flex flex-col items-center justify-center p-12 mood-card bg-black/40 border-dashed border-2"
                >
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-8 relative">
                    <Users className="text-green-500" size={32} />
                    <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20" />
                  </div>
                  <h3 className="text-2xl font-black uppercase italic mb-3">Syncing Lobby</h3>
                  <p className="text-sm text-gray-500 text-center mb-10 leading-relaxed uppercase tracking-widest font-bold">
                    Waiting for tactical deployment... 
                    <br /> {participantCount} PRODUCERS CONNECTED
                  </p>
                  
                  {battle.creatorId === user.id ? (
                    <button onClick={handleStart} className="mood-btn w-full py-5 text-lg uppercase tracking-widest font-black shadow-green-500/40">
                      ENGAGE BATTLE
                    </button>
                  ) : (
                    <div className="w-full py-5 bg-white/5 rounded-2xl text-center text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 animate-pulse border border-white/5">
                      Awaiting Host Signal...
                    </div>
                  )}
                </motion.div>
              )}

              {status === "creating" && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-8"
                >
                  <div className="p-8 mood-card bg-gradient-to-br from-black/80 to-transparent relative overflow-hidden backdrop-blur-xl">
                    <h3 className="text-2xl font-black uppercase italic mb-6">SUBMISSION PORTAL</h3>
                    <p className="text-xs text-gray-500 mb-8 leading-relaxed uppercase tracking-widest font-bold">
                      DAW CONNECTION ACTIVE. EXPORT YOUR BOUNCE AND TRANSMIT.
                    </p>
                    
                    <div className="space-y-6">
                      <input 
                        type="file" 
                        accept="audio/*"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        className="hidden" 
                        id="beat-upload" 
                      />
                      <label 
                        htmlFor={hasSubmitted ? undefined : "beat-upload"}
                        className={`w-full py-16 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all ${hasSubmitted ? 'border-green-500 bg-green-500/10 cursor-default' : selectedFile ? 'border-green-500/50 bg-green-500/5' : 'border-white/5 hover:bg-white/5'}`}
                      >
                        {hasSubmitted ? (
                          <div className="text-center">
                            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={48} />
                            <p className="text-xl font-black uppercase tracking-widest text-[#5eff00]">Signal Locked</p>
                            <p className="text-[10px] text-gray-500 mt-2">TRANSMISSION SECURE. AWAITING VOTING PHASE.</p>
                          </div>
                        ) : selectedFile ? (
                          <div className="text-center">
                            <CheckCircle2 className="mx-auto text-green-500 mb-4" size={32} />
                            <p className="text-sm font-black truncate max-w-[280px] uppercase tracking-widest">{selectedFile.name}</p>
                            <p className="text-[10px] text-gray-500 mt-2">READY FOR DEPLOYMENT</p>
                          </div>
                        ) : (
                          <>
                            <Music className="mb-4 text-gray-700" size={32} />
                            <p className="text-[10px] uppercase font-black tracking-[0.3em] text-gray-500">SELECT AUDIO WAVEFORM</p>
                          </>
                        )}
                      </label>
                      
                      {!hasSubmitted && (
                        <button 
                          onClick={handleSubmit}
                          disabled={!selectedFile || isSubmitting}
                          className="mood-btn w-full py-5 uppercase tracking-widest font-black text-lg disabled:opacity-20"
                        >
                          {isSubmitting ? "TRANSMITTING..." : "LOCK SUBMISSION"}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-6 bg-red-500/5 rounded-3xl border border-red-500/10 flex items-center gap-4">
                    <Clock size={20} className="text-red-500" />
                    <p className="text-[10px] font-black uppercase text-red-500 tracking-widest leading-relaxed">
                      LATE SUBMISSIONS WILL BE WIPED FROM THE SERVERS. NO EXCEPTIONS.
                    </p>
                  </div>
                </motion.div>
              )}

              {status === "voting" && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-black italic tracking-tighter uppercase flex items-center gap-3">
                      <Star className="text-yellow-500 fill-yellow-500" size={24} />
                      PEER EVALUATION
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{submissions.length} TRACKS READY</span>
                  </div>
                  <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                    {submissions.map((sub, index) => (
                      <SubmissionItem 
                        key={sub.id} 
                        index={index}
                        submission={sub} 
                        onVote={(r) => handleVote(sub.id, r)}
                        isVoted={votedIds.includes(sub.id)}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {status === "ended" && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  <div className="text-center mb-10">
                    <h3 className="text-4xl font-black uppercase italic tracking-tighter text-[#5eff00] mb-2">Arena Concluded</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Signal extraction complete. View results below.</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    {submissions.slice(0, 3).map((sub, i) => (
                      <div key={sub.id} className={`p-8 mood-card flex items-center gap-6 relative overflow-hidden ${i === 0 ? 'border-[#5eff00]/40 bg-[#5eff00]/5' : 'border-white/10'}`}>
                        <div className="text-4xl font-black italic text-gray-800 absolute -left-2 -top-2 opacity-20">#{i + 1}</div>
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black ${i === 0 ? 'bg-[#5eff00] text-black' : i === 1 ? 'bg-gray-300 text-black' : i === 2 ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-500'}`}>
                          {i === 0 ? "1ST" : i === 1 ? "2ND" : i === 2 ? "3RD" : `${i+1}TH`}
                        </div>
                        <div className="flex-1">
                          <p className="text-xl font-black uppercase italic">{sub.username}</p>
                          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest leading-none mt-1">{sub.avgRating || 0} SCORE • {sub.voteCount} VOICES</p>
                        </div>
                        <div className="flex gap-2">
                           <SubmissionItem 
                            submission={sub} 
                            onVote={() => {}} 
                            isVoted={true} 
                            index={i}
                            minimal
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <button 
                    onClick={onClose}
                    className="w-full py-5 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black uppercase tracking-[0.4em] text-white transition-all border border-white/5"
                  >
                    RETURN TO COMMUNICATIONS HUB
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SubmissionItemProps {
  key?: any;
  submission: any;
  onVote: (r: number) => void;
  isVoted: boolean;
  index: number;
  minimal?: boolean;
}

const SubmissionItem = ({ submission, onVote, isVoted, index, minimal }: SubmissionItemProps) => {

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(e => {
        console.error("Audio play failed:", e);
        alert("Audio playback failed. The file might be corrupted or in an unsupported format.");
      });
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={`p-6 mood-card bg-white/2 border border-white/5 flex items-center gap-6 group hover:translate-x-1 transition-all relative ${minimal ? 'border-none p-2 bg-transparent hover:translate-x-0' : ''}`}>
      {!minimal && <div className="absolute left-0 top-0 w-1 h-0 group-hover:h-full bg-green-500 transition-all duration-500" />}
      
      {!minimal && (
        <div className="text-[10px] font-black font-mono text-gray-700">
          {String(index + 1).padStart(2, '0')}
        </div>
      )}

      <button 
        onClick={togglePlay}
        className={`${minimal ? 'w-10 h-10' : 'w-14 h-14'} rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#5eff00] hover:text-black transition-all text-white group-hover:scale-105`}
      >
        {isPlaying ? <Pause size={minimal ? 18 : 24} fill="currentColor" /> : <Play size={minimal ? 18 : 24} className={minimal ? "ml-0.5" : "ml-1"} fill="currentColor" />}
      </button>

      {!minimal && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase font-black text-gray-500 tracking-widest">SIGNAL RECEPTION</p>
            {isVoted && <div className="text-[10px] font-black text-green-500 uppercase tracking-widest">Analyzed</div>}
          </div>
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: isPlaying ? "100%" : "0%" }}
              transition={{ duration: 30, ease: "linear" }}
              className="h-full bg-green-500 shadow-[0_0_15px_rgba(94,255,0,0.6)]"
            />
          </div>
        </div>
      )}

      {!minimal && (
        <div className="flex flex-col gap-2">
          {!isVoted ? (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(rating => (
                <button 
                  key={rating} 
                  onClick={() => {
                    console.log("VOTING:", submission.id, rating);
                    onVote(rating);
                  }}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-green-500 hover:text-black flex items-center justify-center text-xs font-black transition-all border border-white/5"
                >
                  {rating}
                </button>
              ))}
            </div>
          ) : (
            <div className="h-10 px-4 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="text-green-500" size={16} />
            </div>
          )}
        </div>
      )}

      <audio 
        ref={audioRef} 
        src={submission.audioUrl} 
        onEnded={() => setIsPlaying(false)} 
        onError={(e) => {
          const target = e.target as HTMLAudioElement;
          console.error("Audio error:", target.error?.message, "for source:", submission.audioUrl);
          setIsPlaying(false);
        }}
        onCanPlay={() => {
          console.log("Audio can play:", submission.audioUrl);
        }}
        className="hidden" 
        preload="auto" 
      />
    </div>
  );
};
