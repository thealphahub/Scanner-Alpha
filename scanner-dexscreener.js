const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors());

// --- Juice Score Function (à adapter si besoin)
function computeJuiceScore(pair, dexCount) {
  let score = 0;

  // Liquidité (30)
  const liquidity = pair.liquidity?.usd || 0;
  if(liquidity >= 100000) score += 30;
  else if(liquidity >= 50000) score += 20;
  else if(liquidity >= 20000) score += 10;
  else if(liquidity >= 5000) score += 5;

  // Marketcap (15)
  const marketcap = pair.fdv || 0; // Utilise fdv (fully diluted valuation) comme marketcap si dispo
  if(marketcap >= 100000) score += 15;
  else if(marketcap >= 20000) score += 10;
  else if(marketcap >= 5000) score += 5;

  // Volume (20)
  const volume = pair.volume?.h24 || 0;
  if(volume >= 100000) score += 20;
  else if(volume >= 10000) score += 15;
  else if(volume >= 1000) score += 5;

  // Price change (15)
  const vol = Math.abs(pair.priceChange?.h24 || 0);
  if(vol < 30) score += 15;
  else if(vol < 70) score += 8;

  // Multi DEX (10)
  if(dexCount >= 3) score += 10;
  else if(dexCount === 2) score += 6;

  // Social/site (10)
  const hasSite = pair.info?.websites && pair.info.websites.length;
  const socials = pair.info?.socials || [];
  if (socials.length >= 2 && hasSite) score += 10;
  else if (socials.length >= 1 || hasSite) score += 7;

  return score;
}

function generateBadges(pair, allPairs) {
  const badges = [];
  if ((pair.liquidity?.usd || 0) < 5000) badges.push("Low Liquidity");
  if ((pair.volume?.h24 || 0) < 2000) badges.push("Low Volume");
  if (allPairs.length > 1) badges.push("Multi DEX");
  else badges.push("DEX Listed");
  if (pair.info?.websites?.length) badges.push("Has Official Links");
  else badges.push("No Official Socials");
  return badges;
}

app.get('/scan', async (req, res) => {
  const mint = req.query.mint;
  if (!mint) return res.status(400).json({ error: "Missing token mint address" });

  try {
    // Dexscreener retourne { pairs: [...] }
    const url = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
    const { data } = await axios.get(url);

    const pairs = data.pairs;
    if (!Array.isArray(pairs) || pairs.length === 0)
      return res.status(404).json({ error: "Token not found on Dexscreener" });

    // Prends la paire avec la meilleure liquidité
    const mainPair = pairs.reduce((prev, current) => {
      if (!prev.liquidity || !current.liquidity) return prev;
      return (current.liquidity.usd > prev.liquidity.usd) ? current : prev;
    });

    const token = mainPair.baseToken || {};
    const info = mainPair.info || {};
    const badges = generateBadges(mainPair, pairs);
    const juiceScore = computeJuiceScore(mainPair, pairs.length);

    res.json({
      name: token.name || null,
      symbol: token.symbol || null,
      address: token.address || mint,
      logo: info.imageUrl || null,
      website: info.websites?.length ? info.websites[0].url : null,
      socials: (info.socials || []).map(s => ({ type: s.type, url: s.url })),
      priceUsd: mainPair.priceUsd || null,
      priceNative: mainPair.priceNative || null,
      priceChange: mainPair.priceChange || {},
      liquidity: mainPair.liquidity || null,
      volume: mainPair.volume || null,
      dexListed: pairs.length,
      badges,
      juiceScore,
      allPairs: pairs.map(pair => ({
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
