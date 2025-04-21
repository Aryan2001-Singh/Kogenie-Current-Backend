const mongoose = require("mongoose");

const ScrapedAdSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    productDescription: { type: String, required: true },
    targetDescription: { type: String },

    productImages: {
      type: [String], // Array of image URLs
      default: [],
    },

    adCopy: { type: String, required: true },
    headline: { type: String, required: true },

    url: { type: String, required: true }, // Store the scraped URL
    userEmail: { type: String }, // Optional for scraped ads

    tags: {
      type: [String], // ✅ Tags like ['seasonal', 'promotion', 'tech']
      default: [],
    },

    feedback: {
      rating: Number,
      comment: String,
    },

    adType: { type: String, default: "scraped" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "scrapedAds", // ✅ Explicit collection name
  }
);

module.exports = mongoose.model("ScrapedAd", ScrapedAdSchema);