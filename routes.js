// routes.js
const express = require("express");
const unirest = require("unirest");

const router = express.Router();
const puppeteer = require("puppeteer");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const bodyParser = require("body-parser");
const cron = require("node-cron");
const serviceAccount = require("./price-tracker-4cc9b-firebase-adminsdk-8j9qc-d733aeb855.json");
const { chromium } = require("playwright");
const NodeCache = require("node-cache");
const { DateTime } = require("luxon");
const cache = new NodeCache();
const Redis = require("redis");

const client = Redis.createClient({
  password: "w9FMHjTYYgzqLkamivU4bWId9INfumDl",
  socket: {
    host: "redis-19228.c281.us-east-1-2.ec2.cloud.redislabs.com",
    port: 19228,
  },
});
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

(async () => {
  browserPromise = chromium.launch({
    ignoreDefaultArgs: ["--disable-extensions"],
  });
})();

// Get campaign data from Firestore
async function getCampaigns() {
  try {
    const snapshot = await db.collection("campaigns").get();
    const campaigns = [];
    snapshot.forEach((doc) => {
      campaigns.push(doc.data());
    });
    return campaigns;
  } catch (error) {
    throw new Error("Failed to get campaigns: " + error);
  }
}

// Add a document to Firestore
async function addDocument(collection, data) {
  try {
    const docRef = await db.collection(collection).add(data);
    console.log("Document written with ID: ", docRef.id);
  } catch (error) {
    throw new Error("Error adding document: " + error);
  }
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

async function scrapeProductPage(html, items) {
  const $ = cheerio.load(html);
  const prices = $(".pd-price");
  const titles = $(".pd-title a span");
  const imgs = $(".pd-img img");
  const offers = $(".pd-off ");
  const buyLinks = $(".pd-title a");
  const websiteLogos = $(".pd-str-logo img");
  const offerstext = $(".pd-off");
  for (let i = 0; i < prices.length; i++) {
    const title = $(titles[i]).text();
    const img = $(imgs[i]).attr("src");
    const offer = $(offers[i]).text();
    const buyLink = $(buyLinks[i]).attr("href");
    const websiteLogo = $(websiteLogos[i]).attr("src");
    $(offerstext[i]).remove();
    const price = $(prices[i]).text().trim().replace("₹", "");

    items.push({
      price,
      title,
      offer,
      img,
      buyLink,
      websiteLogo,
      description: "",
    });
  }
}
async function getImage(buyLink) {
  try {
    const response = await axios.get(`https://www.pricebefore.com${buyLink}`);
    const html = response.data;
    const $ = cheerio.load(html);
    const src = $(".zoomImg").attr("src") || "";
    return src;
  } catch (error) {
    console.error("Error:", error);
    return "";
  }
}

router.get("/searchItem", async (req, res) => {
  console.log("Started...");
  const { itemName } = req.body;

  try {
    const options = {
      method: "POST",
      url: "https://dripcrawler.p.rapidapi.com/",
      headers: {
        "content-type": "application/json",
        "X-RapidAPI-Key": "117956f7fdmshd3ef63433d6e4f9p1cf63ajsnc54bcd05084a",
        "X-RapidAPI-Host": "dripcrawler.p.rapidapi.com",
      },
      data: {
        url: `https://pricee.com/api/v1/search.php?q=${itemName}&size=10&lang=en&page=1&vuid=0&platform=1`,
        javascript_rendering: "False",
      },
    };
    const response = await axios.request(options);

    const responseData = JSON.parse(response.data.extracted_html);
    console.log(responseData);
    const extractedData = responseData.data.map((item) => {
      const { title, url, source_logo, discount, source_mrp, image } = item;
      return {
        price: source_mrp,
        title: title,
        offer: `${discount}% off`,
        buyLink: url,
        websiteLogo: source_logo,
        img: image,
      };
    });

    console.log("Extracted Data:", extractedData);

    res.json(extractedData);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
router.get("/latestDeals", async (req, res) => {
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
    browser = await chromium.launch()
    const page = await browser.newPage();
    await page.goto(
      `https://www.google.com/search?q=${itemName}&tbm=shop&gl=${region}&tbs=mr:1,sales:1&hl=en`
    );
    await page.screenshot({ path: "path.png" });
    // await page.waitForSelector(".sh-dgr__content img", { timeout: 5000 });
    await page.screenshot({ path: "path2.png" });

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
            .attr("href")
            .replace("/url?url=", "")
            .replace("http://www.google.com", "")
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
          buyLink: productLink,
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
// FROM PRICEE.COM

// const items = [];

// const browser = await puppeteer.launch({
//   args: ["--no-sandbox", "--disable-setuid-sandbox"],
// });
// const page = await browser.newPage();
// await page.goto(`https://pricee.com/?q=${dealType}`);
// await page.screenshot();
// await page.waitForSelector(".pd-price", { timeout: 5000 });
// const html = await page.content();
// await scrapeProductPage(html, items);
// console.log(items);

// // Close the browser after fetching the data

// return items;

function checkIfDataNeedsRefresh(cacheKey) {
  // Get the cached data and its timestamp
  const cachedData = cache.get(cacheKey);
  const cachedTimestamp = cache.getTtl(cacheKey);

  // Define the refresh interval (e.g., 1 hour)
  const refreshInterval = 60 * 60 * 1000; // 1 hour in milliseconds

  // Calculate the current timestamp
  const currentTimestamp = Date.now();

  // Check if the cached data and its timestamp exist
  if (cachedData && cachedTimestamp) {
    // Calculate the elapsed time since the last data fetch
    const elapsedTime = currentTimestamp - cachedTimestamp;

    // Compare the elapsed time with the refresh interval
    if (elapsedTime > refreshInterval) {
      // Data is outdated and needs to be refreshed
      return true;
    }
  }

  // Data is up to date or not available in the cache
  return false;
}

async function getFirst4WordsFromGoogleSearch(query) {
  // try {
  //   // Launch a headless browser using Puppeteer
  //   const browser = await chromium.launch()
  //   const page = await browser.newPage();

  //   // Navigate to Google Images
  //   await page.goto(
  //     `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch`
  //   );

  //   // Wait for the page to load completely (you can adjust the wait time as needed)
  //   await page.waitForSelector(".rg_i");
  //   await page.screenshot({ path: "path2.png" });

  //   // Get the HTML content of the page
  //   const html = await page.content();

  //   // Load the HTML content into Cheerio
  //   const $ = cheerio.load(html);

  //   // Find the title of the first image result (assuming it's inside an <a> element)
  //   const firstResultTitle = $("a .rg_i").first().attr("alt");

  //   // Close the Puppeteer browser
  //   await browser.close();

  //   return firstResultTitle.slice(0, 4);
  // } catch (error) {
  //   console.error("Error scraping Google Images:", error);
  //   return null;
  // }
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36",
    };
    const response = await axios.get(`https://www.buycott.com/upc/${query}`, {
      headers: headers,
    });
    const $ = cheerio.load(response.data);
    const title = $("h2").eq(0).text();
    console.log(title);
    return title;
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  }
}

router.get("/barcodeScan", async (req, res) => {
  console.log("Barcode scan started");

  const { upcCode, region } = req.query;
  getFirst4WordsFromGoogleSearch(upcCode).then(async (title) => {
    console.log(title);
    try {
      console.log(upcCode, region);
      const browser = await chromium.launch();
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

      console.log(shelvesData);
      res.json(shelvesData);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).json({ error: "An error occurred" });
    }
  });
});

async function fetchProductData(productTitle) {
  const response = await axios.get(
    `https://pricee.com/api/v1/search.php?q=${productTitle}&size=10&lang=en&vuid=0&platform=1`
  );
  const responseData = response.data;
  const items = responseData.data;

  return items.map((item) => {
    const { title, url, source_logo, discount, source_price, image } = item;
    return {
      price: source_price,
      title: title,
      offer: `${discount}% off`,
      buyLink: url,
      websiteLogo: source_logo,
      img: image,
    };
  });
}

async function scrapeProductTitle(upcCode, count) {
  const response = await axios.get(
    `https://www.digit-eyes.com/gtin/v2_0/?upcCode=${upcCode}&field_names=all&language=en&router_key=/+HhNVZVWs5z&signature=9LuONEZ1dsEZz0fA4bgMZG+bYVk=`
  );
  return response.data["description"]
    .split(" ")
    .slice(0, count ?? title.split(" ").length)
    .join(" ");
}
router.get("/googleSearch", async (req, res) => {
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
    const browser = await chromium.launch();
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
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/addCart", async (req, res) => {
  try {
    const { cartItems, fcmTokenId } = req.body;
    for (const element of cartItems) {
      let data = JSON.parse(element);
      console.log(data);
      console.log(data.title);
      try {
        const exists = await checkTopicExists(data.title);
        let messagetitle = "";
        for (const i in data.title) {
          if (i != "" || i != "/") {
            messagetitle += i;
          }
        }
        if (exists) {
          console.log(data.title + data.price);
          console.log(fcmTokenId);

          await admin.messaging().subscribeToTopic(fcmTokenId, messagetitle);
          console.log("Device subscribed to topic successfully");
        } else {
          console.log(data.title + data.price);
          addDocument("campaigns", {
            title: data.title,
            price: data.price.substring(1),
            region: data.region,
          });
          await admin.messaging().subscribeToTopic(fcmTokenId, messagetitle);
          console.log("Topic created successfully");
        }
      } catch (error) {
        console.error("Error subscribing to topic:", error);
      }
    }
  } catch (err) {
    console.log(err);
  }
});

async function addDocument(collectionName, documentData) {
  try {
    const docRef = await db.collection(collectionName).add(documentData);
    console.log("Document added with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding document:", error);
    return null;
  }
}

async function getCampaigns() {
  try {
    const topics = [];
    const doc = (await db.collection("campaigns").get()).forEach((d) => {
      console.log(d.data().title);
      topics.push({
        title: d.data().title,
        price: d.data().price,
        region: d.data().region,
      });
    });
    return topics;
  } catch (error) {
    console.error("Error fetching campaigns/topics:", error);
    return [];
  }
}
async function checkTopicExists(topic) {
  try {
    const querySnapshot = await db
      .collection("campaigns")
      .where("title", "==", topic)
      .get();

    if (querySnapshot.empty) {
      // No documents found, topic doesn't exist
      return false;
    } else {
      // At least one document found, topic exists
      console.log("Document exists");
      return true;
    }
  } catch (error) {
    console.error("Error fetching topics:", error);
    return false;
  }
}

async function sendNotification() {
  const campaigns = await getCampaigns();
  for (const campaign of campaigns) {
    const topic = campaign;
    console.log("Processing campaign:", topic);
    if (topic.region) {
      try {
        browser = await chromium.launch()
        const page = await browser.newPage();
        await page.goto(
          `https://www.google.com/search?q=${topic.title}&tbm=shop&gl=${topic.region}&tbs=mr:1,sales:1&hl=en x`
        );

        const content = await page.content();
        const $ = cheerio.load(content);

        const firstProductElements = $(".sh-dgr__content").slice(0, 1);
        const extractedData = await Promise.all(
          firstProductElements.map(async (i, el) => {
            const productName = $(el).find(".tAxDx").text().trim();
            const productLink = decodeURIComponent(
              $(el)
                .find(".shntl a")
                .attr("href")
                .replace("/url?url=", "")
                .replace("http://www.google.com", "")
            );
            const productPrice = $(el).find(".a8Pemb").text().trim();
            const img = $(el).find(".ArOc1c img").first().attr("src");
            const websiteName = extractWebsiteName(
              $(el).find(".aULzUe").text()
            );
            const websiteLogo = await getWebsiteLogo(websiteName);

            let offer =
              $(el).find(".LGq5Zc").text().trim() ||
              $(el).find(".VRpiue").text().trim() ||
              $(el).find(".zY3Xhe").text().trim() ||
              "";

            return {
              buyLink: productLink,
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

        //check if extractedData is empty
        if (extractedData.length != 0) {
          const title = extractedData[0].title || "";
          const offer = extractedData[0].offer;
          const buyLink = extractedData[0].buyLink;
          const websiteLogo = extractedData[0].websiteLogo;
          const price = extractedData[0].price.substring(1);
          const img = extractedData[0].img;
          console.log(price);
          console.log(img);
          console.log(parseInt(price.trim()));
          console.log(parseInt(topic.price.trim()));
          if (parseInt(price.trim()) < parseInt(topic.price.trim())) {
            console.log(price, title, offer, img, buyLink, websiteLogo);
            console.log("sending message");

            let messagetitle = "";
            for (const i in topic.title) {
              if (i != "" || i != "/") {
                messagetitle += i;
              }
            }

            const message = {
              topic: messagetitle,
              notification: {
                title: `The sale for ${topic.title} is on 🎉`,
                imageUrl: img,
                body: "Check it out right now !",
              },
              data: {
                price: price,
                title: title,
                offer: offer,
                img: img,
                buyLink: buyLink,
                websiteLogo: websiteLogo,
                description: "",
                region: region,
              },
            };
            const response = await admin.messaging().send(message);
            console.log("Message sent:", response);

            const querySnapshot = await db
              .collection("campaigns")
              .where("title", "==", topic.title)
              .get();
            querySnapshot.docs.forEach((docs) => {
              docs.ref.update({
                title: topic.title,
                price: price,
              });
            });
          } else {
            console.log("not sending");
          }
        }
      } catch (error) {
        console.log(error);
      }
    }
  }
}

// async function sendNotification() {
//   const campaigns = await getCampaigns();
//   for (const campaign of campaigns) {
//     const topic = campaign;
//     console.log("Processing campaign:", topic);

//        // Replace Puppeteer with Axios to fetch the page content
//        const response = await axios.get(
//          `https://www.google.com/search?q=${encodeURIComponent(
//            topic.title
//          )}&tbm=shop&gl=${topic.region}&tbs=mr:1,sales:1`,
//           { "User-Agent": "Mozilla/5.0 ..." }
//        );
//      console.log(response.data);
// console.log("Number of elements matched:", $(".sh-dgr__content").length);

//        // Rest of your scraping logic using Cheerio
//        const firstProductElements = $(".sh-dgr__content").slice(
//          0,
//          2
//        );
//        const extractedData = firstProductElements
//          .map((i, el) => {
//            const productName = $(el).find(".tAxDx").text().trim();
//            const productLink = decodeURIComponent(
//              $(el)
//                .find(".shntl a")
//                .attr("href")
//                .replace("/url?url=", "")
//                .replace("http://www.google.com", "")
//            );
//            const productPrice = $(el).find(".a8Pemb").text().trim();
//            const img = $(el).find(".ArOc1c img").first().attr("src");
//            const websiteName = extractWebsiteName($(el).find(".aULzUe").text());
//            // Note: getWebsiteLogo function needs to be compatible with Axios and Cheerio
//            const websiteLogo = ""; // Placeholder, implement getWebsiteLogo logic

//            let offer =
//              $(el).find(".LGq5Zc").text().trim() ||
//              $(el).find(".VRpiue").text().trim() ||
//              $(el).find(".zY3Xhe").text().trim() ||
//              "";

//            return {
//              buyLink: productLink,
//              title: productName,
//              price: productPrice,
//              img,
//              websiteLogo,
//              websiteName,
//              offer:
//                $(el).find(".zY3Xhe").text().trim() !== ""
//                  ? `Was ${$(el).find(".zY3Xhe").text().trim()}`
//                  : offer,
//            };
//          })
//          .get(); // Convert Cheerio object to array
// console.log("This is the extaced",extractedData)
//        //check if extractedData is empty
//        if (extractedData.length !== 0) {
//          const title = extractedData[0].title || "";
//          const offer = extractedData[0].offer;
//          const buyLink = extractedData[0].buyLink;
//          const websiteLogo = extractedData[0].websiteLogo;
//          const price = extractedData[0].price.substring(1);
//          const img = extractedData[0].img;
//          console.log(price);
//          console.log(img);
//          console.log(parseInt(price.trim()));
//          console.log(parseInt(topic.price.trim()));
//          if (parseInt(price.trim()) < parseInt(topic.price.trim())) {
//            console.log("sending message");
//            //sendNotification
//            // Define the notification payload
//            let messagetitle = "";
//            for (const i in topic.title) {
//              if (i != "" || i != "/") {
//                messagetitle += i;
//              }
//            }
//            // Send the notification to the device(s)

//            try {
//              const message = {
//                topic: "messagetitle",
//                notification: {
//                  title: `The sale for ${topic.title} is on 🎉`,
//                  imageUrl: img,
//                  body: "Check it out right now !",
//                },
//                data: {
//                  price: price,
//                  title: title,
//                  offer: offer,
//                  img: img,
//                  buyLink: buyLink,
//                  websiteLogo: websiteLogo,
//                  description: "",
//                },
//              };
//              const response = await admin.messaging().send(message);
//              console.log("Message sent:", response);
//            } catch (error) {
//              try {
//                const message = {
//                  topic: messagetitle,
//                  notification: {
//                    title: `The sale for ${topic.title} is on 🎉`,
//                    body: "Check it out right now !",
//                  },
//                  data: {
//                    price: price,
//                    title: title,
//                    offer: offer,
//                    img: img,
//                    buyLink: buyLink,
//                    websiteLogo: websiteLogo,
//                    description: "",
//                  },
//                };
//                const response = await admin.messaging().send(message);
//                console.log("Message sent:", response);
//              } catch (error) {
//                console.log(error);
//              }
//            }
//            const querySnapshot = await db
//              .collection("campaigns")
//              .where("title", "==", topic.title)
//              .get();
//            querySnapshot.docs.forEach((docs) => {
//              docs.ref.update({
//                title: topic.title,
//                price: price,
//              });
//            });
//          } else {
//            console.log("not sending");
//          }
//        }

//   }
// }

router.post("/unsubscribeFromTopic", async (req, res) => {
  try {
    const { token, topic } = req.body;
    let messagetitle = "";
    for (const i in topic) {
      if (i != "" || i != "/") {
        messagetitle += i;
      }
    }
    admin
      .messaging()
      .unsubscribeFromTopic(token, messagetitle)
      .then(() => {
        console.log("Unsubscribed from Topic Sucessfully");
      });

    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});

router.get("/getStores", async (req, res) => {
  console.log("Started...");
  try {
    const response = await axios.get(
      "https://flipshope.com/api/stores/trendstores"
    );
    const responseData = response.data;
    const items = responseData.data; // Assuming the array of items is stored in the "data" property of the response

    const extractedData = items.map((data) => ({
      img_url: data.img_url,
      url: data.url,
      store_url: data.store_url,
      store_id: data.store_id,
      store_page_url: data.store_page_url,
      store_name: data.store_name,
    }));

    res.json(extractedData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
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
router.get("/latestCoupons", async (req, res) => {
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

router.get("/productDetails", async (req, res) => {
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
    const browser = await chromium.launch()
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

cron.schedule("0 9,14,18 * * *", () => {
  // Call your function
  sendNotification();
});
sendNotification();

module.exports = router;
