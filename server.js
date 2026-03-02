import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import { webcrypto } from "crypto";

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
import connectDB from "./src/config/db.js";
import { initSocket } from "./src/utils/socket.js";
import routes from "./src/routes/index.js";

dotenv.config(); // Load env FIRST

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.send("SalaryPlus API is running 🚀");
});

app.use(routes);

/* ---------------- SOCKET SETUP ---------------- */
const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server + Socket.IO running on port ${PORT}`);
});
