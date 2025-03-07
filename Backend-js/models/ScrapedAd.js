const mongoose = require("mongoose");

const ScrapedAdSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    productDescription: { type: String, required: true },
    targetDescription: { type: String },
    productImages: { type: [String], default: [] },
    adCopy: { type: String, required: true },
    headline: { type: String, required: true },
    url: { type: String, required: true }, // ✅ Store the scraped URL
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "scrapedAds" } // ✅ Collection name in MongoDB
);

module.exports = mongoose.model("ScrapedAd", ScrapedAdSchema);