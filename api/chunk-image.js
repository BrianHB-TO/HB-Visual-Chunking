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
    
    // Check if the response is ok
    if (!response.ok) {
      return res.status(400).json({ 
        error: `Failed to fetch image: ${response.status} ${response.statusText}`,
        url: imageUrl
      });
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('image')) {
      const text = await response.text();
      return res.status(400).json({ 
        error: 'Response is not an image',
        contentType: contentType,
        responsePreview: text.substring(0, 500)
      });
    }
    
    const buffer = await response.buffer();
    
    // Verify it's a valid image
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch (err) {
      return res.status(400).json({ 
        error: 'Invalid image format',
        details: err.message,
        bufferSize: buffer.length,
        contentType: contentType
      });
    }
    
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
    
    return res.status(200).json({ 
      success: true,
      originalWidth: width,
      originalHeight: height,
      chunks 
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
};
