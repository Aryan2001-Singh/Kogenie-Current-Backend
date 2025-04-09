const mongoose = require("mongoose");
const AdSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true, index: true }, // Indexing for faster queries
    productName: { type: String, required: true },
    productDescription: { type: String, required: true },
    targetAudience: { type: String, required: true },
    uniqueSellingPoints: { type: String, required: true },
    adCopy: { type: String, required: true },
    headline: { type: String, required: true },
    userEmail: { type: String, required: true, index: true }, // Indexing userEmail for quick lookups

    // ✅ NEW FIELD TO ADD
    productImages: {
      type: [String], // Array of image URLs
      default: [],
    },
  },
  { timestamps: true } // Adds createdAt & updatedAt fields
);

module.exports = mongoose.model("Ad", AdSchema);