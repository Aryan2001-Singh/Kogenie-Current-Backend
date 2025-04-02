require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const cheerio = require("cheerio");
const connectDB = require("./config/db"); // ✅ Import DB Connection
const compression = require("compression"); // Enable response compression
const helmet = require("helmet"); // Improve security with helmet
const ScrapedAd = require("./models/ScrapedAd");
const adRoutes = require("./routes/adRoutes");
const logger = require("./utils/logger");
const contactRoutes = require("./routes/contact");
const Ad = require("./models/Ad"); // ✅ Already exists? Great.

connectDB();

const cors = require("cors");
const app = express();
// ✅ Allowed frontend origins
const allowedOrigins = [
  "https://www.kogenie.com/",
  "https://www.kogenie.com",
  "https://kogenie.com",
  "http://localhost:3000", // ✅ For local testing
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.error("❌ Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // ✅ Ensure OPTIONS is included
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP if needed
  })
);
app.use(compression()); // Apply compression Middleware
app.use(helmet()); //Secure HTTP Headers

const rateLimit = require("express-rate-limit");
const { unique } = require("next/dist/build/utils");
const { platform } = require("os");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Reduce request limit to 50 per 15 minutes
  message: "Too many requests, please try again later!",
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use(limiter);

// for send us a message page
app.use("/api", contactRoutes);

// ✅ Ensure headers are set for all responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});
app.use("/api/ads", adRoutes);

// Function to get target description
function getTargetDescription(gender, ageGroup) {
  const descriptions = {
    female: {
      "9-18":
        "The ad should appeal to young girls with a focus on fun, color, and trendy designs.",
      "18-25":
        "The ad should emphasize style, comfort, and empowerment, as young women in this age group often look for products that complement their personal style and lifestyle.",
      "25-40":
        "For women in this age group, the ad should focus on a balance of comfort, elegance, and professional appeal.",
      "40-60":
        "The ad should emphasize comfort, sophistication, and practicality, appealing to women who value quality and timeless style.",
      "60+":
        "The ad should highlight comfort, elegance, and the product’s ability to bring relaxation and ease to daily life.",
    },
    male: {
      "9-18":
        "The ad should appeal to young boys or teens, focusing on energy, coolness, and modern trends.",
      "18-25":
        "The ad should focus on style, confidence, and boldness, appealing to young men who are exploring their identity and fashion preferences.",
      "25-40":
        "For men in this age group, the ad should emphasize practicality, style, and versatility.",
      "40-60":
        "The ad should appeal to men with a focus on quality, durability, and classic style, suitable for both personal and professional settings.",
      "60+":
        "The ad should highlight comfort, ease of use, and thoughtful gifts for loved ones.",
    },
    others: {
      "*": "The ad should emphasize inclusivity, comfort, and a sense of belonging, appealing to individuals of diverse identities who value style and self-expression across all age groups.",
    },
  };

  if (gender === "others") {
    return descriptions.others["*"];
  }
  return descriptions[gender]?.[ageGroup] || "";
}

async function scrapeProductData(url) {
  logger.info("🔵 Scraping URL using ScraperAPI:", url);

  const apiKey = process.env.SCRAPER_API_KEY; // ✅ Ensure the API key is loaded correctly
  const scraperUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(
    url
  )}`;

  try {
    // 🛠 Fetch the webpage using ScraperAPI
    const response = await axios.get(scraperUrl);

    if (!response.data) {
      throw new Error("❌ Failed to fetch webpage content");
    }

    logger.info("✅ Scraping successful!");

    // ✅ Parse HTML using Cheerio
    const $ = cheerio.load(response.data);

    const productName =
      $("meta[property='og:title']").attr("content") || $("title").text();
    const productDescription =
      $("meta[property='og:description']").attr("content") ||
      $("meta[name='description']").attr("content");

    const productImages = [];
    $("img").each((i, img) => {
      let src = $(img).attr("src");
      if (src && !src.startsWith("data:image")) {
        if (!src.startsWith("http")) {
          src = new URL(src, url).href;
        }
        productImages.push(src);
      }
    });

    return { productName, productDescription, productImages };
  } catch (error) {
    logger.error("❌ ScraperAPI Error:", error.message);
    return null;
  }
}
// Endpoint: Create Ad (via scraping)
app.post("/createAd", async (req, res) => {
  const { url, gender, ageGroup } = req.body;

  if (!url) {
    return res.status(400).json({ message: "No URL provided" });
  }

  try {
    logger.info("Received URL:", url);

    // ✅ Scrape product data using Puppeteer
    const { productName, productDescription, productImages } =
      await scrapeProductData(url);

    if (!productName || !productDescription) {
      return res
        .status(500)
        .json({ message: "Failed to extract product details" });
    }
    logger.info("✅ Scraped Data:", {
      productName,
      productDescription,
      productImages,
    });
    const targetDescription = getTargetDescription(gender, ageGroup);

    // Prepare prompt for GPT
    const prompt = `You are an AI that generates 5 ads based on 
    feature+benefit+meaning
    feature = what it is
    benefit = what it does
    meaning = what it means to the buyer/reader/prospect
    formula = it____(feature)so you can ____(benefit)which means_________(meaning)
    Using this formula, create an advertisement and a headline for:
    - Product Name: ${productName}
    - Features: ${productDescription}
    - Target Audience: ${ageGroup},${gender}`;

    // Generate ad copy using OpenAI API
    const claudeResponse = await axios.post(
      "https://api.anthropic.com/v1/messages", // ✅ Correct Endpoint
      {
        model: "claude-3-opus-20240229", // ✅ Ensure this model is accessible
        max_tokens: 300, // ✅ Correct field name
        temperature: 0.7, // Optional: Adjust creativity
        messages: [
          // ✅ Correct format for Anthropic API
          { role: "user", content: `\n\nHuman: ${prompt}\n\nAssistant:` },
        ],
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    const fullResponse = claudeResponse.data?.content?.[0]?.text || "";
    logger.info("Claude Response Text:", fullResponse);

    // ✅ Extract Headline from Response
    const headlineMatch = fullResponse.match(/Headline:\s*(.*?)(\n|$)/);
    let extractedHeadline = headlineMatch
      ? headlineMatch[1].trim()
      : "Headline Not Generated";

    // ✅ Fallback: Use first bolded sentence if no headline is found
    if (!extractedHeadline || extractedHeadline === "Headline Not Generated") {
      const firstSentence = fullResponse.split(".")[0]; // Extract first sentence
      extractedHeadline =
        firstSentence.length > 5 ? firstSentence.trim() : "Default Headline";
    }

    logger.info("🟢 Extracted Headline:", extractedHeadline);

    // ✅ Extract Ad Copy (everything after "Ad copy:")
    const adCopyMatch = fullResponse.match(/Ad copy:\s*([\s\S]*)/);
    const extractedAdCopy = adCopyMatch ? adCopyMatch[1].trim() : fullResponse; // Fallback

    logger.info("🔵 Full OpenAI Response:", fullResponse);
    logger.info("🟢 Extracted Headline:", extractedHeadline);
    logger.info("🟢 Extracted Ad Copy:", extractedAdCopy);
    logger.info("Received Ad Copy:", extractedAdCopy);

    // Combine all data
    const responseData = {
      productName,
      productDescription,
      productImages,
      targetDescription,
      adCopy: extractedAdCopy, // ✅ Store extracted ad copy
      headline: extractedHeadline, // ✅ Store extracted headline
    };
    // ✅ Save the scraped ad in MongoDB instead of CSV
    const newScrapedAd = new ScrapedAd({
      productName,
      productDescription,
      targetDescription,
      productImages,
      adCopy: extractedAdCopy,
      headline: extractedHeadline,
      url, // ✅ Store the original product URL
    });

    await newScrapedAd.save();
    logger.info("✅ Scraped Ad saved to MongoDB:", newScrapedAd);

    // Send the response back to the client
    res.json(responseData);
  } catch (error) {
    logger.error("Error generating ad:", error);
    res
      .status(500)
      .json({ message: "Error generating ad", error: error.message });
  }
});

// Endpoint: Manual Ad Generation
app.post("/generateAdPrompt", async (req, res) => {
  const {
    brandName,
    productName,
    productDescription,
    targetAudience,
    uniqueSellingPoints,
    brandVoice,
    awarenessStage,
    tone,
    goal,
    theme,
    problemItSolves,
    useLocation,
    platform,
    persuasionBlocks = [],
    userEmail,
  } = req.body;

  // Validate the input fields
  if (
    !brandName ||
    !productName ||
    !productDescription ||
    !targetAudience ||
    !uniqueSellingPoints ||
    !brandVoice ||
    !awarenessStage ||
    !tone ||
    !goal ||
    !theme ||
    !problemItSolves ||
    !useLocation ||
    !platform ||
    !persuasionBlocks.length ||
    !userEmail
  ) {
    return res.status(400).json({
      message: "Missing required fields",
      missing: {
        brandName,
        productName,
        productDescription,
        targetAudience,
        uniqueSellingPoints,
        brandVoice,
        awarenessStage,
        tone,
        goal,
        theme,
        problemItSolves,
        useLocation,
        platform,
        persuasionBlocks,
      },
    });
  }

  logger.info(
    "🔍 Request Body Received:\n" + JSON.stringify(req.body, null, 2)
  );

  try {
    // Construct a prompt for GPT-4 based on manual entry
    const prompt = `You are an AI that generates compelling ads using selected persuasion building blocks

Selected Blocks: ${persuasionBlocks.join(", ")}

Definitions:
- Feature = what it is
- Benefit = what it does
- Meaning = what it means to the buyer
- Attention = capture with a hook
- Interest = build curiosity
- Desire = make them want it
- Action = drive them to act

Using these elements, generate an ad headline and copy based on:
- Product Name: ${productName}
- Product Description: ${productDescription}
- Unique Selling Points: ${uniqueSellingPoints}
- Target Audience: ${targetAudience}
- Brand Voice: ${brandVoice}
- Customer Awareness Stage: ${awarenessStage}
- Tone: ${tone}
- Goal: ${goal}
- Theme: ${theme}
- Problem it Solves: ${problemItSolves}
- Location: ${useLocation}
- Platform: ${platform}

Keep the ad under 30 words. Make it emotionally resonant and aligned with the brand voice.`;

    const claudeResponse = await axios.post(
      "https://api.anthropic.com/v1/messages", // ✅ Correct Endpoint
      {
        model: "claude-3-opus-20240229", // ✅ Ensure this model is accessible
        max_tokens: 300, // ✅ Correct field name
        temperature: 0.7, // Optional: Adjust creativity
        messages: [
          // ✅ Correct format for Anthropic API
          { role: "user", content: `\n\nHuman: ${prompt}\n\nAssistant:` },
        ],
      },
      {
        headers: {
          "x-api-key": process.env.CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
      }
    );

    // ✅ Debugging: Log the entire GPT response
    logger.info(
      "🔵 Claude Response:",
      JSON.stringify(claudeResponse.data, null, 2)
    );

    // ✅ Try extracting Headline explicitly
    const fullResponse = claudeResponse.data?.content?.[0]?.text || "";
    logger.info("Claude Response Text:", fullResponse);

    // ✅ Extract Headline from Response
    const headlineMatch = fullResponse.match(/Headline:\s*(.*?)(\n|$)/);
    let extractedHeadline = headlineMatch
      ? headlineMatch[1].trim()
      : "Headline Not Generated";

    // ✅ Fallback: Use first sentence if no headline is found
    if (!extractedHeadline || extractedHeadline === "Headline Not Generated") {
      const firstSentence = fullResponse.split(".")[0]; // Extract first sentence
      extractedHeadline =
        firstSentence.length > 5 ? firstSentence.trim() : "Default Headline";
    }

    logger.info("🟢 Extracted Headline:", extractedHeadline);

    // ✅ Extract ad copy (everything after "Ad copy:")
    const adCopyMatch = fullResponse.match(/Ad copy:\s*([\s\S]*)/);
    const adCopy = adCopyMatch ? adCopyMatch[1].trim() : fullResponse; // Fallback to full response

    logger.info("🔵 Full OpenAI Response:", fullResponse);
    // logger.info("🟢 Extracted Headline:", headline);
    logger.info("🟢 Extracted Ad Copy:", adCopy);

    // ✅ Save to MongoDB
    const newManualAd = new Ad({
      brandName,
      productName,
      productDescription,
      targetAudience,
      uniqueSellingPoints,
      adCopy,
      headline:extractedHeadline,
      userEmail,
    });

    await newManualAd.save();
    logger.info("✅ Manual Ad saved to MongoDB:", newManualAd);
    
    // ✅ Send back both headline and adCopy
    res.json({
      brandName,
      productName,
      productDescription,
      targetAudience,
      uniqueSellingPoints,
      adCopy,
      headline: extractedHeadline, // ✅ Corrected!
    });
  } catch (error) {
    logger.error("Error generating ad:", error);
    res
      .status(500)
      .json({ message: "Error generating ad", error: error.message });
  }
});

const PORT = process.env.PORT || 8080; // ✅ Use Render's assigned port
app.listen(PORT, "0.0.0.0", () => {
  logger.info(`✅ Server running on port ${PORT}`);
});
