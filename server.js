import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./src/config/db.js";
import registrationRoutes from "./src/routes/registration.routes.js";
import goldRoutes from "./src/routes/gold.routes.js";
import masterRoutes from "./src/routes/master.routes.js";
import kycRoutes from "./src/routes/kyc.routes.js";
import augmontRoutes from "./src/routes/augmont.routes.js";
import bankRoutes from "./src/routes/bank.routes.js";
import productRoutes from "./src/routes/product.routes.js";
import bondRoutes from "./src/routes/bond.routes.js";

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

app.use("/api/bounds", bondRoutes);
app.use(augmontRoutes);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
