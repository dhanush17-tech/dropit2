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

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

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
        browser = await puppeteer.launch({
       executablePath: "/usr/bin/chromium-browser",

          args: ["--no-sandbox", "--disable-setuid-sandbox"],
          headless: true,
        });
        const page = await browser.newPage();
        await page.goto(
          `https://www.google.com/search?q=${topic.title}&tbm=shop&gl=${topic.region}&tbs=mr:1,sales:1&hl=en`
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
                region: topic.region,
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

cron.schedule("0 9,14,18 * * *", () => {
  // Call your function
  sendNotification();
});
// sendNotification();

module.exports = router;
