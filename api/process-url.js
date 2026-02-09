const sharp = require('sharp');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url, chunkIndex = 1 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'url parameter required' });
    }

    // Get screenshot from Screenshotone
    const screenshotUrl = `https://api.screenshotone.com/take?access_key=${process.env.SCREENSHOTONE_API_KEY}&url=${encodeURIComponent(url)}&viewport_width=1920&viewport_height=900&full_page=true&format=png`;

    const screenshotResponse = await fetch(screenshotUrl);
    if (!screenshotResponse.ok) {
      return res.status(400).json({
        error: 'Failed to get screenshot'
      });
    }

    const imageBuffer = await screenshotResponse.buffer();
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;

    const chunkHeight = 7000;
    const totalChunks = Math.ceil(height / chunkHeight);

    // Validate chunk index
    if (chunkIndex < 1 || chunkIndex > totalChunks) {
      return res.status(400).json({
        error: `Invalid chunkIndex. Must be between 1 and ${totalChunks}`
      });
    }

    // Extract ONLY the requested chunk
    const yOffset = (chunkIndex - 1) * chunkHeight;
    const actualHeight = Math.min(chunkHeight, height - yOffset);

    const chunkBuffer = await sharp(imageBuffer)
      .extract({
        left: 0,
        top: yOffset,
        width: width,
        height: actualHeight
      })
      .png()
      .toBuffer();

    // Create URL slug
    const urlSlug = url
      .replace(/^https?:\/\//, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase();

    // Return raw PNG binary with metadata in headers
    res.setHeader('X-Url-Slug', urlSlug);
    res.setHeader('X-Chunk-Index', chunkIndex.toString());
    res.setHeader('X-Total-Chunks', totalChunks.toString());
    res.setHeader('X-Original-Width', width.toString());
    res.setHeader('X-Original-Height', height.toString());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="chunk-${chunkIndex}.png"`);

    return res.status(200).send(chunkBuffer);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: error.message
    });
  }
};
