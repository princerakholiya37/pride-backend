const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const authRoute = require("./route/auth");
const rideRoute = require("./route/ride");

dotenv.config();

const app = express();

app.use(cors({
  origin: "*"
}));
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoute);
app.use("/api/auth", rideRoute);

app.get("/", (req, res) => {
  res.send("Server running...");
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});