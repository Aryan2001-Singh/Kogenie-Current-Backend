const mongoose = require("mongoose");

const AdSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true },
    productName: { type: String, required: true },
    productDescription: { type: String, required: true },
    targetAudience: { type: String, required: true },
    uniqueSellingPoints: { type: String, required: true },
    adCopy: { type: String, required: true },
  },
  { timestamps: true } // Adds createdAt & updatedAt fields
);

module.exports = mongoose.model("Ad", AdSchema);