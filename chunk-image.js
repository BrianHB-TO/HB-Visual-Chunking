const sharp = require('sharp');
const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const { imageUrl, chunkHeight = 7000 } = req.query;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl parameter required' });
    }

    // Download the image
    const response = await fetch(imageUrl);
    const buffer = await response.buffer();
    
    // Get image metadata
    const metadata = await sharp(buffer).metadata();
    const { width, height } = metadata;
    
    // Calculate chunks
    const numChunks = Math.ceil(height / chunkHeight);
    const chunks = [];
    
    for (let i = 0; i < numChunks; i++) {
      const yOffset = i * chunkHeight;
      const actualHeight = Math.min(chunkHeight, height - yOffset);
      
      // Extract chunk
      const chunkBuffer = await sharp(buffer)
        .extract({
          left: 0,
          top: yOffset,
          width: width,
          height: actualHeight
        })
        .png()
        .toBuffer();
      
      chunks.push({
        index: i + 1,
        total: numChunks,
        data: chunkBuffer.toString('base64'),
        filename: `chunk-${i + 1}.png`
      });
    }
    
    return res.status(200).json({ chunks });
    
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};