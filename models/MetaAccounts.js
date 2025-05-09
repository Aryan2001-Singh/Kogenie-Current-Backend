const mongoose = require("mongoose");

const MetaAccountSchema = new mongoose.Schema({
  // Clerk user ID (for linking with your app)
  clerkUserId: { type: String, required: true },

  // Meta auth info
  fbUserId: String,
  fbAccessToken: String,
  tokenExpiry: Date,

  // Facebook Page info (for publishing)
  fbPageId: String,
  fbPageName: String,
  fbPageAccessToken: String,

  // Connected Instagram Business Account
  igUserId: String,
  igUsername: String,
});

module.exports = mongoose.model("MetaAccount", MetaAccountSchema);