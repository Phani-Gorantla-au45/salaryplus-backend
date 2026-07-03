import express from "express";
import { listCountries, syncCountries } from "../../../controllers/mf/master/country.controller.js";

const router = express.Router();

router.get("/",      listCountries);
router.post("/sync", syncCountries);

export default router;
