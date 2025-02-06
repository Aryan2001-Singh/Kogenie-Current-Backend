const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs'); 
const path = require('path'); 
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const connectDB = require("./config/db"); // ✅ Import DB Connection
const compression = require("compression")// Enable response compression
const helmet = require("helmet");// Improve security with helmet 
// const rateLimit = require("express-rate-limit"); //Apply rate limiting 
const adRoutes = require("./routes/adRoutes");
require('dotenv').config();
connectDB();
const app = express();
app.use(express.json());
app.use(compression()); // Apply compression Middleware
app.use(helmet()); //Secure HTTP Headers

// Apply Rate Limiting to Prevent Abuse 

// const limiter = rateLimit({
//   windowMs: 5 * 60 * 1000, //5 Minutes 
//   max: 1000 //Limit each IP to 100 requests per windowMs
// });
// app.use(limiter);
app.use(
  cors({
    origin: ['https://www.kogenie.com', 'https://kogenie.com', 'http://localhost:3000','http://localhost:3001'],
  }),
  
);
app.use("/api/ads", adRoutes); 

// Function to get target description
function getTargetDescription(gender, ageGroup) {
  const descriptions = {
    female: {
      '9-18': 'The ad should appeal to young girls with a focus on fun, color, and trendy designs.',
      '18-25': 'The ad should emphasize style, comfort, and empowerment, as young women in this age group often look for products that complement their personal style and lifestyle.',
      '25-40': 'For women in this age group, the ad should focus on a balance of comfort, elegance, and professional appeal.',
      '40-60': 'The ad should emphasize comfort, sophistication, and practicality, appealing to women who value quality and timeless style.',
      '60+': 'The ad should highlight comfort, elegance, and the product’s ability to bring relaxation and ease to daily life.',
    },
    male: {
      '9-18': 'The ad should appeal to young boys or teens, focusing on energy, coolness, and modern trends.',
      '18-25': 'The ad should focus on style, confidence, and boldness, appealing to young men who are exploring their identity and fashion preferences.',
      '25-40': 'For men in this age group, the ad should emphasize practicality, style, and versatility.',
      '40-60': 'The ad should appeal to men with a focus on quality, durability, and classic style, suitable for both personal and professional settings.',
      '60+': 'The ad should highlight comfort, ease of use, and thoughtful gifts for loved ones.',
    },
    others: {
      '*': 'The ad should emphasize inclusivity, comfort, and a sense of belonging, appealing to individuals of diverse identities who value style and self-expression across all age groups.',
    },
  };

  if (gender === 'others') {
    return descriptions.others['*'];
  }
  return descriptions[gender]?.[ageGroup] || '';
}

// Function to save data to a CSV file
function saveToCSV(data) {
  const filePath = path.join(__dirname, 'GeneratedAdData.csv'); // File path for the CSV file
  const headers = ['Brand Name', 'Product Name', 'Product Description', 'Target Description', 'Ad Copy'];

  // Check if the file exists
  const fileExists = fs.existsSync(filePath);

  // If the file doesn't exist, create it and write the headers
  if (!fileExists) {
    const headerRow = headers.join(',') + '\n';
    fs.writeFileSync(filePath, headerRow, 'utf8');
  }

  // Append the new data to the file
  const row = [
    `"${data.brandName}"`,
    `"${data.productName}"`,
    `"${data.productDescription}"`,
    `"${data.targetDescription}"`,
    `"${data.adCopy}"`,
  ].join(',') + '\n';

  fs.appendFileSync(filePath, row, 'utf8');
}

// Endpoint: Create Ad (via scraping)
app.post('/createAd', async (req, res) => {
  const { url, gender, ageGroup } = req.body;

  if (!url) {
    return res.status(400).json({ message: 'No URL provided' });
  }

  try {
    console.log('Received URL:', url);

    // Call the Python scraping service
    const scrapeResponse = await axios.post('http://localhost:8000/scrape', { url });
    const productData = scrapeResponse.data;

    console.log('Scraped Product Data:', productData);

    // Get target description
    const targetDescription = getTargetDescription(gender, ageGroup);

    // Prepare prompt for GPT
    const prompt = `feature+benefit+meaning
      feature = what it is
      benefit = what it does
      meaning = what it means to the buyer/reader/prospect
      formula = it____(feature)so you can ____(benefit)which means_________(meaning)
      Using this formula, create an advertisement for:
      - Brand Name: ${productData.brandName}
      - Product Name: ${productData.productName}
      - Features: ${productData.productDescription}
      - Target Audience: General`;

    // Generate ad copy using OpenAI API
    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an AI that generates ad copy.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const adCopy = gptResponse.data.choices[0].message.content;

    // Combine all data
    const responseData = {
      ...productData,
      targetDescription,
      adCopy,
    };

    // Save the data to a CSV file
    saveToCSV(responseData);

    // Send the response back to the client
    res.json(responseData);
  } catch (error) {
    console.error('Error generating ad:', error);
    res.status(500).json({ message: 'Error generating ad', error: error.message });
  }
});

// Endpoint: Manual Ad Generation
app.post('/generateAdPrompt', async (req, res) => {
  const { brandName, productName, productDescription, targetAudience, uniqueSellingPoints } = req.body;

  // Validate the input fields
  if (!brandName || !productName || !productDescription || !targetAudience || !uniqueSellingPoints) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // Construct a prompt for GPT-4 based on manual entry
    const prompt = `Generate an engaging ad for the following product:
                    Brand: ${brandName}
                    Product: ${productName}
                    Description: ${productDescription}
                    Target Audience: ${targetAudience}
                    Unique Selling Points: ${uniqueSellingPoints}`;

    const gptResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an AI that generates ad copy.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 150,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    const adCopy = gptResponse.data.choices[0].message.content;

    // Send generated ad copy and original data back to the frontend
    res.json({
      brandName,
      productName,
      productDescription,
      targetAudience,
      uniqueSellingPoints,
      adCopy,
    });
  } catch (error) {
    console.error('Error generating ad:', error);
    res.status(500).json({ message: 'Error generating ad', error: error.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});