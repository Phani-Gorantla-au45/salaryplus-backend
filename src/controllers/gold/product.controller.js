import axios from "axios";
import Product from "../../models/gold/product.model.js";

export const syncProducts = async (req, res) => {
  try {
    console.log("📦 Starting full product sync from Augmont...");

    let page = 1;
    let hasMore = true;
    let totalSynced = 0;
    const allSkus = [];

    while (hasMore) {
      console.log(`➡️ Fetching page ${page}`);

      const response = await axios.get(
        `${process.env.AUG_URL}/merchant/v1/products`,
        {
          params: { page, count: 30 },
          headers: {
            Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
            Accept: "application/json",
          },
        },
      );

      const products = response.data.result?.data || [];
      const pagination = response.data.result?.pagination || {};

      if (!products.length) break;

      const bulkOps = products.map((p) => {
        allSkus.push(p.sku);

        return {
          updateOne: {
            filter: { sku: p.sku },
            update: {
              name: p.name,
              metalType: p.metalType,
              purity: p.purity,
              jewelleryType: p.jewelleryType,
              productWeight: parseFloat(p.productWeight),
              redeemWeight: parseFloat(p.redeemWeight),
              basePrice: parseFloat(p.basePrice),
              description: p.description,
              status: p.status,
              images: p.productImages || [],
            },
            upsert: true,
          },
        };
      });

      await Product.bulkWrite(bulkOps);
      totalSynced += products.length;

      hasMore = pagination.hasMore;
      page++;
    }

    // 🧹 Remove products no longer present in Augmont
    await Product.deleteMany({ sku: { $nin: allSkus } });

    console.log(`✅ Full sync done. ${totalSynced} products updated.`);

    res.json({
      message: "Products fully synced",
      count: totalSynced,
    });
  } catch (err) {
    console.error("❌ PRODUCT SYNC ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Product sync failed" });
  }
};
export const getProductBySku = async (req, res) => {
  try {
    const { sku } = req.params;

    if (!sku) return res.status(400).json({ message: "SKU required" });

    console.log(`🔎 Fetching product detail for SKU: ${sku}`);

    const response = await axios.get(
      `${process.env.AUG_URL}/merchant/v1/products/${sku}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AUGMONT_TOKEN}`,
          Accept: "application/json",
        },
      },
    );

    console.log("📦 PRODUCT DETAIL RESPONSE:", response.data);

    res.json({
      message: "Product fetched successfully",
      product: response.data.result?.data,
    });
  } catch (err) {
    console.error("❌ PRODUCT FETCH ERROR:", err.response?.data || err.message);
    res.status(500).json({ message: "Product fetch failed" });
  }
};
