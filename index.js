const express = require("express");
const app = express();
const notification = require("./routes/routes");
const googleSearch = require("./routes/searchItem");
const productDetails = require("./routes/productDetails");
const barcodeScan = require("./routes/barcodeScan");
const latestDeals = require("./routes/latestDeals");
const latestCoupons = require("./routes/latestCoupons");
const healthcheck = require("./routes/healthcheck");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

require("dotenv").config();
// Swagger definition
const corsOptions = {
  origin: "*", // Replace with the domain where your Swagger UI is hosted
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Shopwise API",
    version: "1.0.0",
    description: "API for tracking price changes and deals",
  },
  servers: [
    {
      url: "",
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
app.use("/healthcheck", healthcheck);
app.use("/", notification);

// Use the router
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Start the server
app.listen(process.env.PORT || 5000);
