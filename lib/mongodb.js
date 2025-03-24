const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGO_URI;

if (!MONGODB_URI) {
  throw new Error("⚠️ Please define MONGODB_URI in .env");
}

let cached = global.mongoose || { conn: null, promise: null };

async function connectToDatabase() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      dbName: "KogenieQueries", // 👈 optional, or use default
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

module.exports = connectToDatabase;