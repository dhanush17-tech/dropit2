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
 * /latestCoupons:
 *   get:
 *     summary: Fetch the latest coupons.
 *     description: Retrieves the latest available coupons from the specified source, with caching implemented for efficiency.
 *     responses:
 *       200:
 *         description: An array of the latest coupons.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   coupon_Code:
 *                     type: string
 *                     description: The link to the coupon.
 *                   coupon_Title:
 *                     type: string
 *                     description: The title of the coupon.
 *                   coupon_Discount:
 *                     type: string
 *                     description: The discount amount or percentage offered by the coupon.
 *                   couponLink:
 *                     type: string
 *                     description: Direct link to the coupon.
 *                   img_url:
 *                     type: string
 *                     description: URL of the coupon image.
 *                   coupon_Description:
 *                     type: string
 *                     description: Description of the coupon.
 *                   expirationDate:
 *                     type: string
 *                     description: Expiration date of the coupon.
 *       500:
 *         description: Error occurred while fetching coupons.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Detailed error message.
 */

router.get("/", async (req, res) => {
  console.log("Fetching Coupons...");
  const cacheKey = "latestCoupons";
  if (!client.isOpen) {
    client.connect();
  }
  try {
    // Check cache first
    const cachedCoupons = await client.get(cacheKey);
    if (cachedCoupons) {
      console.log("Retrieved from cache");
      return res.json(JSON.parse(cachedCoupons));
    }

    // Fetch data if not in cache
    const response = await axios.get("https://www.coupons.com/");
    const $ = cheerio.load(response.data);
    const couponsList = $("._1otx6d61._1otx6d64");
    let couponPromises = [];

    couponsList.each((i, elem) => {
      $(elem)
        .children()
        .each((j, childElem) => {
          const couponPromise = (async () => {
            const coupon = $(childElem);
            const expirationDate = coupon.find("._1h7rm4ny").text().trim();
            const couponTitle = coupon.find("._1h7rm4nv").text().trim();
            const couponDiscount = coupon.find("._1h7rm4nw").text().trim();
            const couponDescription = coupon.find("._1h7rm4nx").text().trim();
            const couponImgElement = coupon.find(".zzw2814 img");
            const couponImg =
              couponImgElement.length > 0
                ? couponImgElement.attr("src").replaceAll("96x", "600x")
                : "";

            let couponLink = "";
            if (couponTitle !== "") {
              couponLink = await getFirstGoogleSearchLink(couponTitle);
            }

            return {
              coupon_Code: couponLink,
              coupon_Title: couponTitle,
              coupon_Discount: couponDiscount,
              couponLink,
              img_url: couponImg,
              coupon_Description: couponDescription,
              expirationDate: expirationDate,
            };
          })();

          couponPromises.push(couponPromise);
        });
    });

    const coupons = await Promise.all(couponPromises);
    const filteredCoupons = coupons.filter(
      (coupon) => coupon.coupon_Title !== ""
    );

    // Cache the result
    await client.setEx(cacheKey, 3600, JSON.stringify(filteredCoupons));
    res.json(filteredCoupons);
  } catch (error) {
  
    console.error("Error fetching coupons: ", error);
    res.status(500).send("Error fetching coupons");
  }
});

async function getFirstGoogleSearchLink(query) {
  try {
    // Replace spaces in the query with '+'
    const formattedQuery = query.split(" ").join("+");

    // Make a request to Google Search
    const response = await axios.get(
      `https://www.google.com/search?q=${formattedQuery}`,
      { "User-Agent": "Mozilla/5.0 ..." }
    );

    // Load the HTML content into Cheerio
    const $ = cheerio.load(response.data);

    // Find the first search result link
    const firstLink = $('a[href^="/url?q="]').first().attr("href");

    // Google search results contain additional parameters in the URL, so we need to clean it
    const cleanLink = firstLink.split("&")[0].replace("/url?q=", "");

    return decodeURIComponent(cleanLink);
  } catch (error) {
 
    console.error("Error fetching Google search results:", error);
    return null;
  }
}
module.exports = router;
