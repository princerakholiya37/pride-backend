const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const authRoute = require("./route/auth");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoute);

app.get("/", (req, res) => {
  res.send("Server running...");
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});