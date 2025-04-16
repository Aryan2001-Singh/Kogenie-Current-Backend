const mongoose = require("mongoose");

const MetaAccountSchema = new mongoose.Schema({
  clerkUserId: { type: String, required: true },
  fbUserId: String,
  fbAccessToken: String,
  fbPageId: String,
  igUserId: String,
  tokenExpiry: Date,
});

module.exports = mongoose.model("MetaAccount", MetaAccountSchema);