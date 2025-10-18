#!/usr/bin/env node

// cli/notarize-cli.js
const { notarize, getAvailableDomains, getDomainConfig } = require('./notarize');

// ============================================
// 🎯 CLI режим
// ============================================

const args = process.argv.slice(2);

// Показати help
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('🚀 TLSNotary CLI');
  console.log('');
  console.log('Usage: node cli/notarize-cli.js --domain <domain> [options]');
  console.log('   or: npm run notarize -- --domain <domain> [options]');
  console.log('');
  console.log('Options:');
  console.log('  --domain, -d <domain>     Target domain (required)');
  console.log('  --list                    List all available domains');
  console.log('  --info <domain>           Show config for specific domain');
  console.log('  --output, -o <file>       Output file name');
  console.log('  --help, -h                Show this help');
  console.log('');
  console.log('Available domains:');
  getAvailableDomains().forEach(domain => {
    console.log(`  • ${domain}`);
  });
  console.log('');
  console.log('Examples:');
  console.log('  npm run notarize -- --domain myprotein.ro');
  console.log('  npm run notarize -- -d modaoperandi.com -o my-proof.json');
  console.log('  node cli/notarize-cli.js --domain myprotein.ro');
  process.exit(0);
}

// Показати список доменів
if (args.includes('--list')) {
  console.log('\n📋 Available domains:\n');
  getAvailableDomains().forEach(domain => {
    const config = getDomainConfig(domain);
    console.log(`🌐 ${domain}`);
    console.log(`   URL: ${config.applyCouponUrl}`);
    if (config.description) {
      console.log(`   Description: ${config.description}`);
    }
    console.log('');
  });
  process.exit(0);
}

// Показати інфо про домен
const infoIndex = args.indexOf('--info');
if (infoIndex !== -1 && args[infoIndex + 1]) {
  const domain = args[infoIndex + 1];
  const config = getDomainConfig(domain);

  if (!config) {
    console.error(`❌ Domain not found: ${domain}`);
    console.log('\nAvailable domains:', getAvailableDomains().join(', '));
    process.exit(1);
  }

  console.log('\n📋 Configuration for:', domain);
  console.log('═══════════════════════════════════════');
  console.log(JSON.stringify(config, null, 2));
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

// ============================================
// 🚀 Запустити нотаризацію
// ============================================

console.log('🚀 TLSNotary CLI');
console.log('═══════════════════════════════════════');
console.log('Starting notarization...');
console.log('═══════════════════════════════════════\n');

notarize(domain, { output: outputFile })
  .then((result) => {
    console.log('\n═══════════════════════════════════════');
    console.log('✅ SUCCESS');
    console.log('═══════════════════════════════════════');
    console.log('Domain:      ', result.domain);
    console.log('Proof file:  ', result.proofFile);
    console.log('Proof path:  ', result.proofPath);
    console.log('Timestamp:   ', result.timestamp);
    console.log('═══════════════════════════════════════\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n═══════════════════════════════════════');
    console.error('❌ FAILED');
    console.error('═══════════════════════════════════════');
    console.error('Error:', err.message);
    console.error('═══════════════════════════════════════\n');
    process.exit(1);
  });