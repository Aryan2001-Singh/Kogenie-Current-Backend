const mongoose = require("mongoose");

const AdSchema = new mongoose.Schema({
  brandName: { type: String, required: true },
  productName: { type: String, required: true },
  productDescription: { type: String, required: true },
  targetAudience: { type: String, required: true },
  uniqueSellingPoints: { type: String, required: true },
  adCopy: { type: String, required: true },
  headline: { type: String, required: true },
  userEmail: { type: String, required: true },
  productImages: {
    type: [String],
    default: [],
  },
  tags: {
    type: [String], // ✅ Array of tags like ['funny', 'conversion', 'holiday']
    default: [],
  },
  feedback: {
    rating: Number,
    comment: String,
  },
  adType: { type: String, default: "manual" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Ad", AdSchema);