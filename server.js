import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./src/config/db.js";
import registrationRoutes from "./src/routes/registration/registration.routes.js";
import goldRoutes from "./src/routes/augmont/gold.routes.js";
import masterRoutes from "./src/routes/augmont/master.routes.js";
import kycRoutes from "./src/routes/augmont/kyc.routes.js";
import augmontRoutes from "./src/routes/augmont/augmont.routes.js";
import bankRoutes from "./src/routes/augmont/bank.routes.js";
import productRoutes from "./src/routes/augmont/product.routes.js";
import bondRoutes from "./src/routes/bonds/bond.routes.js";
import bonddetailsRoutes from "./src/routes/bonds/bondDetails.routes.js";
import juspayRoutes from "./src/juspay/juspay.routes.js";

dotenv.config(); // Load env FIRST

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.send("SalaryPlus API is running 🚀");
});

app.use("/api/registration", registrationRoutes);
app.use("/api/gold", goldRoutes);
app.use("/api/augmont/master", masterRoutes);
app.use("/api/kyc/", kycRoutes);
app.use("/api/bank/", bankRoutes);
app.use("/api/products", productRoutes);
app.use("/api/juspay", juspayRoutes);
app.use("/api/bonds", bondRoutes);
app.use("/api/bonds", bonddetailsRoutes);
app.use(augmontRoutes);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
