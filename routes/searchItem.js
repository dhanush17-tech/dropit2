const express = require("express");
const unirest = require("unirest");

const router = express.Router();
const puppeteer = require("puppeteer");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const serviceAccount = require("../price-tracker-4cc9b-firebase-adminsdk-8j9qc-d733aeb855.json");
const NodeCache = require("node-cache");
const { DateTime } = require("luxon");
const cache = new NodeCache();
const Redis = require("redis");
require("dotenv").config();

const client = Redis.createClient({
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
  },
});

/**
 * @openapi
 * /googleSearch:
 *   get:
 *     summary: Search for an item using Google Shopping.
 *     description: Retrieve items based on the search query and region.
 *     parameters:
 *       - in: query
 *         name: itemName
 *         required: true
 *         description: Name of the item to search for.
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         example: us
 *         required: true
 *         description: The region where the search is conducted (e.g., 'us' for the United States).
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of items based on the search query.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   buyLink:
 *                     type: string
 *                     description: The link to the product.
 *                   title:
 *                     type: string
 *                     description: The title of the product.
 *                   price:
 *                     type: string
 *                     description: The price of the product.
 *                   img:
 *                     type: string
 *                     description: The image URL of the product.
 *                   websiteLogo:
 *                     type: string
 *                     description: The logo URL of the website offering the product.
 *                   offer:
 *                     type: string
 *                     description: Special offers related to the product, if any.
 *       500:
 *         description: Internal Server Error or other server-side error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: The error message.
 */

router.get("/", async (req, res) => {
  if (!client.isOpen) {
    await client.connect();
  }
  try {
    const { itemName, region } = req.query;
    const cacheKey = `googleSearch_${itemName}_${region}`;

    // Check if data is in cache
    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log("Retrieved from cache");
      return res.json(JSON.parse(cachedData));
    }

    console.log(itemName, region);
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",

      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
    const page = await browser.newPage();

    await page.goto(
      `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(
        itemName
      )}&gl=${encodeURIComponent(region)}&hl=en`
    );
    await page.screenshot({ path: "path2.png" });
    const $ = cheerio.load(await page.content());
    await browser.close();

    const firstProductElements = $(".sh-dgr__content").slice(0, 10);

    const websiteLogoPromises = firstProductElements.map(async (i, el) => {
      const productName = $(el).find(".tAxDx").text().trim();
      const productLink = decodeURIComponent(
        $(el).find(".shntl a").attr("href").replace("/url?url=", "")
      );
      const productPrice = $(el).find(".a8Pemb").text().trim();
      const img = $(el).find(".ArOc1c img").first().attr("src");
      const websiteName = extractWebsiteName($(el).find(".aULzUe").text());
      const websiteLogo = await getWebsiteLogo(websiteName);

      let offer =
        $(el).find(".LGq5Zc").text().trim() ||
        $(el).find(".VRpiue").text().trim() ||
        $(el).find(".zY3Xhe").text().trim() ||
        "";

      return {
        buyLink: decodeURIComponent(productLink),
        title: productName,
        price: productPrice,
        img: img,
        websiteLogo: websiteLogo,
        offer:
          $(el).find(".zY3Xhe").text().trim() !== ""
            ? `Was ${$(el).find(".zY3Xhe").text().trim()}`
            : offer,
      };
    });

    const shelvesData = await Promise.all(websiteLogoPromises);
    console.log(shelvesData);

    // Cache the scraped data
    await client.setEx(cacheKey, 1800, JSON.stringify(shelvesData)); // Cache for 1 hour

    res.json(shelvesData);
  } catch (error) {
    process.on("uncaughtException", (err) => {
      console.error("There was an uncaught error", err);
      process.exit(1); //exit code 1 signals PM2 that the process should restart
    });
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

function extractWebsiteName(websiteNameString) {
  const parts = websiteNameString.split("}");
  return parts.length > 0 ? parts[parts.length - 1].trim() : null;
}

const getWebsiteLogo = async (productName) => {
  try {
    const query = encodeURIComponent(productName);
    const searchUrl = `https://www.google.com/search?q=${
      query.split(" ")[0]
    } icon logo&tbm=isch`;

    // Set a user-agent
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    };

    const response = await axios.get(searchUrl, { headers });

    const $ = cheerio.load(response.data);
    // Adjust the selector to find the image
    const websiteLogo = $(".RntSmf").find("img").attr("src");

    return websiteLogo;
  } catch (error) {
    console.error("Error fetching website logo:", error);
    return null;
  }
};

module.exports = router;
