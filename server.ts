import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import Database from "better-sqlite3";
import * as jose from "jose";
import fs from "fs";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Database Setup
const db = new Database("sonara.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    username TEXT,
    xp INTEGER DEFAULT 0,
    avatar TEXT
  );
  CREATE TABLE IF NOT EXISTS battles (
    id TEXT PRIMARY KEY,
    title TEXT,
    prompt TEXT,
    genre TEXT,
    bpm INTEGER,
    constraints TEXT,
    status TEXT, -- 'lobby', 'creating', 'voting', 'ended'
    startTime INTEGER,
    duration INTEGER,
    creatorId TEXT,
    isPrivate INTEGER DEFAULT 0,
    inviteCode TEXT,
    createdAt INTEGER
  );
  CREATE TABLE IF NOT EXISTS lobby_participants (
    battleId TEXT,
    userId TEXT,
    PRIMARY KEY(battleId, userId)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    battleId TEXT,
    userId TEXT,
    audioUrl TEXT,
    timestamp INTEGER,
    FOREIGN KEY(battleId) REFERENCES battles(id),
    FOREIGN KEY(userId) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS votes (
    submissionId TEXT,
    voterId TEXT,
    rating INTEGER,
    PRIMARY KEY(submissionId, voterId)
  );
`);

// Migration: Add missing columns if they don't exist
try {
  const tableInfo = db.prepare("PRAGMA table_info(battles)").all() as any[];
  const columns = tableInfo.map(c => c.name);
  if (!columns.includes("isPrivate")) {
    db.prepare("ALTER TABLE battles ADD COLUMN isPrivate INTEGER DEFAULT 0").run();
  }
  if (!columns.includes("inviteCode")) {
    db.prepare("ALTER TABLE battles ADD COLUMN inviteCode TEXT").run();
  }
  if (!columns.includes("createdAt")) {
    db.prepare("ALTER TABLE battles ADD COLUMN createdAt INTEGER").run();
    // Set createdAt for existing battles to startTime if they have one
    db.prepare("UPDATE battles SET createdAt = startTime WHERE createdAt IS NULL").run();
  }
} catch (e) {
  console.error("Migration error:", e);
}

const JWT_SECRET = new TextEncoder().encode("sonara-secret-key-12345");

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  app.use(cors());
  app.use(express.json());
  app.use("/uploads", express.static(uploadDir));
  app.get("/uploads/*", (req, res) => {
    res.status(404).send("File not found");
  });

  // Auth Middleware
  const authenticateToken = async (req: any, res: any, next: any) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.sendStatus(401);

    try {
      const { payload } = await jose.jwtVerify(token, JWT_SECRET);
      req.user = payload;
      next();
    } catch (err) {
      return res.sendStatus(403);
    }
  };

  // Auth Endpoints
  app.post("/api/auth/login", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).send("Email required");

    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    if (!user) {
      const id = Math.random().toString(36).substr(2, 9);
      const username = email.split("@")[0];
      db.prepare("INSERT INTO users (id, email, username) VALUES (?, ?, ?)").run(id, email, username);
      user = { id, email, username, xp: 0 };
    }

    const token = await new jose.SignJWT({ id: user.id, email: user.email, username: user.username })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    res.json({ token, user });
  });

  // User Data
  app.get("/api/me", authenticateToken, (req: any, res) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
    res.json(user);
  });

  app.post("/api/me/username", authenticateToken, (req: any, res) => {
    const { username } = req.body;
    if (!username || username.length < 3) return res.status(400).send("Invalid username");
    
    try {
      db.prepare("UPDATE users SET username = ? WHERE id = ?").run(username, req.user.id);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ error: "Failed to update username" });
    }
  });

  // Leaderboard
  app.get("/api/leaderboard", (req, res) => {
    const users = db.prepare("SELECT id, username, xp FROM users ORDER BY xp DESC LIMIT 20").all();
    res.json(users);
  });

  // AI Prompt (Now handled in frontend)
  app.get("/api/ai/prompt", async (req, res) => {
    res.status(410).json({ error: "AI generation moved to client" });
  });

  // Battles
  app.get("/api/battles", (req, res) => {
    const status = req.query.status;

    // Proactively end expired battles before querying
    const now = Date.now();
    db.prepare(`
      UPDATE battles 
      SET status = 'ended' 
      WHERE status IN ('creating', 'voting') 
      AND startTime > 0 
      AND (startTime + (duration * 1000)) < ?
    `).run(now);

    let query = `
      SELECT b.*, (SELECT COUNT(*) FROM lobby_participants WHERE battleId = b.id) as participantCount 
      FROM battles b 
      WHERE b.isPrivate = 0
    `;

    if (status === 'live') {
      query += " AND b.status IN ('lobby', 'creating', 'voting')";
    } else if (status === 'ended') {
      query += " AND b.status = 'ended'";
    } else {
      query += " AND b.status != 'ended'";
    }

    // Filter out 0 participants (empty lobbies)
    // AND filter out stale lobbies (older than 30 mins and still in 'lobby' state and not started)
    const thirtyMinsAgo = Date.now() - (30 * 60 * 1000);
    query += ` AND (SELECT COUNT(*) FROM lobby_participants WHERE battleId = b.id) > 0`;
    query += ` AND NOT (b.status = 'lobby' AND b.createdAt < ${thirtyMinsAgo})`;
    
    query += " ORDER BY b.status DESC, b.createdAt DESC";

    try {
      const battles = db.prepare(query).all();
      res.json(battles);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch battles" });
    }
  });

  app.get("/api/battles/:id", (req, res) => {
    const id = req.params.id;
    const battle = db.prepare(`
      SELECT b.*, (SELECT COUNT(*) FROM lobby_participants WHERE battleId = b.id) as participantCount 
      FROM battles b 
      WHERE b.id = ? OR b.inviteCode = ?
    `).get(id, id);
    
    if (!battle) return res.status(404).json({ error: "Battle not found" });
    res.json(battle);
  });

  app.post("/api/battles", authenticateToken, (req: any, res) => {
    const { title, prompt, genre, bpm, constraints, duration, isPrivate } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    const inviteCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    db.prepare(`
      INSERT INTO battles (id, title, prompt, genre, bpm, constraints, status, startTime, duration, creatorId, isPrivate, inviteCode, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'lobby', ?, ?, ?, ?, ?, ?)
    `).run(id, title, prompt, genre, bpm, constraints, 0, duration, req.user.id, isPrivate ? 1 : 0, inviteCode, Date.now());
    
    // Auto-join creator
    db.prepare("INSERT OR IGNORE INTO lobby_participants (battleId, userId) VALUES (?, ?)").run(id, req.user.id);

    const battle = db.prepare("SELECT * FROM battles WHERE id = ?").get(id);
    io.emit("battle:created", battle);
    res.json(battle);
  });

  // Submissions
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // sanitize filename to avoid issues with spaces or special characters
      const sanitized = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
      cb(null, `${Date.now()}-${sanitized}`);
    },
  });
  const upload = multer({ storage });

  app.post("/api/battles/:id/submit", authenticateToken, upload.single("audio"), (req: any, res) => {
    const { id: battleId } = req.params;
    const userId = req.user.id;
    if (!req.file) return res.status(400).send("No audio file uploaded");
    
    // Check if battle is still active for creation
    const battle = db.prepare("SELECT status FROM battles WHERE id = ?").get(battleId) as any;
    if (!battle || battle.status !== 'creating') {
      return res.status(400).send("Submission window closed");
    }

    const audioUrl = `/uploads/${req.file.filename}`;
    const id = Math.random().toString(36).substr(2, 9);
    
    // Only allow one submission per user per battle
    db.transaction(() => {
      const existing = db.prepare("SELECT id FROM submissions WHERE battleId = ? AND userId = ?").get(battleId, userId);
      if (existing) {
        db.prepare("UPDATE submissions SET audioUrl = ? WHERE battleId = ? AND userId = ?").run(audioUrl, battleId, userId);
      } else {
        db.prepare(`
          INSERT INTO submissions (id, battleId, userId, audioUrl)
          VALUES (?, ?, ?, ?)
        `).run(id, battleId, userId, audioUrl);
      }

      // AUTO-ADVANCE CHECK
      const participants = db.prepare("SELECT userId FROM lobby_participants WHERE battleId = ?").all(battleId) as any[];
      const submissions = db.prepare("SELECT userId FROM submissions WHERE battleId = ?").all(battleId) as any[];
      const participantIds = participants.map(p => p.userId);
      const submissionUserIds = submissions.map(s => s.userId);
      
      const allSubmitted = participantIds.every(pid => submissionUserIds.includes(pid));
      if (allSubmitted && participantIds.length > 0) {
        const nextStatus = participantIds.length > 1 ? 'voting' : 'ended';
        db.prepare("UPDATE battles SET status = ? WHERE id = ?").run(nextStatus, battleId);
        io.to(battleId).emit("battle:status", nextStatus);
        io.emit("battle:updated");
      }
    })();
    
    res.json({ success: true, audioUrl });
  });

  // Voting
  app.post("/api/submissions/:id/vote", authenticateToken, (req: any, res) => {
    const { id: submissionId } = req.params;
    const { rating } = req.body;
    const voterId = req.user.id;

    const submission = db.prepare("SELECT userId FROM submissions WHERE id = ?").get(submissionId) as any;
    if (submission && submission.userId === voterId) {
      return res.status(403).json({ error: "Cannot vote for yourself" });
    }

    db.prepare("INSERT OR REPLACE INTO votes (submissionId, voterId, rating) VALUES (?, ?, ?)").run(submissionId, voterId, rating);
    
    // Add XP to user who voted (ONLY if lobby has >1 person)
    const battle = db.prepare(`
      SELECT b.id, b.status FROM battles b 
      JOIN submissions s ON s.battleId = b.id 
      WHERE s.id = ?
    `).get(submissionId) as any;

    if (battle) {
      const pCount = db.prepare("SELECT COUNT(*) as count FROM lobby_participants WHERE battleId = ?").get(battle.id) as any;
      if (pCount.count > 1) {
        db.prepare("UPDATE users SET xp = xp + 1 WHERE id = ?").run(voterId);

        // AUTO-END CHECK: Have all participants voted for all other submissions?
        const participants = db.prepare("SELECT userId FROM lobby_participants WHERE battleId = ?").all(battle.id) as any[];
        const participantIds = participants.map(p => p.userId);
        
        const submissions = db.prepare("SELECT id, userId FROM submissions WHERE battleId = ?").all(battle.id) as any[];
        
        let allVotesCast = true;
        for (const pId of participantIds) {
          for (const sub of submissions) {
            if (sub.userId === pId) continue; // skip own submission
            
            const vote = db.prepare("SELECT rating FROM votes WHERE submissionId = ? AND voterId = ?").get(sub.id, pId);
            if (!vote) {
              allVotesCast = false;
              break;
            }
          }
          if (!allVotesCast) break;
        }

        if (allVotesCast && participants.length > 1) {
          db.prepare("UPDATE battles SET status = 'ended' WHERE id = ?").run(battle.id);
          io.to(battle.id).emit("battle:status", "ended");
          io.emit("battle:updated");
        }
      }
    }
    
    res.json({ success: true });
  });

  // Results
  app.get("/api/battles/:id/results", (req, res) => {
    const { id: battleId } = req.params;
    
    // Check if we need to end battle based on time IF it hasn't ended yet
    const battle = db.prepare("SELECT status, startTime, duration FROM battles WHERE id = ?").get(battleId) as any;
    if (battle && battle.status === 'voting') {
      const now = Date.now();
      const end = battle.startTime + (battle.duration * 1000);
      if (now >= end) {
        db.prepare("UPDATE battles SET status = 'ended' WHERE id = ?").run(battleId);
        io.to(battleId).emit("battle:status", "ended");
        io.emit("battle:updated");
      }
    }

    // If just ended, finalize XP (one-time check)
    const updatedBattle = db.prepare("SELECT status FROM battles WHERE id = ?").get(battleId) as any;
    if (updatedBattle && updatedBattle.status === 'ended') {
      const alreadyAwarded = db.prepare("SELECT COUNT(*) as count FROM submissions WHERE battleId = ? AND timestamp = -1").get(battleId) as any;
      // We use timestamp = -1 as a marker that XP was awarded for this battle
      if (alreadyAwarded.count === 0) {
        const pCount = db.prepare("SELECT COUNT(*) as count FROM lobby_participants WHERE battleId = ?").get(battleId) as any;
        if (pCount.count > 1) {
          const rankings = db.prepare(`
            SELECT s.userId, s.id, ROUND(AVG(v.rating), 1) as avgRating
            FROM submissions s
            LEFT JOIN votes v ON s.id = v.submissionId
            WHERE s.battleId = ?
            GROUP BY s.id
            ORDER BY avgRating DESC
          `).all(battleId) as any[];

          rankings.forEach((r, index) => {
            let award = 0;
            if (index === 0) award = 500;
            else if (index === 1) award = 250;
            else if (index === 2) award = 100;
            
            if (award > 0) {
              db.prepare("UPDATE users SET xp = xp + ? WHERE id = ?").run(award, r.userId);
              console.log(`Battle ${battleId}: Awarded ${award} XP to ${r.userId} (Rank ${index + 1})`);
            }
          });
          
          // Mark as awarded
          db.prepare("UPDATE submissions SET timestamp = -1 WHERE battleId = ?").run(battleId);
        }
      }
    }

    const results = db.prepare(`
      SELECT s.*, u.username, ROUND(AVG(v.rating), 1) as avgRating, COUNT(v.voterId) as voteCount
      FROM submissions s
      JOIN users u ON s.userId = u.id
      LEFT JOIN votes v ON s.id = v.submissionId
      WHERE s.battleId = ?
      GROUP BY s.id
      ORDER BY avgRating DESC
    `).all(battleId);
    res.json(results);
  });

  // API 404 fallback
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    socket.on("join:lobby", ({ battleId, userId }) => {
      socket.join(battleId);
      if (userId) {
        db.prepare("INSERT OR IGNORE INTO lobby_participants (battleId, userId) VALUES (?, ?)").run(battleId, userId);
      }
      const count = db.prepare("SELECT COUNT(*) as count FROM lobby_participants WHERE battleId = ?").get(battleId) as any;
      io.to(battleId).emit("lobby:update", { participantCount: count.count });
    });

    socket.on("battle:start", (battleId) => {
      db.prepare("UPDATE battles SET status = 'creating', startTime = ? WHERE id = ?").run(Date.now(), battleId);
      io.to(battleId).emit("battle:started", { battleId, startTime: Date.now() });
      io.emit("battle:updated");
    });

    socket.on("leave:lobby", ({ battleId, userId }) => {
      socket.leave(battleId);
      if (userId && battleId) {
        db.prepare("DELETE FROM lobby_participants WHERE battleId = ? AND userId = ?").run(battleId, userId);
        const count = db.prepare("SELECT COUNT(*) as count FROM lobby_participants WHERE battleId = ?").get(battleId) as any;
        io.to(battleId).emit("lobby:update", { participantCount: count.count });
      }
    });

    socket.on("disconnect", () => {
      // In a real app we'd track socketId to userId mapping to cleanup lobby_participants
    });
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
