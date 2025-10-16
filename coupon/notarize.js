#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Завантажити конфіг
const configPath = path.join(__dirname, '..', 'site-config', 'config.json');
let config;

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error('❌ Failed to load config from:', configPath);
  console.error('Error:', err.message);
  process.exit(1);
}

// ============================================
// 🚀 Основна функція (для використання як модуль)
// ============================================

/**
 * Запустити нотаризацію для домену
 * @param {string} domain - Target domain
 * @param {Object} options - Options
 * @param {string} [options.output] - Output file name
 * @returns {Promise<void>}
 */
async function notarize(domain, options = {}) {
  // Перевірити чи домен існує в конфігу
  if (!config.sites[domain]) {
    const available = Object.keys(config.sites).join(', ');
    throw new Error(
      `Configuration not found for domain: ${domain}\n` +
      `Available domains: ${available}\n` +
      `Add configuration to site-config/config.json`
    );
  }

  const siteConfig = config.sites[domain];

  // Виводимо інфо
  console.log('\n🚀 TLSNotary CLI');
  console.log('═══════════════════════════════════════');
  console.log('🎯 Domain:     ', domain);
  console.log('🌐 URL:        ', siteConfig.applyCouponUrl);

  if (options.output) {
    console.log('💾 Output:     ', options.output);
  }
  console.log('═══════════════════════════════════════');

  // Environment variables
  const env = {
    ...process.env,
    TARGET_DOMAIN: domain,
  };

  if (options.output) {
    env.OUTPUT_FILE = options.output;
  }

  console.log('═══════════════════2════════════════════');

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
        resolve();
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

console.log('═══════════════════3════════════════════');

// ============================================
// 🎯 CLI режим (тільки якщо запускається напряму)
// ============================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('🚀 TLSNotary CLI');
    console.log('');
    console.log('Usage: npm run notarize -- --domain <domain> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --domain, -d <domain>     Target domain (required)');
    console.log('  --list                    List all available domains');
    console.log('  --info <domain>           Show config for specific domain');
    console.log('  --output, -o <file>       Output file name');
    console.log('  --help, -h                Show this help');
    console.log('');
    console.log('Available domains:');
    Object.keys(config.sites).forEach(domain => {
      const site = config.sites[domain];
      console.log(`  • ${domain.padEnd(25)}`);
    });
    console.log('');
    console.log('Examples:');
    console.log('  npm run notarize -- --domain myprotein.ro');
    console.log('  npm run notarize -- -d modaoperandi.com -o my-proof.json');
    process.exit(0);
  }

  // Показати список доменів
  if (args.includes('--list')) {
    console.log('\n📋 Available domains:\n');
    Object.entries(config.sites).forEach(([domain, site]) => {
      console.log(`🌐 ${domain}`);
      console.log(`   URL: ${site.applyCouponUrl}`);
      if (site.description) {
        console.log(`   Description: ${site.description}`);
      }
      console.log('');
    });
    process.exit(0);
  }

  // Показати інфо про домен
  const infoIndex = args.indexOf('--info');
  if (infoIndex !== -1 && args[infoIndex + 1]) {
    const domain = args[infoIndex + 1];
    const site = config.sites[domain];

    if (!site) {
      console.error(`❌ Domain not found: ${domain}`);
      console.log('\nAvailable domains:', Object.keys(config.sites).join(', '));
      process.exit(1);
    }

    console.log('\n📋 Configuration for:', domain);
    console.log('═══════════════════════════════════════');
    console.log(JSON.stringify(site, null, 2));
    console.log('═══════════════════════════════════════\n');
    process.exit(0);
  }

  // Парсити domain
  let domain;
  const domainIndex = args.indexOf('--domain');
  const dIndex = args.indexOf('-d');

  if (domainIndex !== -1 && args[domainIndex + 1]) {
    domain = args[domainIndex + 1];
  } else if (dIndex !== -1 && args[dIndex + 1]) {
    domain = args[dIndex + 1];
  } else {
    console.error('❌ --domain parameter is required');
    console.log('Use --help to see usage');
    process.exit(1);
  }

  // Парсити output
  let outputFile;
  const outputIndex = args.indexOf('--output');
  const oIndex = args.indexOf('-o');

  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputFile = args[outputIndex + 1];
  } else if (oIndex !== -1 && args[oIndex + 1]) {
    outputFile = args[oIndex + 1];
  }

  // Запустити нотаризацію
  notarize(domain, { output: outputFile })
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      process.exit(1);
    });
}

// ============================================
// 📤 Експорт для використання як модуль
// ============================================

module.exports = { notarize };