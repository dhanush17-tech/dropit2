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
 * /barcodeScan:
 *   get:
 *     summary: Scans barcode and retrieves product information.
 *     description: Uses a UPC code and region to search for products on Google Shopping and retrieves relevant product details.
 *     parameters:
 *       - in: query
 *         name: upcCode
 *         required: true
 *         description: The UPC code of the product to search for.
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         required: true
 *         description: The region where the search is conducted (e.g., 'us' for the United States).
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of products matching the UPC code.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   buyLink:
 *                     type: string
 *                     description: The link to purchase the product.
 *                   title:
 *                     type: string
 *                     description: The name of the product.
 *                   price:
 *                     type: string
 *                     description: The price of the product.
 *                   img:
 *                     type: string
 *                     description: URL to the image of the product.
 *                   websiteLogo:
 *                     type: string
 *                     description: URL to the logo of the website.
 *                   offer:
 *                     type: string
 *                     description: Any available offers for the product.
 *       500:
 *         description: Internal Server Error or other errors in fetching product details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message detailing what went wrong.
 */

router.get("/", async (req, res) => {
  const { upcCode, region } = req.query;
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (error) {
      res.json(500);
    }
  }
  const cacheKey = `barcodeScan_${upcCode}_${region}`;
  try {
    const cachedData = await client.get(cacheKey);
    if (cachedData) {
      console.log("Retrieved from cache");
      return res.json(JSON.parse(cachedData));
    } else {
      console.log("Barcode scan started");
      const shelvesData = await scrapeBarcodeData(upcCode, region);

      console.log(shelvesData);
      await client.setEx(cacheKey, 18000, JSON.stringify(shelvesData));

      res.json(shelvesData);
    }
  } catch {
    return res.status(500);
  }
});

async function scrapeBarcodeData(upcCode, region) {
  return getFirst4WordsFromGoogleSearch(upcCode).then(async (title) => {
    console.log(title);
    try {
      console.log(upcCode, region);
      const browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium-browser",

        args: ["--no-sandbox", "--disable-setuid-sandbox"],

        headless: true,
      });
      const page = await browser.newPage();

      await page.goto(
        `https://www.google.com/search?tbm=shop&q=${title}&tbm=shop&gl=${region}&tbs=mr:1,sales:1&hl=en`
      );
      await page.screenshot({ path: "path2.png" });
      const $ = cheerio.load(await page.content());
      await browser.close();

      // Select the first product elements
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

      // Use Promise.all to wait for all websiteLogoPromises to resolve
      const shelvesData = await Promise.all(websiteLogoPromises);

      return shelvesData;
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "An error occurred" });
      process.on("uncaughtException", (err) => {
        console.error("There was an uncaught error", err);
        process.exit(1); //exit code 1 signals PM2 that the process should restart
      });
    }
  });
}

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

async function getFirst4WordsFromGoogleSearch(query) {
  let browser;
  try {
    // Launch a headless browser
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",

      args: ["--no-sandbox", "--disable-setuid-sandbox"],

      headless: true,
    });

    // Open a new page
    const page = await browser.newPage();

    // Navigate to the page
    await page.goto(`https://www.buycott.com/upc/${query}`);
    await page.screenshot({ path: "path.png" });

    // Extract the text from the element
    const title = await page.$eval("h2", (element) => element.textContent);

    // Log the title
    console.log(title);

    // Return the title
    return title.trim().split(" ").slice(0, 4).join(" ");
  } catch (error) {
    console.error("An error occurred:", error);
    res.status(500);
    throw error;
  } finally {
    // Close the browser
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = router;
