const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

function jwtSecret() {
  return process.env.JWT_SECRET || "hermes-dev-secret-change-me";
}

function adminUsername() {
  return process.env.ADMIN_USERNAME || process.env.ADMIN_USER || "admin";
}

async function verifyPassword(password) {
  if (!password) return false;
  const plain = process.env.ADMIN_PASSWORD || process.env.ADMIN_PASS;
  if (plain && password === plain) return true;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
  return false;
}

function signToken(username) {
  return jwt.sign(
    { sub: username, role: "admin" },
    jwtSecret(),
    { expiresIn: "7d" }
  );
}

function readToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const payload = verifyToken(readToken(req));
  if (!payload) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  req.user = payload;
  next();
}

function optionalAuth(req, _res, next) {
  req.user = verifyToken(readToken(req));
  next();
}

module.exports = {
  adminUsername,
  verifyPassword,
  signToken,
  readToken,
  verifyToken,
  requireAuth,
  optionalAuth
};
