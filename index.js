const express = require("express");
const app = express();
const routes = require("./routes");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const { createProxyMiddleware } = require("http-proxy-middleware");

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
  apis: ["./routes.js"],
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJsdoc(swaggerOptions);
 
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Use the router
app.use(
  "/",
  createProxyMiddleware({
    target: "http://www.google.com",
    changeOrigin: true,
    onProxyReq: (proxyReq, req, res) => {
      // Add custom headers to bypass Google bot detection
      proxyReq.setHeader(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36"
      );
      proxyReq.setHeader("X-Forwarded-For", req.ip);
      proxyReq.setHeader("X-Real-IP", req.ip);
      proxyReq.setHeader("Accept", "*/*");
    },
  }),
  routes
);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Start the server
app.listen(3000);

// const axios = require("axios");
// const { HttpsProxyAgent } = require("https-proxy-agent");

// // Define the proxy agent for HTTPS requests
// const httpsAgent = new HttpsProxyAgent("http://51.250.13.88:80");

// // Create an axios instance with the proxy agent
// const instance = axios.create({ httpsAgent });

// const url = "http://www.coupons.com/";

// // Perform an HTTP GET request
// instance
//   .get(url)
//   .then((response) => {
//     console.log(response.data);
//   })
//   .catch((error) => {
//     console.error("Error:", error);
//   });
