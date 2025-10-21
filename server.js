// server.js
const express = require('express');
const path = require('path');
const fs = require('fs');
const { validateCoupon } = require('./coupon/validate');
const { notarize } = require('./coupon/notarize');

const app = express();
const PORT = process.env.PORT || 3001;
const PROOFS_DIR = process.env.PROOFS_DIR || path.join(__dirname, 'output/proofs');

// CORS заголовки для SharedArrayBuffer
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// JSON parser
app.use(express.json({ limit: '50mb' }));

// --- 🕒 Таймаут запиту: 3 хвилини (180 000 мс)
app.use((req, res, next) => {
  // Встановлюємо таймаут на відповідь
  res.setTimeout(180000, () => {
    console.error(`⏰ Request timed out: ${req.method} ${req.originalUrl}`);
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        error: 'Request timed out (3 minutes limit reached)',
      });
    }
  });
  next();
});

// Створити директорію для proofs
if (!fs.existsSync(PROOFS_DIR)) {
  fs.mkdirSync(PROOFS_DIR, { recursive: true });
}

/**
 * Знайти останній збережений proof файл
 * @param {string} [subdirectory] - Subdirectory to search in
 * @returns {Object|null} Proof file info or null
 */
function findLatestProof(subdirectory = null) {
  try {
    const searchDir = subdirectory
      ? path.join(PROOFS_DIR, subdirectory)
      : PROOFS_DIR;

    if (!fs.existsSync(searchDir)) {
      return null;
    }

    const files = fs.readdirSync(searchDir)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(searchDir, f),
        modified: fs.statSync(path.join(searchDir, f)).mtime,
        size: fs.statSync(path.join(searchDir, f)).size
      }))
      .sort((a, b) => b.modified - a.modified);

    return files[0] || null;
  } catch (err) {
    console.error('Error finding proof:', err.message);
    return null;
  }
}

/**
 * Прочитати proof файл
 * @param {string} proofPath - Path to proof file
 * @returns {Object|null} Proof data or null
 */
function readProof(proofPath) {
  try {
    const data = fs.readFileSync(proofPath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading proof:', err.message);
    return null;
  }
}

// API для збереження proof
app.post('/api/save-proof', (req, res) => {
  try {
    const { filename, data, subdirectory } = req.body;

    if (!filename || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing filename or data'
      });
    }

    let targetDir = PROOFS_DIR;
    if (subdirectory) {
      targetDir = path.join(PROOFS_DIR, subdirectory);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    const filePath = path.join(targetDir, filename);

    const relativePath = path.relative(PROOFS_DIR, filePath);
    if (relativePath.startsWith('..')) {
      return res.status(403).json({
        success: false,
        error: 'Invalid file path'
      });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    const fileSize = (JSON.stringify(data).length / 1024).toFixed(2);
    console.log('✅ Proof saved:', filePath);
    console.log('   Size:', fileSize, 'KB');

    res.json({
      success: true,
      filename: filename,
      path: filePath,
      size: fs.statSync(filePath).size,
    });

  } catch (err) {
    console.error('❌ Error saving proof:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// API для валідації і нотаризації
app.post('/api/validate-coupon', async (req, res) => {
  // Очистити temp файли
  const tempRequestFilePath = path.join(__dirname, '.', 'output/temp/request.json');
  const tempActionsFilePath = path.join(__dirname, '.', 'output/temp/actions.json');
  if (fs.existsSync(tempRequestFilePath)) {
    fs.unlinkSync(tempRequestFilePath);
    console.log('🧹 Cleaned up temp request file');
  }
  if (fs.existsSync(tempActionsFilePath)) {
    fs.unlinkSync(tempActionsFilePath);
    console.log('🧹 Cleaned up temp actions file');
  }


  try {
    const { coupon, domain, productUrl, filename, customActions } = req.body;

    if (!coupon || !domain || !filename) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: coupon, domain, filename'
      });
    }

    if (customActions) {
      const tempRequestFilePath = `output/temp/actions.json`;
      await fs.writeFileSync(tempRequestFilePath, JSON.stringify(customActions, null, 2));
    }

    console.log('\n🚀 API: Full Flow - Validation → Notarization');
    console.log('═══════════════════════════════════════');
    console.log('   Coupon:', coupon);
    console.log('   Domain:', domain);
    console.log('   Filename:', filename);
    if (productUrl) console.log('   Product URL:', productUrl);
    if (customActions) console.log('   Custom Actions: ✅');
    console.log('═══════════════════════════════════════\n');

    // 🔍 КРОК 1: Валідація купона
    console.log('🔍 Step 1/2: Validating coupon...');
    const validationResult = await validateCoupon({
      coupon: coupon,
      domain: domain,
      productUrl: productUrl,
      filename: filename,
      customActions,
    });
    console.log('✅ Coupon validation successful');

    // 🔐 КРОК 2: Нотаризація
    console.log('\n🔐 Step 2/2: Notarizing...');

    // Запам'ятати існуючі proof файли ДО нотаризації
    const proofsBefore = fs.readdirSync(PROOFS_DIR)
      .filter(f => f.endsWith('.json'));

    const notarizeResult = await notarize(domain);
    console.log('✅ Notarization successful');

    // 📁 Знайти новий proof файл
    console.log('\n📁 Locating proof file...');

    const proofsAfter = fs.readdirSync(PROOFS_DIR)
      .filter(f => f.endsWith('.json'));

    const newProofs = proofsAfter.filter(f => !proofsBefore.includes(f));

    let proofFile = null;
    let proofPath = null;
    let proofData = null;

    if (newProofs.length > 0) {
      // Знайдено новий файл
      proofFile = newProofs[0];
      proofPath = path.join(PROOFS_DIR, proofFile);
      proofData = readProof(proofPath);
      console.log('✅ New proof file found:', proofFile);
    } else {
      // Взяти останній модифікований
      const latestProof = findLatestProof();
      if (latestProof) {
        proofFile = latestProof.name;
        proofPath = latestProof.path;
        proofData = readProof(proofPath);
        console.log('✅ Using latest proof file:', proofFile);
      }
    }



    console.log('\n═══════════════════════════════════════');
    console.log('✅ ALL STEPS COMPLETED SUCCESSFULLY');
    console.log('═══════════════════════════════════════\n');

    // Відповідь
    res.json({
      success: true,
      message: 'Coupon validated and notarized successfully',
      coupon: coupon,
      domain: domain,
      validation: {
        valid: true,
        duration: validationResult.duration,
        applyCouponRequest: validationResult.applyCouponRequest
      },
      notarization: {
        completed: true,
        proofFile: proofFile,
        proofPath: proofPath,
        hasProofData: !!proofData
      },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('\n❌ API Error:', err.message);
    console.error('═══════════════════════════════════════\n');

    const isCouponInvalid = err.message.includes('not valid');

    res.status(isCouponInvalid ? 400 : 500).json({
      success: false,
      error: err.message,
      couponValid: isCouponInvalid ? false : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// API для списку файлів
app.get('/api/proofs', (req, res) => {
  try {
    const files = fs.readdirSync(PROOFS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(PROOFS_DIR, f));
        return {
          name: f,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
        };
      })
      .sort((a, b) => b.modified - a.modified);

    res.json({
      success: true,
      files: files,
      directory: PROOFS_DIR,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// API для завантаження файлу
app.get('/api/proofs/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(PROOFS_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    res.download(filePath);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

app.get('/api/request-data', (req, res) => {
  const requestPath = path.join(__dirname, 'output/temp/request.json');
  if (!fs.existsSync(requestPath)) return res.status(404).json({ error: 'File not found' });
  try {
    const data = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    res.json(data);
  } catch (errr) {
    res.status(500).json({ error: 'Failed to read JSON' });
  }
});

app.get('/api/get-actions', (req, res) => {
  const customActions = path.join(__dirname, 'output/temp/actions.json');
  try {
    if(fs.existsSync(customActions)) {
      const data = JSON.parse(fs.readFileSync(customActions, 'utf8'));
      res.json(data);
    } else {
      const requestPath = path.join(__dirname, 'site-config/actions.json');
      if (!fs.existsSync(requestPath)) return res.status(404).json({ error: 'actions.json not found' });
      const data = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
      res.json(data);
    }
  } catch (errr) {
    res.status(500).json({ error: 'Failed to read JSON' });
  }
});

// Статичні файли
app.use(express.static(path.join(__dirname, 'test-build')));

// Fallback для SPA
app.use((req, res) => {
  const indexPath = path.join(__dirname, 'test-build', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Test build not found. Run: npm run build:test');
  }
});

app.listen(PORT, () => {
  console.log('🚀 Server running at http://localhost:' + PORT);
  console.log('📁 Proofs directory:', PROOFS_DIR);
  console.log('📦 Serving files from:', path.join(__dirname, 'test-build'));
});