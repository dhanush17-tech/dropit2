 
const express = require("express");
const app = express();
const routes = require("./routes");
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');


// Swagger definition

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Price Tracker API',
    version: '1.0.0',
    description: 'API for tracking price changes and deals',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Local server',
    },
  ],
};

// Options for the swagger docs
const swaggerOptions = {
  swaggerDefinition,
  // Paths to files containing OpenAPI definitions
  apis: ['./routes.js'],
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJsdoc(swaggerOptions);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Use the router
app.use("/", routes); 
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));


// Start the server
app.listen(process.env.PORT || 3000);
