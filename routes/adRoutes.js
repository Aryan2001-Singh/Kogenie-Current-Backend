const express = require("express");
const Ad = require("../models/Ad");
const ScrapedAd = require("../models/ScrapedAd");
const router = express.Router();
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 300, checkperiod: 320 });
const compression = require("compression");
const mongoose = require("mongoose");
const logger = require("../utils/logger");

// ✅ Apply compression to all routes
router.use(compression());

/**
 * ✅ Store Ad (manual or scraped)
 */
router.post("/store", async (req, res) => {
  try {
    const {
      brandName,
      productName,
      productDescription,
      targetAudience,
      uniqueSellingPoints,
      adCopy,
      headline,
      userEmail,
      productImages = [],
      adType = "manual", // default is manual
    } = req.body;

    if (!productName || !productDescription || !adCopy || !headline) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const Model = adType === "scraped" ? ScrapedAd : Ad;

    const newAd = new Model({
      brandName,
      productName,
      productDescription,
      targetAudience,
      uniqueSellingPoints,
      adCopy,
      headline,
      userEmail,
      productImages,
      adType,
    });

    await newAd.save();

    cache.del("ads"); // Invalidate cache

    res.status(201).json({
      message: "✅ Ad stored successfully",
      adId: newAd._id.toString(),
    });
  } catch (error) {
    logger.error("❌ Error saving ad:", error);
    res.status(500).json({ message: "Error saving ad", error: error.message });
  }
});

/**
 * ✅ Fetch Ads with Caching
 */
router.get("/fetch", async (req, res) => {
  try {
    const cachedAds = cache.get("ads");
    if (cachedAds) {
      return res.status(200).json({ fromCache: true, ads: cachedAds });
    }

    const ads = await Ad.find().sort({ createdAt: -1 }).lean();
    cache.set("ads", ads);

    res.status(200).json({ fromCache: false, ads });
  } catch (error) {
    logger.error("❌ Error fetching ads:", error);
    res.status(500).json({ message: "Error fetching ads", error: error.message });
  }
});

/**
 * ✅ Fetch All Ads (Uncached)
 */
router.get("/", async (req, res) => {
  try {
    const ads = await Ad.find().sort({ createdAt: -1 }).lean();
    res.status(200).json(ads);
  } catch (error) {
    logger.error("❌ Error fetching ads:", error);
    res.status(500).json({ message: "Error fetching ads", error: error.message });
  }
});

/**
 * ✅ Feedback Submission
 */
router.post("/feedback", async (req, res) => {
  const { adId, adType, rating, comment } = req.body;

  if (!adId || !adType || typeof rating !== "number") {
    return res.status(400).json({ message: "Missing required feedback fields" });
  }

  try {
    // ✅ Use model name string to avoid Mongoose cache issues
    const modelName = adType === "scraped" ? "ScrapedAd" : "Ad";
    const Model = mongoose.model(modelName);

    const updatedAd = await Model.findByIdAndUpdate(
      adId,
      {
        $set: {
          feedback: {
            rating,
            comment,
          },
        },
      },
      { new: true }
    );

    if (!updatedAd) {
      return res.status(404).json({ message: "Ad not found" });
    }

    logger.info("📝 Feedback saved successfully:", updatedAd._id);
    res.status(200).json({ message: "Feedback saved", ad: updatedAd });
  } catch (error) {
    logger.error("❌ Error saving feedback:", error);
    res.status(500).json({ message: "Error saving feedback", error: error.message });
  }
});

module.exports = router;