const sharp = require('sharp');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'url parameter required' });
    }

    // Step 1: Get screenshot from Screenshotone
    console.log(`Fetching screenshot for: ${url}`);
    const screenshotUrl = `https://api.screenshotone.com/take?access_key=${process.env.SCREENSHOTONE_API_KEY}&url=${encodeURIComponent(url)}&viewport_width=1920&viewport_height=900&full_page=true&format=png`;
    
    const screenshotResponse = await fetch(screenshotUrl);
    if (!screenshotResponse.ok) {
      return res.status(400).json({ 
        error: 'Failed to get screenshot',
        details: `${screenshotResponse.status} ${screenshotResponse.statusText}`
      });
    }

    const imageBuffer = await screenshotResponse.buffer();
    console.log(`Screenshot downloaded: ${imageBuffer.length} bytes`);

    // Step 2: Get image dimensions and chunk
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    const chunkHeight = 7000;
    const numChunks = Math.ceil(height / chunkHeight);
    console.log(`Image size: ${width}x${height}, creating ${numChunks} chunks`);

    const chunks = [];
    
    for (let i = 0; i < numChunks; i++) {
      const yOffset = i * chunkHeight;
      const actualHeight = Math.min(chunkHeight, height - yOffset);
      
      // Extract chunk
      const chunkBuffer = await sharp(imageBuffer)
        .extract({
          left: 0,
          top: yOffset,
          width: width,
          height: actualHeight
        })
        .png()
        .toBuffer();
      
      chunks.push({
        data: chunkBuffer.toString('base64'),
        index: i + 1,
        filename: `chunk-${i + 1}.png`
      });
    }

    console.log(`Created ${chunks.length} chunks`);

    // Create URL slug for folder name
    const urlSlug = url
      .replace(/^https?:\/\//, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase();

    // Return chunks as base64 for Make.com to upload
    return res.status(200).json({
      success: true,
      url: url,
      urlSlug: urlSlug,
      originalDimensions: { width, height },
      numChunks: chunks.length,
      chunks: chunks
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
};
```

---

## **Vercel Environment Variables**

Only need ONE now:

**SCREENSHOTONE_API_KEY:**
```
tyPfLPqmpXDdmg
