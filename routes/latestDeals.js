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
 * @swagger
 * /latestDeals:
 *   get:
 *     summary: Get the latest deals based on item name and region.
 *     description: Retrieve the latest deals for a given item in a specified region with optional pagination.
 *     parameters:
 *       - in: query
 *         name: itemName
 *         required: true
 *         description: Name of the item to search for deals.
 *         schema:
 *           type: string
 *       - in: query
 *         name: region
 *         required: true
 *         description: Region where the item deals are to be searched.
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number for pagination.
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of deals per page for pagination.
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: An array of deals with details for each item.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   buyLink:
 *                     type: string
 *                     description: The URL where the product can be purchased.
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
 *                   websiteName:
 *                     type: string
 *                     description: The name of the website offering the product.
 *                   offer:
 *                     type: string
 *                     description: Any special offers for the product.
 *       500:
 *         description: Error fetching the deals or internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Error message explaining the reason for the failure.
 */


router.get("/", async (req, res) => {
  console.log("Started....");

  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (err) {
      return res.status(500).json({ error: "Redis connection failed" });
    }
  }

  const { itemName, region, page = 1, limit = 10 } = req.query;
  console.log(page, limit);

  const cacheKey = `latestDeals_${itemName}_${region}_${page}_${limit}`;

  try {
    const data = await client.get(cacheKey);
    if (data) {
      console.log("Retrieved from cache");
      return res.json(JSON.parse(data));
    } else {
      const initialData = await fetchData(itemName, region, page, page + 10);
      console.log("Data stored in cache");

      await client.setEx(cacheKey, 18000, JSON.stringify(initialData));
      return res.json(initialData);
    }
  } catch (err) {
  
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

async function fetchData(itemName, region, startIndex, endIndex) {
  let browser;

  try {
    browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: "/usr/bin/chromium-browser",
      headless: true,
    });
    const page = await browser.newPage();
    // go to a page and type in a query in the search input field and press enter
    await page.goto(
      `https://www.google.com/search?q=${itemName}&tbm=shop&gl=${region}&tbs=mr:1,sales:1&hl=en`
    );
    await page.screenshot({ path: "path.png" });

    const content = await page.content();
    const $ = cheerio.load(content);

    const firstProductElements = $(".sh-dgr__content").slice(
      startIndex,
      endIndex
    );
    const shelvesData = await Promise.all(
      firstProductElements.map(async (i, el) => {
        const productName = $(el).find(".tAxDx").text().trim();
        const productLink = decodeURIComponent(
          $(el)
            .find(".shntl a")
            .eq(0)
            .attr("href")
            .replace("/url?url=", "")
            .replace("http://www.google.com", "")
        );
        const productPrice = $(el).find(".a8Pemb ").text().trim();
        const img = $(el).find(".ArOc1c img").first().attr("src");
        const websiteName = extractWebsiteName($(el).find(".aULzUe").text());
        const websiteLogo = await getWebsiteLogo(websiteName);

        let offer =
          $(el).find(".LGq5Zc").text().trim() ||
          $(el).find(".VRpiue").text().trim() ||
          $(el).find(".zY3Xhe").text().trim() ||
          "";
        let firstHttpsIndex = productLink.indexOf("https");

        // Find the second occurrence by starting the search just after the first "https"
        let secondHttpsIndex = productLink.indexOf(
          "https",
          firstHttpsIndex + 1
        );

        return {
          buyLink: productLink.substring(secondHttpsIndex),
          title: productName,
          price: productPrice,
          img,
          websiteLogo,
          websiteName,
          offer:
            $(el).find(".zY3Xhe").text().trim() !== ""
              ? `Was ${$(el).find(".zY3Xhe").text().trim()}`
              : offer,
        };
      })
    );

    console.log(shelvesData);
    return shelvesData;
  } catch (error) {
 
    console.error("Error:", error);
    throw new Error("Internal Server Error");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
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
module.exports = router;
