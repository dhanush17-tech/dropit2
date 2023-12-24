const express = require("express");
const app = express();
const notification = require("./routes/routes");
const googleSearch = require("./routes/searchItem");
const productDetails = require("./routes/productDetails");
const barcodeScan = require("./routes/barcodeScan");
const latestDeals = require("./routes/latestDeals");
const latestCoupons = require("./routes/latestCoupons");

const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

require("dotenv").config();
// Swagger definition

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Price Tracker API",
    version: "1.0.0",
    description: "API for tracking price changes and deals",
  },
  servers: [
    {
      url: "http://dropit2-production.up.railway.app",
      description: "Production server",
    },
  ],
};

// Options for the swagger docsœ
const swaggerOptions = {
  swaggerDefinition,
  // Paths to files containing OpenAPI definitions
  apis: ["./routes/*.js"],
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/googleSearch", googleSearch);
app.use("/productDetails", productDetails);
app.use("/barcodeScan", barcodeScan);
app.use("/latestDeals", latestDeals);
app.use("/latestCoupons", latestCoupons);
app.use("/", notification);

// Use the router
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Start the server
app.listen(process.env.PORT || 5000);
