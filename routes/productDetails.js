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
 * /productDetails:
 *   get:
 *     summary: Retrieve product details including description and rating
 *     description: Fetches product details based on the provided title from Google search results.
 *     parameters:
 *       - in: query
 *         name: title
 *         required: true
 *         description: The title of the product to get details for.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: An object containing the product's description and rating.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 description:
 *                   type: string
 *                   description: The description of the product.
 *                 rating:
 *                   type: string
 *                   description: The rating of the product.
 *       500:
 *         description: Error message for an internal server error or fetching error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: A message detailing the error encountered.
 */

router.get("/", async (req, res) => {
  const { title } = req.query;
  const cacheKey = `productDetails_${title}`;

  if (!client.isOpen) {
    await client.connect();
  }

  try {
    // Check cache first
    const cachedDetails = await client.get(cacheKey);
    if (cachedDetails) {
      console.log("Retrieved from cache");
      return res.json(JSON.parse(cachedDetails));
    }

    // Fetch data if not in cache
    const browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium-browser",

      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      headless: true,
    });
    const page = await browser.newPage();

    const firstFourWords = title.split(" ").slice(0, 4).join(" ");
    await page.goto(
      `https://www.google.com/search?q=product description ${firstFourWords}`
    );
    const descriptionSelector = ".LGOjhe .ILfuVd";
    const descriptionExists = (await page.$(descriptionSelector)) !== null;
    const description = descriptionExists
      ? await page.evaluate(
          (sel) => document.querySelector(sel).innerText.trim(),
          descriptionSelector
        )
      : "";

    await page.goto(
      `https://www.google.com/search?q=product rating ${firstFourWords}`
    );
    const ratingSelector = "span.z3HNkc";
    const ratingExists = (await page.$(ratingSelector)) !== null;
    const ratingText = ratingExists
      ? await page.evaluate(
          (sel) => document.querySelector(sel).getAttribute("aria-label"),
          ratingSelector
        )
      : "";
    const rating = ratingText
      ? ratingText.replace("Rated ", "").split(" ")[0]
      : "";

    // Cache the result
    const details = { description, rating };
    await client.setEx(cacheKey, 3600, JSON.stringify(details));
    res.json(details);
  } catch (error) {
 
    console.error("Error fetching product details:", error);
    res.status(500).send("Error fetching product details");
  } finally {
  }
});
module.exports = router;
