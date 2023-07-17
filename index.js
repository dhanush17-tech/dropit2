 
const express = require("express");
const app = express();
const routes = require("./routes");

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Use the router
app.use("/", routes); 

// Start the server
app.listen(process.env.PORT || 3000);
