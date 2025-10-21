const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let config;

const customConfig = path.join(__dirname, '..', 'output/temp', 'actions.json');
const configPath = path.join(__dirname, '..', 'site-config', 'actions.json');

const isCustomConfig = fs.existsSync(customConfig);
const configToLoad = isCustomConfig ? customConfig : configPath;

try {
  config = JSON.parse(fs.readFileSync(configToLoad, 'utf8'));
  console.log(`✅ Loaded config from: ${configToLoad}`);
} catch (err) {
  console.error('❌ Failed to load config from:', configToLoad);
  console.error('Error:', err.message);
  throw err;
}


/**
 * Запустити нотаризацію для домену
 * @param {string} domain - Target domain
 * @param {Object} options - Options
 * @returns {Promise<Object>} Result object
 * @throws {Error} If notarization fails
 */
async function notarize(domain) {
  // Перевірити чи домен існує в конфігу

  if (!isCustomConfig && !config?.sites[domain]) {
        const available = Object.keys(config.sites).join(', ');
        throw new Error(
          `Configuration not found for domain: ${domain}\n` +
            `Available domains: ${available}\n` +
            `Add configuration to site-config/actions.json or use custom config`,
        );

  }


  const siteConfig = isCustomConfig ? config : config?.sites[domain];

  // Виводимо інфо
  console.log('\n🚀 TLSNotary Notarization');
  console.log('═══════════════════════════════════════');
  console.log('🎯 Domain:     ', domain);
  console.log('🌐 URL:        ', siteConfig?.requestParams?.applyCouponUrl);

  console.log('═══════════════════════════════════════');

  // Environment variables
  const env = {
    ...process.env,
    TARGET_DOMAIN: domain,
  };

  // Запускаємо Playwright
  return new Promise((resolve, reject) => {
    const playwright = spawn('npx', ['playwright', 'test'], {
      env,
      stdio: 'inherit',
      cwd: path.resolve(__dirname, '..')
    });

    playwright.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Notarization completed successfully!');

        // Просто повернути успіх
        resolve({
          success: true,
          domain: domain,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('\n❌ Notarization failed with code:', code);
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    playwright.on('error', (err) => {
      reject(err);
    });
  });
}

// Експорт
module.exports = {
  notarize
};