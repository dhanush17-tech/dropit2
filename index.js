// const express = require("express");
// const app = express();
// const cheerio = require("cheerio");
// const axios = require("axios");
// const puppeteer = require("puppeteer-extra");
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// const bodyParser = require("body-parser");
// const cors = require("cors");
// const cron = require("node-cron");
// const admin = require("firebase-admin");
// require("dotenv").config();
// const { executablePath } = require("puppeteer");
// const serviceAccount = require("./price-tracker-4cc9b-firebase-adminsdk-8j9qc-d733aeb855.json");
// const {chromium}=require("playwright")
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });
// const db = admin.firestore();

// app.use(express.json());
// app.use(express.urlencoded({ extended: false }));

// // Start the server
// const port = process.env.PORT;
// app.listen(process.env.PORT || 5000)

// // Define your routes
// const router = express.Router();
// app.use(router);

// let browserPromise;

// (async () => {
//   browserPromise = puppeteer.launch({

// headless:true
//   });
// })();

// // Get campaign data from Firestore
// async function getCampaigns() {
//   try {
//     const snapshot = await db.collection("campaigns").get();
//     const campaigns = [];
//     snapshot.forEach((doc) => {
//       campaigns.push(doc.data());
//     });
//     return campaigns;
//   } catch (error) {
//     throw new Error("Failed to get campaigns: " + error);
//   }
// }

// // Add a document to Firestore
// async function addDocument(collection, data) {
//   try {
//     const docRef = await db.collection(collection).add(data);
//     console.log("Document written with ID: ", docRef.id);
//   } catch (error) {
//     throw new Error("Error adding document: " + error);
//   }
// }
// async function scrapeProductPage(html, items) {
//   const $ = cheerio.load(html);
//   const prices = $(".pd-price");
//   const titles = $(".pd-title a span");
//   const imgs = $(".pd-img img");
//   const offers = $(".pd-off ");
//   const buyLinks = $(".pd-title a");
//   const websiteLogos = $(".pd-str-logo img");
//   const offerstext = $(".pd-off");
//   for (let i = 0; i < prices.length; i++) {
//     const title = $(titles[i]).text();
//     const img = $(imgs[i]).attr("src");
//     const offer = $(offers[i]).text();
//     const buyLink = $(buyLinks[i]).attr("href");
//     const websiteLogo = $(websiteLogos[i]).attr("src");
//     $(offerstext[i]).remove();
//     const price = $(prices[i]).text().trim().replace("₹", "");

//     items.push({
//       price,
//       title,
//       offer,
//       img,
//       buyLink,
//       websiteLogo,
//       description: "",
//     });
//   }
// }
// async function getImage(buyLink) {
//   try {
//     const response = await axios.get(`https://www.pricebefore.com${buyLink}`);
//     const html = response.data;
//     const $ = cheerio.load(html);
//     const src = $(".zoomImg").attr("src") || "";
//     return src;
//   } catch (error) {
//     console.error("Error:", error);
//     return "";
//   }
// }

// // Send a notification
// async function sendNotification() {
//   try {
//     const campaigns = await getCampaigns();
//     console.log("Sending notification:", campaigns);
//     for (const campaign of campaigns) {
//       const topic = campaign;
//       console.log("Processing campaign:", topic);

//       // Perform actions for each campaign
//       // For example, send a message to the devices subscribed to the campaign
//       const browser = await browserPromise;
//       const page = await browser.newPage();
//       await page.goto("https://pricee.com/");
//       await page.type('input[name="q"]', topic.title);
//       await page.keyboard.press("Enter");

//       await page.waitForSelector(".pd-img img", { timeout: 5000 });
//       const html = await page.content();
//       const $ = cheerio.load(html);
//       const prices = $(".pd-price");
//       const titles = $(".pd-title a span");
//       const offers = $(".pd-ref a");
//       const buyLinks = $(".pd-title a");
//       const websiteLogos = $(".pd-str-logo img");
//       const offerstext = $(".pd-off");
//       const imgs = $(".pd-img img");

//       const title = $(titles[0]).text();
//       const offer = $(offers[0]).text();
//       const buyLink = $(buyLinks[0]).attr("href");
//       const websiteLogo = $(websiteLogos[0]).attr("src");
//       $(offerstext[0]).remove();
//       const price = $(prices[0]).text().trim().replace("₹", "");
//       const img = $(imgs[0]).attr("src");

//       console.log(price);
//       console.log(img);
//       console.log(parseInt(price.replace(",", "").trim()));
//       console.log(parseInt(topic.price.replace(",", "").trim()));
//       if (
//         parseInt(price.replace(",", "").trim()) <
//         parseInt(topic.price.replace(",", "").trim())
//       ) {
//         console.log("sending message");
//         //sendNotification
//         // Define the notification payload
//         let messagetitle = "";
//         for (const i in topic.title) {
//           if (i != "" || i != "/") {
//             messagetitle += i;
//           }
//         }
//         // Send the notification to the device(s)

//         try {
//           const message = {
//             topic: messagetitle,
//             notification: {
//               title: `The sale for ${topic.title} is on 🎉`,
//               imageUrl: img,
//               body: "Check it out right now !",
//             },
//             data: {
//               price: price.replace("₹", ""),
//               title: title,
//               offer: offer,
//               img: img,
//               buyLink: buyLink,
//               websiteLogo: websiteLogo,
//               description: "",
//             },
//           };
//           const response = await admin.messaging().send(message);
//           console.log("Message sent:", response);
//         } catch (error) {
//           const message = {
//             topic: messagetitle,
//             notification: {
//               title: `The sale for ${topic.title} is on 🎉`,
//               body: "Check it out right now !",
//             },
//             data: {
//               price: price.replace("₹", ""),
//               title: title,
//               offer: offer,
//               img: img,
//               buyLink: buyLink,
//               websiteLogo: websiteLogo,
//               description: "",
//             },
//           };
//           const response = await admin.messaging().send(message);
//           console.log("Message sent:", response);
//         }
//         const querySnapshot = await db
//           .collection("campaigns")
//           .where("title", "==", topic.title)
//           .get();
//         querySnapshot.docs.forEach((docs) => {
//           docs.ref.update({
//             title: topic.title,
//             price: price.replace(",", "").trim(),
//           });
//         });
//       } else {
//         console.log("not sending");
//       }
//     }
//   } catch (error) {
//     console.error("Error sending notification:", error);
//   }
// }

// // Route to add items to the cart
// router.post("/addCart", async (req, res) => {
//   try {
//     const data = req.body;
//     for (const item of data) {
//       await addDocument("campaigns", {
//         title: item.title,
//         price: item.price.replace(",", ""),
//       });
//     }
//     res.status(200).json({ message: "Items added to cart successfully" });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to add items to cart" });
//   }
// });

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

// // Route to search for an item
// router.get("/searchItem", async (req, res) => {
//   console.log("Started...");
//   const { itemName } = req.body;
//   const items = [];

//   try {
//     const browser = await browserPromise;
//     const page = await browser.newPage();
//     await page.goto("https://pricee.com/");
//     await page.type('input[name="q"]', itemName);
//     await page.keyboard.press("Enter");

//     await page.waitForSelector(".pd-img img", { timeout: 5000 });
//     const html = await page.content();
//     await scrapeProductPage(html, items);
//     console.log(items);
//     res.json(items);
//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// router.post("/latestDeals", async (req, res) => {
//   console.log("Started....");

//   try {
//     const response = await axios.get(
//       `https://www.pricebefore.com/price-drops/?category=${req.body.dealType}&direction=desc&sort=price`
//     );

//     const $ = cheerio.load(response.data);
//     const prices = $(".final");
//     const titles = $(".col-right .link");
//     const imgs = $(".col-left img");
//     const buyLinks = $(".btn-wrap a");
//     const offers = $(".percent");

//     const fetchItemData = async (index, ele) => {
//       const price = $(ele).text().replace("*", "").replace("₹", "").trim();
//       const title = $(titles[index]).text() || "";
//       const buyLinkElement = buyLinks[index];
//       const buyLink = buyLinkElement ? $(buyLinkElement).attr("href") : "";
//       const offerElement = offers[index];
//       const offer = offerElement ? $(offerElement).text() : "";
//       const img = $(imgs[index]).attr("data-src") || (await getImage(buyLink));

//       return {
//         price,
//         title,
//         img,
//         offer,
//         buyLink: `https://pricebefore.com${buyLink}`,
//         description: "",
//         websiteLogo: "",
//       };
//     };

//     const promises = prices.map(fetchItemData).get();

//     const items = await Promise.all(promises);

//     console.log(items.filter((item) => item.img !== ""));
//     res.json(items.filter((item) => item.img !== ""));
//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// // Route to get latest deals
// router.get("/latestDeals", async (req, res) => {
//   console.log("Started....");

//   try {
//     const response = await axios.get(
//       `https://www.pricebefore.com/price-drops/?category=${req.body.dealType}&direction=desc&sort=price`
//     );

//     const $ = cheerio.load(response.data);
//     const prices = $(".final");
//     const titles = $(".col-right .link");
//     const imgs = $(".col-left img");
//     const buyLinks = $(".btn-wrap a");
//     const offers = $(".percent");

//     const fetchItemData = async (index, ele) => {
//       const price = $(ele).text().replace("*", "").replace("₹", "").trim();
//       const title = $(titles[index]).text() || "";
//       const buyLinkElement = buyLinks[index];
//       const buyLink = buyLinkElement ? $(buyLinkElement).attr("href") : "";
//       const offerElement = offers[index];
//       const offer = offerElement ? $(offerElement).text() : "";
//       const img = $(imgs[index]).attr("data-src") || (await getImage(buyLink));

//       return {
//         price,
//         title,
//         img,
//         offer,
//         buyLink: `https://pricebefore.com${buyLink}`,
//         description: "",
//         websiteLogo: "",
//       };
//     };

//     const promises = prices.map(fetchItemData).get();

//     const items = await Promise.all(promises);

//     console.log(items.filter((item) => item.img !== ""));
//     res.json(items.filter((item) => item.img !== ""));
//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// async function scrapeProductTitle(upcCode, count) {
//   const response = await axios.get(
//     `https://www.digit-eyes.com/gtin/v2_0/?upcCode=${upcCode}&field_names=all&language=en&router_key=/+HhNVZVWs5z&signature=9LuONEZ1dsEZz0fA4bgMZG+bYVk=`
//   );
//   return response.data["description"]
//     .split(" ")
//     .slice(0, count ?? title.split(" ").length)
//     .join(" ");
// }

// // Route to scan a barcode
// router.get("/barcodeScan", async (req, res) => {
//   const upcCode = req.body.barcodeId;
//   console.log("This is code " + upcCode);
//   const items = [];

//   try {
//     const productTitle = await scrapeProductTitle(upcCode, 3);
//     console.log(productTitle);
//     const browser = await browserPromise;

//     const page = await browser.newPage();
//     await page.goto("https://pricee.com/");
//     await page.type('input[name="q"]', productTitle);
//     await page.keyboard.press("Enter");

//     await page.waitForSelector(".pd-img img", { timeout: 5000 });
//     const html = await page.content();
//     const $ = cheerio.load(html);
//     const prices = $(".pd-price");
//     const titles = $(".pd-title a span");
//     const imgs = $(".pd-img img");
//     const offers = $(".pd-ref a");
//     const buyLinks = $(".pd-title a");
//     const offerstext = $(".pd-off");

//     const websiteLogos = $(".pd-str-logo img");
//     for (let i = 0; i < prices.length; i++) {
//       const title = $(titles[i]).text();
//       const img = $(imgs[i]).attr("src");
//       const offer = $(offers[i]).text();
//       const buyLink = $(buyLinks[i]).attr("href");
//       const websiteLogo = $(websiteLogos[i]).attr("src");
//       $(offerstext[i]).remove();
//       const price = $(prices[i]).text().trim().replace("₹", "");
//       items.push({
//         price,
//         title,
//         offer,
//         img,
//         buyLink,
//         websiteLogo,
//         description: "",
//       });
//     }

//     console.log(items);
//     res.json(items);
//   } catch (error) {
//     console.error("Error:", error);
//     res.status(500).json({ error: "An error occurred" });
//   }
// });
// router.post("/getInfo", async (req, res) => {
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
// cron.schedule("0 9,14,18 * * *", async () => {
//   // Call your function
//   await sendNotification();
// });
// // Add the router middleware to the app
const express = require("express");
const app = express();
const routes = require("./routes");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Use the router
app.use("/", routes); 

// Start the server
app.listen(process.env.PORT || 3000);
