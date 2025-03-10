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
connectDB();
const app = express();
app.use(express.json());
app.use(compression()); // Apply compression Middleware
app.use(helmet()); //Secure HTTP Headers
const chromium = require("chrome-aws-lambda");
const puppeteer = require("puppeteer-core");
const cors = require("cors");

// ✅ Allowed frontend origins
const allowedOrigins = [
  "https://www.kogenie.com/",
  "https://www.kogenie.com",
  "https://kogenie.com",
  "https://kogenie-current-frontend.onrender.com",
  "http://localhost:3000", // ✅ For local testing
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error("❌ Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // ✅ Ensure OPTIONS is included
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

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

// ✅ Function to Scrape Product Data using Puppeteer

async function scrapeProductData(url) {
  console.log("🔵 Scraping URL:", url);

  const browser = await puppeteer.launch({
    args: chromium.args, // ✅ Use optimized serverless arguments
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(), // ✅ Uses pre-built Chromium
    headless: chromium.headless, // ✅ Ensures stable headless mode
  });

  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0");

  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const content = await page.content();
  await browser.close();

  if (!content || content.length === 0) {
    throw new Error("Failed to load webpage content");
  }

  const $ = cheerio.load(content);
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
}
// Endpoint: Create Ad (via scraping)
app.post("/createAd", async (req, res) => {
  const { url, gender, ageGroup } = req.body;

  if (!url) {
    return res.status(400).json({ message: "No URL provided" });
  }

  try {
    console.log("Received URL:", url);

    // ✅ Scrape product data using Puppeteer
    const { productName, productDescription, productImages } =
      await scrapeProductData(url);

    if (!productName || !productDescription) {
      return res
        .status(500)
        .json({ message: "Failed to extract product details" });
    }
    console.log("✅ Scraped Data:", {
      productName,
      productDescription,
      productImages,
    });
    const targetDescription = getTargetDescription(gender, ageGroup);

    // Prepare prompt for GPT
    const prompt = `You are an AI that generates ads based on 
    feature+benefit+meaning
    feature = what it is
    benefit = what it does
    meaning = what it means to the buyer/reader/prospect
    formula = it____(feature)so you can ____(benefit)which means_________(meaning)
    Using this formula, create an advertisement and a headline for:
    - Product Name: ${productName}
    - Features: ${productDescription}
    - Target Audience: General`;

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
    console.log("Claude Response Text:", fullResponse);

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

    console.log("🟢 Extracted Headline:", extractedHeadline);

    // ✅ Extract Ad Copy (everything after "Ad copy:")
    const adCopyMatch = fullResponse.match(/Ad copy:\s*([\s\S]*)/);
    const extractedAdCopy = adCopyMatch ? adCopyMatch[1].trim() : fullResponse; // Fallback

    console.log("🔵 Full OpenAI Response:", fullResponse);
    console.log("🟢 Extracted Headline:", extractedHeadline);
    console.log("🟢 Extracted Ad Copy:", extractedAdCopy);
    console.log("Received Ad Copy:", extractedAdCopy);

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
    console.log("✅ Scraped Ad saved to MongoDB:", newScrapedAd);

    // Send the response back to the client
    res.json(responseData);
  } catch (error) {
    console.error("Error generating ad:", error);
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
  } = req.body;

  // Validate the input fields
  if (
    !brandName ||
    !productName ||
    !productDescription ||
    !targetAudience ||
    !uniqueSellingPoints
  ) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // Construct a prompt for GPT-4 based on manual entry
    const prompt = `You are an AI that generates ads based on 
    feature+benefit+meaning
    feature = what it is
    benefit = what it does
    meaning = what it means to the buyer/reader/prospect
    formula = it____(feature)so you can ____(benefit)which means_________(meaning)
    Using this formula, create an advertisement and a headline for:
    - Product Name: ${productName}
    - Features: ${productDescription}
    - Target Audience: General`;

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
    console.log(
      "🔵 Claude Response:",
      JSON.stringify(claudeResponse.data, null, 2)
    );

    // ✅ Try extracting Headline explicitly
    const fullResponse = claudeResponse.data?.content?.[0]?.text || "";
    console.log("Claude Response Text:", fullResponse);

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

    console.log("🟢 Extracted Headline:", extractedHeadline);

    // ✅ Extract ad copy (everything after "Ad copy:")
    const adCopyMatch = fullResponse.match(/Ad copy:\s*([\s\S]*)/);
    const adCopy = adCopyMatch ? adCopyMatch[1].trim() : fullResponse; // Fallback to full response

    console.log("🔵 Full OpenAI Response:", fullResponse);
    // console.log("🟢 Extracted Headline:", headline);
    console.log("🟢 Extracted Ad Copy:", adCopy);

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
    console.error("Error generating ad:", error);
    res
      .status(500)
      .json({ message: "Error generating ad", error: error.message });
  }
});

const PORT = process.env.PORT || 8080; // ✅ Use Render's assigned port
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
