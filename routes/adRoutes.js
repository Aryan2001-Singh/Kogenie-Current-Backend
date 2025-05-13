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
      tone,
      goal,
      theme,
    } = req.body;

    if (!productName || !productDescription || !adCopy || !headline) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const Model = adType === "scraped" ? ScrapedAd : Ad;

    const tags =
      adType === "scraped"
        ? [tone, goal, theme, "scraped"]
            .filter(Boolean)
            .map((tag) => tag.trim().toLowerCase())
        : [];

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
      ...(adType === "scraped" ? { tags } : {}),
    });

    await newAd.save();

    cache.del("ads");

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
    const Model = adType === "scraped" ? ScrapedAd : Ad;

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

/**
 * ✅ Fetch Ads for a Specific User
 */
router.get("/user-history/:email", async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const manualAds = await Ad.find({ userEmail: email }).sort({ createdAt: -1 }).lean();
    const scrapedAds = await ScrapedAd.find({ userEmail: email }).sort({ createdAt: -1 }).lean();

    res.status(200).json({ manual: manualAds, scraped: scrapedAds });
  } catch (error) {
    res.status(500).json({ message: "Error fetching user ads", error: error.message });
  }
});

/**
 * ✅ Creative Library Filtered Query
 */
router.post("/library", async (req, res) => {
  const { email, filters = {}, sortBy = "newest" } = req.body;

  if (!email) return res.status(400).json({ message: "Email is required" });

  const buildQuery = () => {
    const query = { userEmail: email };

    ["tone", "goal", "theme"].forEach((field) => {
      if (filters[field]) {
        query[field] = {
          $regex: `^${filters[field]}$`,
          $options: "i", // case-insensitive
        };
      }
    });

    if (filters.minRating) {
      query["feedback.rating"] = { $gte: filters.minRating };
    }

    if (filters.fromDate || filters.toDate) {
      query.createdAt = {};
      if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
      if (filters.toDate) query.createdAt.$lte = new Date(filters.toDate);
    }

    return query;
  };

  try {
    const manualQuery = buildQuery();
    const scrapedQuery = buildQuery();

    const sortOption =
      sortBy === "bestRated"
        ? { "feedback.rating": -1 }
        : sortBy === "oldest"
        ? { createdAt: 1 }
        : { createdAt: -1 };

    const manual = await Ad.find(manualQuery).sort(sortOption).lean();
    const scraped = await ScrapedAd.find(scrapedQuery).sort(sortOption).lean();

    res.status(200).json({ manual, scraped });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch filtered ads", error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    let ad = await Ad.findById(id);
    if (!ad) {
      ad = await ScrapedAd.findById(id); // Fallback to scraped
    }

    if (!ad) {
      return res.status(404).json({ message: "Ad not found" });
    }

    res.status(200).json(ad);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;