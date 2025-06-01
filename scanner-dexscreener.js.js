const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors());

function generateBadges(pair, allPairs) {
  const badges = [];
  if (pair.liquidity && pair.liquidity.usd < 5000) badges.push("Low Liquidity");
  if (pair.volume && pair.volume.h24 < 2000) badges.push("Low Volume");
  if (allPairs.length > 1) badges.push("Multi DEX");
  else badges.push("DEX Listed");
  if (pair.info && pair.info.websites && pair.info.websites.length > 0) badges.push("Has Official Links");
  else badges.push("No Official Socials");
  return badges;
}

app.get('/scan', async (req, res) => {
  const mint = req.query.mint;
  if (!mint) return res.status(400).json({ error: "Missing token mint address" });

  try {
    // Spécifie la chaîne ("solana" ici)
    const url = `https://api.dexscreener.com/token-pairs/v1/solana/${mint}`;
    const { data } = await axios.get(url);

    if (!Array.isArray(data) || data.length === 0)
      return res.status(404).json({ error: "Token not found on Dexscreener" });

    // Prends la paire avec la meilleure liquidité
    const mainPair = data.reduce((prev, current) => {
      if (!prev.liquidity || !current.liquidity) return prev;
      return (current.liquidity.usd > prev.liquidity.usd) ? current : prev;
    });

    const token = mainPair.baseToken || {};
    const info = mainPair.info || {};
    const badges = generateBadges(mainPair, data);

    res.json({
      name: token.name || null,
      symbol: token.symbol || null,
      address: token.address || mint,
      logo: info.imageUrl || null,
      website: info.websites && info.websites.length ? info.websites[0].url : null,
      socials: (info.socials || []).map(s => ({ type: s.type, url: s.url })),
      priceUsd: mainPair.priceUsd || null,
      priceNative: mainPair.priceNative || null,
      priceChange: mainPair.priceChange || {},
      liquidity: mainPair.liquidity || null,
      volume: mainPair.volume || null,
      dexListed: data.length,
      badges,
      allPairs: data.map(pair => ({
        url: pair.url,
        dex: pair.dexId,
        liquidity: pair.liquidity,
        volume: pair.volume,
        priceUsd: pair.priceUsd
      }))
    });
  } catch (e) {
    res.status(500).json({ error: "Server error", details: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dexscreener scanner running on port ${PORT}`);
});
