// routes.js
const express = require("express");
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
const cache = new NodeCache();

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

let browserPromise;

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

// // Route to scrape product title from a website
// router.get("/getInfo", async (req, res) => {
//   try {
//     const { title, buyLink } = req.body;

//     const [imageResponse, shoppingResponse] = await Promise.all([
//       axios.get(`https://www.google.com/search?q=${title}&tbm=isch`),
//       axios.get(`https://shopping.google.com/search?q=${title}`),
//     ]);

//     const $ = cheerio.load(imageResponse.data);
//     const imageUrls = [];
//     $("img").each((index, element) => {
//       if (index < 4) {
//         // Limit to the first 3 images
//         const imageUrl = $(element).attr("src");
//         imageUrls.push(imageUrl);
//       }
//     });

//     const $1 = cheerio.load(shoppingResponse.data);
//     const rating = $1(".pyOKtc").first().text();
//     const url = $1(".xUCO8b").first().attr("href");

//     const [productResponse, buyLinkResponse] = await Promise.all([
//       axios.get(url),
//       buyLink.includes("pricebefore.com")
//         ? axios.get(buyLink)
//         : Promise.resolve({ data: "" }),
//     ]);

//     const $2 = cheerio.load(productResponse.data);
//     const description = $2(".VOVcm").text();

//     const p = cheerio.load(buyLinkResponse.data);
//     const updatedBuyLink = buyLink.includes("pricebefore.com")
//       ? p(".buy-button a").attr("href") || ""
//       : buyLink;

//     res.json({
//       description: description,
//       ratings: rating,
//       images: imageUrls.slice(1, imageUrls.length),
//       buyLink: updatedBuyLink,
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: "An error occurred" });
//   }
// });

// Route to search for an item
router.get("/searchItem", async (req, res) => {
  console.log("Started...");
  const { itemName } = req.body;
  // const items = [];

  try {
    // const browser = await chromium.launch();
    // const page = await browser.newPage();
    // await page.goto("https://pricee.com/", { timeout: 0 });
    // await page.waitForSelector("input[name='q']");
    // await page.type('input[name="q"]', itemName);
    // await page.keyboard.press("Enter");

    // await page.waitForSelector(".pd-img img", { timeout: 5000 });
    // const html = await page.content();
    // await scrapeProductPage(html, items);
    // console.log(items);
    const response = await axios.get(
      `https://pricee.com/api/v1/search.php?q=${itemName}&size=10&lang=en&vuid=0&platform=1`
    );
    const responseData = response.data;

    const items = responseData.data; // Assuming the array of items is stored in the "data" property of the response
    const extractedData = items.map((item) => {
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

    console.log("Extracted Data:", extractedData);
    // // Store the data in a list or array
    // const dataList = data.data.map((item) => ({
    //   price: item.source_price,
    //   title: item.title,
    //   offer: `${item.discount}% off`,
    //   buyLink: item.url,
    //   websiteLogo: item.source_logo,
    // })); // Assuming the API response has a property called 'value'

    // console.log("Data fetched:", dataList);
    res.json(extractedData);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/latestDeals", async (req, res) => {
  console.log("Started....");
  const cacheKey = `latestDeals_${req.body.dealType}`;

  // Check if the data is available in the cache
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    console.log("Retrieved from cache");
    res.json(cachedData);

    // Check if the data needs to be refreshed
    const shouldRefreshData = checkIfDataNeedsRefresh(cacheKey); // Implement your logic to determine if data needs to be refreshed

    if (shouldRefreshData) {
      console.log("Refreshing cache...");
      try {
        // Fetch the updated data
        const updatedData = await fetchData(req.body.dealType);

        // Update the cache with the new data
        cache.set(cacheKey, updatedData);
        console.log("Cache updated with new data");
      } catch (error) {
        console.error("Error while fetching updated data:", error);
      }
    }

    return;
  }

  try {
    // Fetch the initial data
    const initialData = await fetchData(req.body.dealType);

    // Store the data in the cache
    cache.set(cacheKey, initialData);
    console.log("Data stored in cache");

    res.json(initialData);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function fetchData(dealType) {
  //FROM PRICEE.COM

  // const items = [];

  // const browser = await puppeteer.launch();
  // const page = await browser.newPage();
  // await page.goto(`https://pricee.com/?q=${dealType}`);
  // await page.screenshot();
  // await page.waitForSelector(".pd-price", { timeout: 5000 });
  // const html = await page.content();
  // await scrapeProductPage(html, items);
  // console.log(items);

  // // Close the browser after fetching the data

  // return items;

  //FROM PRICEBEFORE.COM

  try {
    const response = await axios.get(
      `https://www.pricebefore.com/price-drops/?category=${dealType}&direction=desc&sort=price`
    );

    const $ = cheerio.load(response.data);
    const prices = $(".final");
    const titles = $(".col-right .link");
    const imgs = $(".col-left img");
    const buyLinks = $(".btn-wrap a");
    const offers = $(".percent");

    const fetchItemData = async (index, ele) => {
      const price = $(ele).text().replace("*", "").replace("₹", "").trim();
      const title = $(titles[index]).text() || "";
      const buyLinkElement = buyLinks[index];
      const buyLink = buyLinkElement ? $(buyLinkElement).attr("href") : "";
      const offerElement = offers[index];
      const offer = offerElement ? $(offerElement).text() : "";
      const img = $(imgs[index]).attr("data-src") || (await getImage(buyLink));

      return {
        price,
        title,
        img,
        offer,
        buyLink: `https://pricebefore.com${buyLink}`,
        description: "",
        websiteLogo: "",
      };
    };

    const promises = prices.map(fetchItemData).get();

    const items = await Promise.all(promises);
    console.log(items.filter((item) => item.img !== ""));
    return items.filter((item) => item.img !== "");
  } catch (error) {
    console.error("Error:", error);
  }
}
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
router.get("/barcodeScan", async (req, res) => {
  console.log("Barcpde scan started")
  const browser = await chromium.launch();

  const upcCode = req.body.barcodeId;
  console.log("This is code " + upcCode);
  const items = [];

  try {
    const productTitle = await scrapeProductTitle(upcCode, 3);
    console.log(productTitle);    const response = await axios.get(
      `https://pricee.com/api/v1/search.php?q=${productTitle}&size=10&lang=en&vuid=0&platform=1`
    );
    const responseData = response.data;

    const items = responseData.data; // Assuming the array of items is stored in the "data" property of the response
    const extractedData = items.map((item) => {
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

    // const page = await browser.newPage();
    // await page.goto("https://pricee.com/", { timeout: 0 });
    // await page.type('input[name="q"]', productTitle);
    // await page.keyboard.press("Enter");

    // await page.waitForSelector(".pd-price", { timeout: 5000 });

    // const prices = await page.$$eval(".pd-price", (elements) =>
    //   elements.map((el) => el.textContent.trim().replace("₹", ""))
    // );
    // const titles = await page.$$eval(".pd-title a span", (elements) =>
    //   elements.map((el) => el.textContent)
    // );
    // const imgs = await page.$$eval(".pd-img img", (elements) =>
    //   elements.map((el) => el.getAttribute("src"))
    // );
    // const offers = await page.$$eval(".pd-ref a", (elements) =>
    //   elements.map((el) => el.textContent)
    // );
    // const buyLinks = await page.$$eval(".pd-title a", (elements) =>
    //   elements.map((el) => el.getAttribute("href"))
    // );
    // const websiteLogos = await page.$$eval(".pd-str-logo img", (elements) =>
    //   elements.map((el) => el.getAttribute("src"))
    // );

    // const offerstext = await page.$$(".pd-off");

    // for (let i = 0; i < prices.length; i++) {
    //   const title = titles[i];
    //   const img = imgs[i];
    //   const offer = offers[i];
    //   const buyLink = buyLinks[i];
    //   const websiteLogo = websiteLogos[i];
    //   if (offerstext[i]) {
    //     await page.evaluate((element) => element.remove(), offerstext[i]);
    //   }
    //   const price = prices[i];
    //   items.push({
    //     price,
    //     title,
    //     offer,
    //     img,
    //     buyLink,
    //     websiteLogo,
    //     description: "",
    //   });
    // }

    console.log(extractedData);
    res.json(extractedData);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "An error occurred" });
  }
});

async function scrapeProductTitle(upcCode, count) {
  const response = await axios.get(
    `https://www.digit-eyes.com/gtin/v2_0/?upcCode=${upcCode}&field_names=all&language=en&router_key=/+HhNVZVWs5z&signature=9LuONEZ1dsEZz0fA4bgMZG+bYVk=`
  );
  return response.data["description"]
    .split(" ")
    .slice(0, count ?? title.split(" ").length)
    .join(" ");
}

const config = {
  headers: {
    // Set the user agent header
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
    // Set other headers as needed
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9",
  },
};
router.get("/getInfo", async (req, res) => {
  try {
    const { title, buyLink } = req.body;

    // Make the request to Amazon search page using Axios
    const searchUrl = `https://www.amazon.in/s?k=${title}&crid=232C26IU722R5&sprefix=m%2Caps%2C295&ref=nb_sb_noss_2`;
    const searchResponse = await axios.get(searchUrl, config);
    const $ = cheerio.load(searchResponse.data);

    const shelves = [];
    const productElements = $(".s-result-item").slice(2, 3); // Slice the product elements if you want to extract multiple products
    productElements.each((i, productElement) => {
      const shelf = $(productElement);

      const images = [];
      const imageElements = shelf.find("img.s-image");
      imageElements.each((j, imageElement) => {
        const image = $(imageElement).attr("src") || "";
        images.push(image);
      });
      console.log(images);
      const totalReviewsElement = shelf.find(
        "div.a-section.a-spacing-none.a-spacing-top-micro > div.a-row.a-size-small > span:last-child"
      );
      const totalReviews = totalReviewsElement.attr("aria-label") || "";

      const starsElement = shelf.find(
        "div.a-section.a-spacing-none.a-spacing-top-micro > div > span"
      );
      const stars = starsElement.attr("aria-label") || "";

      const productTitleElement = shelf.find(
        "span.a-size-base-plus.a-color-base.a-text-normal"
      );
      const productTitle = productTitleElement.text() || "";

      let element = {
        images,
        buyLink,
        amazonLink: "",
      };

      if (totalReviews) {
        element.totalReviews = totalReviews;
      }

      if (stars) {
        element.ratings = stars.replace("out of 5 stars", "").trim();
      }

      const link = shelf.find("a.a-link-normal.a-text-normal").attr("href");
      if (link) {
        element.amazonLink = `https://amazon.in${link}`;
      }

      shelves.push(element);
    });

    console.log(shelves);
    res.json(shelves);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/getDescription", async (req, res) => {
  const { amazonLink } = req.body; // Use req.query instead of req.body to retrieve the query parameter

  console.log(amazonLink);
  console.log("Fetching Description...");

  try {
    const descriptionResponse = await axios.get(amazonLink, config);
    const $$ = cheerio.load(descriptionResponse.data);
    const description = $$("#feature-bullets")
      .text()
      .replace("About this item", "")
      .replace("Show More", "")
      .replace(/\s\s+/g, " ")
      .trim();
    console.log("This is description", description);

    // const images = [];
    // const imageElements = $$(".imgTagWrapper"); // Use $$ instead of $ for consistency
    // imageElements.each((j, imageElement) => {
    //   const image = $$(imageElement).find("img").attr("src") || "";
    //   images.push(image);
    // });
    // console.log(images);

    res.json({
      description: description,

      //images: images
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
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
            price: data.price.replace(",", ""),
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
      topics.push({ title: d.data().title, price: d.data().price });
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

    // Perform actions for each campaign
    // For example, send a message to the devices subscribed to the campaign
    const browser = await browserPromise;
    const page = await browser.newPage();
    await page.goto("https://pricee.com/");
    await page.type('input[name="q"]', topic.title);
    await page.keyboard.press("Enter");

    await page.waitForSelector(".pd-img img", { timeout: 5000 });
    const html = await page.content();
    const $ = cheerio.load(html);
    const prices = $(".pd-price");
    const titles = $(".pd-title a span");
    const offers = $(".pd-ref a");
    const buyLinks = $(".pd-title a");
    const websiteLogos = $(".pd-str-logo img");
    const offerstext = $(".pd-off");
    const imgs = $(".pd-img img");

    const title = $(titles[0]).text();
    const offer = $(offers[0]).text();
    const buyLink = $(buyLinks[0]).attr("href");
    const websiteLogo = $(websiteLogos[0]).attr("src");
    $(offerstext[0]).remove();
    const price = $(prices[0]).text().trim().replace("₹", "");
    const img = $(imgs[0]).attr("src");

    console.log(price);
    console.log(img);
    console.log(parseInt(price.replace(",", "").trim()));
    console.log(parseInt(topic.price.replace(",", "").trim()));
    if (
      parseInt(price.replace(",", "").trim()) <
      parseInt(topic.price.replace(",", "").trim())
    ) {
      console.log("sending message");
      //sendNotification
      // Define the notification payload
      let messagetitle = "";
      for (const i in topic.title) {
        if (i != "" || i != "/") {
          messagetitle += i;
        }
      }
      // Send the notification to the device(s)

      try {
        const message = {
          topic: messagetitle,
          notification: {
            title: `The sale for ${topic.title} is on 🎉`,
            imageUrl: img,
            body: "Check it out right now !",
          },
          data: {
            price: price.replace("₹", ""),
            title: title,
            offer: offer,
            img: img,
            buyLink: buyLink,
            websiteLogo: websiteLogo,
            description: "",
          },
        };
        const response = await admin.messaging().send(message);
        console.log("Message sent:", response);
      } catch (error) {
        const message = {
          topic: messagetitle,
          notification: {
            title: `The sale for ${topic.title} is on 🎉`,
            body: "Check it out right now !",
          },
          data: {
            price: price.replace("₹", ""),
            title: title,
            offer: offer,
            img: img,
            buyLink: buyLink,
            websiteLogo: websiteLogo,
            description: "",
          },
        };
        const response = await admin.messaging().send(message);
        console.log("Message sent:", response);
      }
      const querySnapshot = await db
        .collection("campaigns")
        .where("title", "==", topic.title)
        .get();
      querySnapshot.docs.forEach((docs) => {
        docs.ref.update({
          title: topic.title,
          price: price.replace(",", "").trim(),
        });
      });
    } else {
      console.log("not sending");
    }
  }
}

router.post("/unsubscribeFromTopic", async (req, res) => {
  try {
    const { token, topic } = req.body;
    let messagetitle = "";
    for (const i in topic) {
      if (i != "" || i != "/") {
        messagetitle += i;
      }
    }
    admin.messaging().unsubscribeFromTopic(token, messagetitle);
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
  }
});
cron.schedule("0 9,14,18 * * *", () => {
  // Call your function
  sendNotification();
});
sendNotification();

module.exports = router;
