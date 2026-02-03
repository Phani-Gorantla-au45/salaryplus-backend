import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./src/config/db.js";
import registrationRoutes from "./src/routes/registration.routes.js";
import goldRoutes from "./src/routes/gold.routes.js";
import masterRoutes from "./src/routes/master.routes.js";
import kycRoutes from "./src/routes/kyc.routes.js";
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
