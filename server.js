const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

const authRoute = require("./route/auth");
const customersRoute = require("./route/customers");
const ordersRoute = require("./route/orders");
const paymentRoute = require("./route/payment");

dotenv.config();

const app = express();


app.use(cors({
  origin: "*"
}));
app.use(express.json());

// ROUTES
app.use("/api/auth", authRoute);
app.use("/api/customers", customersRoute);
app.use("/api/orders", ordersRoute);
app.use("/api/payment", paymentRoute);

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
