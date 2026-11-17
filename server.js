require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "2mb" }));

const ContentSchema = new mongoose.Schema({
  key: { type: String, default: "main", unique: true },
  data: { type: mongoose.Schema.Types.Mixed, default: { edits: {}, hiddenSections: [], customBlocks: [] } },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
const Content = mongoose.model("SiteContent", ContentSchema);

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "nikhil-editz-cms-api" }));

function signToken() {
  return jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "12h" });
}
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts. Try again in 15 minutes." } });

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password are required." });
  const expectedUser = process.env.ADMIN_USERNAME || "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
  const sameUser = username === expectedUser;
  const samePassword = passwordHash ? await bcrypt.compare(password, passwordHash) : false;
  if (!sameUser || !samePassword) return res.status(401).json({ error: "Invalid username or password." });
  return res.json({ token: signToken(), expiresIn: "12h" });
});

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Admin login required." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== "admin") throw new Error("Invalid role");
    req.admin = payload;
    next();
  } catch (_) { return res.status(401).json({ error: "Session expired. Please sign in again." }); }
}
app.get("/api/auth/me", requireAdmin, (_req, res) => res.json({ ok: true, role: "admin" }));

app.get("/api/site-content", async (_req, res) => {
  try {
    const doc = await Content.findOne({ key: "main" }).lean();
    res.json({ data: doc?.data || { edits: {}, hiddenSections: [], customBlocks: [] } });
  } catch (error) { res.status(500).json({ error: "Could not read site content." }); }
});

app.put("/api/site-content", requireAdmin, async (req, res) => {
  try {
    const data = req.body || {};
    if (typeof data !== "object" || Array.isArray(data)) return res.status(400).json({ error: "Invalid content payload." });
    const safeData = {
      edits: data.edits && typeof data.edits === "object" ? data.edits : {},
      hiddenSections: Array.isArray(data.hiddenSections) ? data.hiddenSections.filter(x => typeof x === "string") : [],
      customBlocks: Array.isArray(data.customBlocks) ? data.customBlocks.slice(0, 200) : [],
      layouts: data.layouts && typeof data.layouts === "object" ? data.layouts : {},
      imageOverrides: data.imageOverrides && typeof data.imageOverrides === "object" ? data.imageOverrides : {},
      deletedElements: Array.isArray(data.deletedElements) ? data.deletedElements.filter(x => typeof x === "string") : []
    };
    const doc = await Content.findOneAndUpdate(
      { key: "main" }, { $set: { data: safeData, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ ok: true, updatedAt: doc.updatedAt });
  } catch (error) { res.status(500).json({ error: "Could not save site content." }); }
});

app.put("/api/site-content/edits", requireAdmin, async (req, res) => {
  try {
    const incoming = req.body?.edits || {};
    if (typeof incoming !== "object" || Array.isArray(incoming)) return res.status(400).json({ error: "Invalid edits." });
    const doc = await Content.findOne({ key: "main" });
    const data = doc?.data || { edits: {}, hiddenSections: [], customBlocks: [] };
    data.edits = { ...(data.edits || {}), ...incoming };
    const layouts = req.body?.layouts, imageOverrides = req.body?.imageOverrides, deletedElements = req.body?.deletedElements;
    if (layouts && typeof layouts === "object" && !Array.isArray(layouts)) data.layouts = { ...(data.layouts || {}), ...layouts };
    if (imageOverrides && typeof imageOverrides === "object" && !Array.isArray(imageOverrides)) data.imageOverrides = { ...(data.imageOverrides || {}), ...imageOverrides };
    if (Array.isArray(deletedElements)) data.deletedElements = [...new Set(deletedElements.filter(x => typeof x === "string"))];
    await Content.findOneAndUpdate({ key: "main" }, { $set: { data, updatedAt: new Date() } }, { upsert: true, new: true });
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: "Could not save text edits." }); }
});

app.use((error, _req, res, _next) => {
  if (error.message === "Origin not allowed by CORS") return res.status(403).json({ error: error.message });
  console.error(error);
  res.status(500).json({ error: "Server error." });
});

async function start() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters.");
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD_HASH are required.");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");
  app.listen(PORT, () => console.log(`CMS API listening on ${PORT}`));
}
start().catch(error => { console.error(error); process.exit(1); });
