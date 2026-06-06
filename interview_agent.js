require('dotenv').config();
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
const DB_FILE = "sessions.json";
const app = express();
app.use(cors());
app.use(express.json());

// ─── Persistent storage ───────────────────────────────────────────────────────

function loadSessions() {
  if (!fs.existsSync(DB_FILE)) return { sessions: [] };
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveSessions(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
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

function executeTool(name, input) {
  const db = loadSessions();

  if (name === "log_answer") {
    const entry = {
      timestamp: new Date().toISOString(),
      case_type: input.case_type,
      question: input.question,
      answer_summary: input.answer_summary,
      scores: input.scores,
      feedback: input.feedback,
      avg_score: (input.scores.structure + input.scores.insight + input.scores.communication) / 3,
    };
    db.sessions.push(entry);
    saveSessions(db);
    console.log(`📝 Logged: ${input.case_type} | avg score: ${entry.avg_score.toFixed(1)}/5`);
    return { success: true, logged: entry };
  }

  if (name === "get_weak_areas") {
    const limit = input.limit || 2;
    if (db.sessions.length === 0) return { weak_areas: [], message: "No sessions yet" };
    const byType = {};
    for (const s of db.sessions) {
      if (!byType[s.case_type]) byType[s.case_type] = { total: 0, count: 0 };
      byType[s.case_type].total += s.avg_score;
      byType[s.case_type].count += 1;
    }
    const averages = Object.entries(byType)
      .map(([type, data]) => ({ type, avg: data.total / data.count, attempts: data.count }))
      .sort((a, b) => a.avg - b.avg);
    return { weak_areas: averages.slice(0, limit) };
  }

  if (name === "get_session_summary") {
    if (db.sessions.length === 0) return { summary: "No sessions yet. Start practicing!" };
    const total = db.sessions.length;
    const overall = db.sessions.reduce((sum, s) => sum + s.avg_score, 0) / total;
    const byType = {};
    for (const s of db.sessions) {
      if (!byType[s.case_type]) byType[s.case_type] = [];
      byType[s.case_type].push(s.avg_score);
    }
    const typeAverages = Object.fromEntries(
      Object.entries(byType).map(([t, scores]) => [t, (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)])
    );
    return {
      total_sessions: total,
      overall_avg: overall.toFixed(1),
      by_type: typeAverages,
      recent: db.sessions.slice(-3).map((s) => ({ type: s.case_type, avg: s.avg_score.toFixed(1), feedback: s.feedback })),
    };
  }

  if (name === "select_next_question") {
    const types = ["product_sense", "product_strategy", "product_execution", "technical", "behavioral", "elevator_pitch", "favorite_product"];
    if (!input.focus_on_weak_areas || db.sessions.length === 0) {
      return { recommended_type: types[Math.floor(Math.random() * types.length)] };
    }
    const weakResult = executeTool("get_weak_areas", { limit: 1 });
    if (weakResult.weak_areas.length > 0) return { recommended_type: weakResult.weak_areas[0].type };
    const lastTypes = db.sessions.slice(-4).map((s) => s.case_type);
    const leastRecent = types.find((t) => !lastTypes.includes(t)) || types[0];
    return { recommended_type: leastRecent };
  }

  return { error: `Unknown tool: ${name}` };
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

const SYSTEM = `You are a tough but fair PM interviewer. You conduct the following interview types:
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

async function runAgentLoop(conversationHistory) {
  let response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM,
    tools: TOOLS,
    messages: conversationHistory,
  });

  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      console.log(`🔧 Tool: ${toolUse.name}`);
      const result = executeTool(toolUse.name, toolUse.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    conversationHistory.push({ role: "assistant", content: response.content });
    conversationHistory.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: SYSTEM,
      tools: TOOLS,
      messages: conversationHistory,
    });
  }

  const textBlocks = response.content.filter((b) => b.type === "text");
  const finalText = textBlocks.map((b) => b.text).join("\n");
  conversationHistory.push({ role: "assistant", content: response.content });
  return finalText;
}

// ─── In-memory session store (per browser session) ────────────────────────────
// Each session gets its own conversation history so multiple tabs don't collide

const sessions = {};

// ─── API routes ───────────────────────────────────────────────────────────────

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

// Start a new interview session
app.post("/start", async (req, res) => {
  try {
    const { caseType, domain } = req.body || {};
    const sessionId = Date.now().toString();
    const history = [];
    const baseMsg = CASE_TYPE_PROMPTS[caseType]
      || "I want to practice. Check my weak areas and recommend what case type I should start with, then give me a question.";
    const firstMsg = baseMsg + (DOMAIN_SUFFIXES[domain] || "");
    history.push({ role: "user", content: firstMsg });
    const reply = await runAgentLoop(history);
    sessions[sessionId] = history;
    res.json({ sessionId, message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Send a message in an existing session
app.post("/chat", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessions[sessionId]) return res.status(404).json({ error: "Session not found" });
    const history = sessions[sessionId];
    history.push({ role: "user", content: message });
    const reply = await runAgentLoop(history);
    res.json({ message: reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get progress summary
app.get("/progress", async (req, res) => {
  try {
    const summary = executeTool("get_session_summary", {});
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ElevenLabs TTS proxy ─────────────────────────────────────────────────────

app.post("/tts", async (req, res) => {
  try {
    const { text, voice_id } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "ELEVENLABS_API_KEY not set in .env" });

    const voiceId = voice_id || process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
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

// ─── Start server ─────────────────────────────────────────────────────────────

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n🎯 PM Interview Coach running at http://localhost:${PORT}`);
  console.log(`   POST /start     → begin a new session`);
  console.log(`   POST /chat      → send a message`);
  console.log(`   GET  /progress  → see your scores\n`);
});