const sharp = require('sharp');
const fetch = require('node-fetch');
const { google } = require('googleapis');

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { url, mode = 'baseline' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'url parameter required' });
    }

    if (!['baseline', 'comparison'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "baseline" or "comparison"' });
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
        buffer: chunkBuffer,
        index: i + 1,
        filename: `chunk-${i + 1}.png`
      });
    }

    console.log(`Created ${chunks.length} chunks`);

    // Step 3: Upload to Google Drive
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    const drive = google.drive({ version: 'v3', auth });

    // Create URL slug for folder name
    const urlSlug = url
      .replace(/^https?:\/\//, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-]/g, '')
      .toLowerCase();

    // Find or create base folder
    const baseFolderName = mode === 'baseline' ? 'Visual Regression Baselines' : 'Visual Regression Comparisons';
    let baseFolderId = process.env.GOOGLE_DRIVE_BASE_FOLDER_ID;

    // Find or create subfolder for this URL
    const subfolderName = urlSlug;
    const subfolderQuery = `name='${subfolderName}' and '${baseFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const subfolderSearch = await drive.files.list({
      q: subfolderQuery,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    let subfolderId;
    if (subfolderSearch.data.files.length > 0) {
      subfolderId = subfolderSearch.data.files[0].id;
      console.log(`Using existing folder: ${subfolderId}`);
    } else {
      const folderMetadata = {
        name: subfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [baseFolderId]
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id'
      });
      subfolderId = folder.data.id;
      console.log(`Created new folder: ${subfolderId}`);
    }

    // Upload each chunk
    const uploadedChunks = [];
    
    for (const chunk of chunks) {
      const fileMetadata = {
        name: chunk.filename,
        parents: [subfolderId]
      };

      const media = {
        mimeType: 'image/png',
        body: require('stream').Readable.from(chunk.buffer)
      };

      const file = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
      });

      uploadedChunks.push({
        driveFileId: file.data.id,
        filename: chunk.filename,
        path: `/${mode}/${urlSlug}/${chunk.filename}`,
        webViewLink: file.data.webViewLink,
        index: chunk.index
      });

      console.log(`Uploaded ${chunk.filename}: ${file.data.id}`);
    }

    // Return success with chunk info
    return res.status(200).json({
      success: true,
      url: url,
      mode: mode,
      urlSlug: urlSlug,
      originalDimensions: { width, height },
      numChunks: chunks.length,
      chunks: uploadedChunks
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

## **Step 4: Set Up Google Drive API**

### **A. Create Service Account:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **Service Account**
5. Create service account (name it "vercel-screenshot-uploader")
6. Click on the service account → **Keys** → **Add Key** → **JSON**
7. Download the JSON file (keep it safe!)

### **B. Share Google Drive Folder with Service Account:**

1. Go to your Google Drive
2. Find your "Visual Regression Baselines" folder (or create it)
3. Right-click → **Share**
4. Share with the service account email (looks like: `vercel-screenshot-uploader@project-name.iam.gserviceaccount.com`)
5. Give it **Editor** permissions
6. Copy the folder ID from the URL (the part after `/folders/`)

---

## **Step 5: Add Environment Variables to Vercel**

Go to your Vercel project → **Settings** → **Environment Variables**

Add these:

**SCREENSHOTONE_API_KEY:**
```
tyPfLPqmpXDdmg
