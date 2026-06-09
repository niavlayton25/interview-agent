require('dotenv').config();
const Anthropic = require("@anthropic-ai/sdk");
const express = require("express");
const cors = require("cors");
const path = require("path");
const Database = require("better-sqlite3");
const multer = require("multer");
const PDFParser = require("pdf2json");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
const app = express();
app.use(cors());
app.use(express.json());

// Serve built frontend in production
const FRONTEND_DIST = path.join(__dirname, "interview-frontend", "dist");
if (require("fs").existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
}

const upload = multer({ storage: multer.memoryStorage() });

// ─── Database ─────────────────────────────────────────────────────────────────

let _db;
function getDb() {
  if (!_db) {
    const dbPath = path.join(process.env.DATA_DIR || ".", "interview.db");
    _db = new Database(dbPath);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        case_type TEXT,
        domain TEXT
      );
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        case_type TEXT,
        question TEXT,
        answer_summary TEXT,
        score_structure REAL,
        score_insight REAL,
        score_communication REAL,
        avg_score REAL,
        feedback TEXT,
        logged_at TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS resume (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
  return _db;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "log_answer",
    description: "Log a candidate's answer with scores after evaluating it. Call this after every answer.",
    input_schema: {
      type: "object",
      properties: {
        case_type: { type: "string", enum: ["product_sense", "product_strategy", "product_execution", "technical", "behavioral", "elevator_pitch", "favorite_product"] },
        question: { type: "string" },
        answer_summary: { type: "string" },
        scores: {
          type: "object",
          properties: {
            structure: { type: "number", minimum: 1, maximum: 5 },
            insight: { type: "number", minimum: 1, maximum: 5 },
            communication: { type: "number", minimum: 1, maximum: 5 },
          },
          required: ["structure", "insight", "communication"],
        },
        feedback: { type: "string" },
      },
      required: ["case_type", "question", "answer_summary", "scores", "feedback"],
    },
  },
  {
    name: "get_weak_areas",
    description: "Get the candidate's historically weak areas based on past session scores.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", default: 2 } },
      required: [],
    },
  },
  {
    name: "get_session_summary",
    description: "Get a summary of all past practice sessions and scores.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "select_next_question",
    description: "Choose the next question type to serve based on weak areas.",
    input_schema: {
      type: "object",
      properties: { focus_on_weak_areas: { type: "boolean", default: true } },
      required: [],
    },
  },
];

// ─── Tool implementations ─────────────────────────────────────────────────────

function executeTool(name, input, sessionId) {
  const db = getDb();

  if (name === "log_answer") {
    const avg = (input.scores.structure + input.scores.insight + input.scores.communication) / 3;
    db.prepare(`
      INSERT INTO answers (session_id, case_type, question, answer_summary, score_structure, score_insight, score_communication, avg_score, feedback, logged_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, input.case_type, input.question, input.answer_summary, input.scores.structure, input.scores.insight, input.scores.communication, avg, input.feedback, new Date().toISOString());
    console.log(`📝 Logged: ${input.case_type} | avg: ${avg.toFixed(1)}/5`);
    return { success: true, avg_score: avg };
  }

  if (name === "get_weak_areas") {
    const limit = input.limit || 2;
    const rows = db.prepare("SELECT case_type, avg_score FROM answers").all();
    if (rows.length === 0) return { weak_areas: [], message: "No sessions yet" };
    const byType = {};
    for (const r of rows) {
      if (!byType[r.case_type]) byType[r.case_type] = { total: 0, count: 0 };
      byType[r.case_type].total += r.avg_score;
      byType[r.case_type].count++;
    }
    const averages = Object.entries(byType)
      .map(([type, data]) => ({ type, avg: data.total / data.count, attempts: data.count }))
      .sort((a, b) => a.avg - b.avg);
    return { weak_areas: averages.slice(0, limit) };
  }

  if (name === "get_session_summary") {
    const rows = db.prepare("SELECT case_type, avg_score, feedback, logged_at FROM answers ORDER BY logged_at DESC").all();
    if (rows.length === 0) return { summary: "No sessions yet. Start practicing!" };
    const total = rows.length;
    const overall = rows.reduce((sum, r) => sum + r.avg_score, 0) / total;
    const byType = {};
    for (const r of rows) {
      if (!byType[r.case_type]) byType[r.case_type] = [];
      byType[r.case_type].push(r.avg_score);
    }
    const typeAverages = Object.fromEntries(
      Object.entries(byType).map(([t, scores]) => [t, (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)])
    );
    return {
      total_sessions: total,
      overall_avg: overall.toFixed(1),
      by_type: typeAverages,
      recent: rows.slice(0, 3).map((r) => ({ type: r.case_type, avg: Number(r.avg_score).toFixed(1), feedback: r.feedback })),
    };
  }

  if (name === "select_next_question") {
    const types = ["product_sense", "product_strategy", "product_execution", "technical", "behavioral", "elevator_pitch", "favorite_product"];
    if (!input.focus_on_weak_areas) return { recommended_type: types[Math.floor(Math.random() * types.length)] };
    const weakResult = executeTool("get_weak_areas", { limit: 1 }, sessionId);
    if (weakResult.weak_areas?.length > 0) return { recommended_type: weakResult.weak_areas[0].type };
    const rows = db.prepare("SELECT case_type FROM answers ORDER BY logged_at DESC LIMIT 4").all();
    const recent = rows.map((r) => r.case_type);
    const leastRecent = types.find((t) => !recent.includes(t)) || types[0];
    return { recommended_type: leastRecent };
  }

  return { error: `Unknown tool: ${name}` };
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_BASE = `You are a tough but fair PM interviewer. You conduct the following interview types:
- product_sense: Product design and improvement questions
- product_strategy: Market entry, competitive positioning, roadmap decisions
- product_execution: Metrics diagnosis, experimentation, analytical thinking
- technical: System design and technical tradeoffs relevant to a PM role
- behavioral: Tell-me-about-a-time questions using STAR format
- elevator_pitch: The classic "tell me about yourself" — a crisp 2-minute personal pitch covering background, current role, and why they're here
- favorite_product: Questions like "what's your favorite product and why", "what would you improve", or "tell me about a product you dislike"

Style: Realistic and challenging. Push back on vague answers. No hints unless completely stuck.

Use your tools proactively:
- After every answer → call log_answer with honest scores (1-5)
- When the candidate specifies a case type → ask a question of EXACTLY that type immediately. Do NOT call select_next_question or get_weak_areas.
- When the candidate says "coach decide" or does not specify a type → call get_weak_areas then select_next_question
- When asked for progress → call get_session_summary

The candidate is a Senior PM at a telemedicine startup. She has strong product instincts but needs to work on structured frameworks. Keep responses concise — this will be read aloud.

Important: vary the product domains you ask about. Do NOT default to healthcare or telemedicine just because of her background. Rotate across consumer apps, marketplaces, developer tools, fintech, social, enterprise software, hardware, and other domains. Her background is context for behavioral questions only — not a reason to anchor every case to healthcare.`;

function buildSystemPrompt() {
  const db = getDb();
  const resume = db.prepare("SELECT content FROM resume WHERE id = 1").get();
  if (!resume?.content) return SYSTEM_BASE;
  return SYSTEM_BASE + `\n\nThe candidate's resume for context:\n---\n${resume.content}\n---\nReference this naturally in behavioral and elevator pitch questions. Do not over-reference it in other question types.`;
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function runAgentLoop(conversationHistory, sessionId) {
  const system = buildSystemPrompt();
  let response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system,
    tools: TOOLS,
    messages: conversationHistory,
  });

  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      console.log(`🔧 Tool: ${toolUse.name}`);
      const result = executeTool(toolUse.name, toolUse.input, sessionId);
      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }
    conversationHistory.push({ role: "assistant", content: response.content });
    conversationHistory.push({ role: "user", content: toolResults });
    response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: conversationHistory,
    });
  }

  const textBlocks = response.content.filter((b) => b.type === "text");
  const finalText = textBlocks.map((b) => b.text).join("\n");
  conversationHistory.push({ role: "assistant", content: response.content });
  return finalText;
}

// ─── In-memory conversation store ─────────────────────────────────────────────

const activeSessions = {};

// ─── Domain / case type prompt helpers ───────────────────────────────────────

const CASE_TYPE_PROMPTS = {
  product_sense: "I want to practice product sense interviews. Ask me a product design or improvement question right now. Do not call select_next_question or get_weak_areas.",
  product_strategy: "I want to practice product strategy interviews. Ask me a strategy question right now — market entry, prioritization, or competitive positioning. Do not call select_next_question or get_weak_areas.",
  product_execution: "I want to practice product execution and analytics interviews. Ask me a metrics diagnosis, experimentation, or analytical thinking question right now. Do not call select_next_question or get_weak_areas.",
  technical: "I want to practice technical PM interviews. Ask me a system design or technical tradeoff question right now. Do not call select_next_question or get_weak_areas.",
  behavioral: "I want to practice behavioral interviews. Ask me a tell-me-about-a-time question right now. Do not call select_next_question or get_weak_areas.",
  elevator_pitch: "I want to practice my personal elevator pitch. Ask me to give my 2-minute 'tell me about yourself' pitch right now. Do not call select_next_question or get_weak_areas.",
  favorite_product: "I want to practice favorite product questions. Ask me one right now — like what's my favorite product and why, how I'd improve it, or what product I dislike. Do not call select_next_question or get_weak_areas.",
};

const DOMAIN_SUFFIXES = {
  pinterest: " The question must be specifically about Pinterest — its products, users, features, or business (e.g. Pins, Boards, search, shopping, creators, ads).",
  big_tech: " Frame the question around a large tech company — choose from Google, Meta, Amazon, Apple, Microsoft, Spotify, Netflix, Uber, or Airbnb. Pick whichever fits best for the question type.",
};

// ─── API routes ───────────────────────────────────────────────────────────────

app.post("/start", async (req, res) => {
  try {
    const { caseType, domain } = req.body || {};
    const sessionId = Date.now().toString();
    const db = getDb();

    db.prepare("INSERT INTO sessions (id, started_at, case_type, domain) VALUES (?, ?, ?, ?)").run(
      sessionId, new Date().toISOString(), caseType || null, domain || null
    );

    const baseMsg = CASE_TYPE_PROMPTS[caseType] || "I want to practice. Check my weak areas and recommend what case type I should start with, then give me a question.";
    const firstMsg = baseMsg + (DOMAIN_SUFFIXES[domain] || "");

    const history = [{ role: "user", content: firstMsg }];
    const reply = await runAgentLoop(history, sessionId);

    // Save the interviewer's opening question to the transcript
    db.prepare("INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)").run(
      sessionId, "assistant", reply, new Date().toISOString()
    );

    activeSessions[sessionId] = history;
    res.json({ sessionId, message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!activeSessions[sessionId]) return res.status(404).json({ error: "Session not found" });
    const db = getDb();
    const history = activeSessions[sessionId];
    history.push({ role: "user", content: message });

    const reply = await runAgentLoop(history, sessionId);

    db.prepare("INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)").run(
      sessionId, "user", message, new Date().toISOString()
    );
    db.prepare("INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)").run(
      sessionId, "assistant", reply, new Date().toISOString()
    );

    res.json({ message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/progress", (req, res) => {
  try {
    res.json(executeTool("get_session_summary", {}, null));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions", (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT s.id, s.started_at, s.case_type, s.domain,
             COUNT(a.id) as question_count,
             AVG(a.avg_score) as avg_score
      FROM sessions s
      LEFT JOIN answers a ON s.id = a.session_id
      GROUP BY s.id
      ORDER BY s.started_at DESC
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/sessions/:id", (req, res) => {
  try {
    const db = getDb();
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const messages = db.prepare("SELECT role, text, created_at FROM messages WHERE session_id = ? ORDER BY id").all(req.params.id);
    const answers = db.prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY id").all(req.params.id);
    res.json({ session, messages, answers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/resume", (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare("SELECT content, updated_at FROM resume WHERE id = 1").get();
    res.json(row || { content: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/resume", upload.single("file"), async (req, res) => {
  try {
    let content = "";
    if (req.file) {
      content = await new Promise((resolve, reject) => {
        const parser = new PDFParser();
        parser.on("pdfParser_dataReady", (data) => {
          const safeDecode = (s) => { try { return decodeURIComponent(s) } catch { return s } };
          const text = data.Pages.map((page) =>
            page.Texts.map((t) => safeDecode(t.R.map((r) => r.T).join(""))).join(" ")
          ).join("\n");
          resolve(text.trim());
        });
        parser.on("pdfParser_dataError", reject);
        parser.parseBuffer(req.file.buffer);
      });
    } else if (req.body?.text) {
      content = req.body.text.trim();
    } else {
      return res.status(400).json({ error: "Provide a PDF file or text" });
    }
    if (!content) return res.status(400).json({ error: "Could not extract text from file" });
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO resume (id, content, updated_at) VALUES (1, ?, ?)").run(content, new Date().toISOString());
    res.json({ success: true, length: content.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/resume", (req, res) => {
  try {
    const db = getDb();
    db.prepare("DELETE FROM resume WHERE id = 1").run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/tts", async (req, res) => {
  try {
    const { text, voice_id } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not set in .env" });
    const voiceId = voice_id || process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// SPA fallback — serve index.html for any non-API route
if (require("fs").existsSync(FRONTEND_DIST)) {
  app.use((_req, res) => res.sendFile(path.join(FRONTEND_DIST, "index.html")));
}

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  getDb(); // initialize DB on startup
  console.log(`\n🎯 PM Interview Coach running at http://localhost:${PORT}`);
  console.log(`   POST /start          → begin a new session`);
  console.log(`   POST /chat           → send a message`);
  console.log(`   GET  /progress       → score overview`);
  console.log(`   GET  /sessions       → session history`);
  console.log(`   GET  /sessions/:id   → session detail + transcript`);
  console.log(`   GET/POST/DELETE /resume → manage resume\n`);
});
