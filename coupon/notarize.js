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
 * @returns {Promise<Object>} Result object
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

  // Запускаємо Playwright і ловимо помилки з stdout/stderr
  return new Promise((resolve, reject) => {
    let isResolved = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    // Запускаємо з pipe для читання output
    const playwright = spawn('npx', ['playwright', 'test'], {
      env,
      stdio: ['inherit', 'pipe', 'pipe'], // stdin: inherit, stdout/stderr: pipe
      cwd: path.resolve(__dirname, '..')
    });

    // Читаємо stdout
    playwright.stdout.on('data', (data) => {
      const output = data.toString();
      stdoutBuffer += output;

      // Виводимо в консоль
      process.stdout.write(output);

      // Шукаємо маркери помилок в реальному часі
      if (detectError(output)) {
        console.error('\n🔍 Error detected in browser output!');

        if (!isResolved) {
          isResolved = true;

          // Gracefully kill process
          playwright.kill('SIGTERM');

          setTimeout(() => {
            if (!playwright.killed) {
              playwright.kill('SIGKILL');
            }
          }, 3000);

          const errorInfo = extractErrorInfo(stdoutBuffer + stderrBuffer);

          resolve({
            success: false,
            error: {
              message: errorInfo.message || 'Browser error detected',
              type: errorInfo.type || 'browser_error',
              details: errorInfo.details,
            },
            domain: domain,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Читаємо stderr
    playwright.stderr.on('data', (data) => {
      const output = data.toString();
      stderrBuffer += output;

      // Виводимо в консоль
      process.stderr.write(output);

      // Критичні помилки в stderr
      if (detectCriticalError(output)) {
        console.error('\n🔍 Critical error detected in stderr!');

        if (!isResolved) {
          isResolved = true;

          playwright.kill('SIGTERM');

          setTimeout(() => {
            if (!playwright.killed) {
              playwright.kill('SIGKILL');
            }
          }, 3000);

          const errorInfo = extractErrorInfo(stderrBuffer);

          resolve({
            success: false,
            error: {
              message: errorInfo.message || 'Critical stderr error',
              type: 'stderr_error',
              details: errorInfo.details,
            },
            domain: domain,
            timestamp: new Date().toISOString(),
          });
        }
      }
    });

    // Коли процес завершився
    playwright.on('close', (code) => {
      if (isResolved) {
        return; // Вже обробили через detectError
      }

      isResolved = true;

      if (code === 0) {
        console.log('\n✅ Notarization completed successfully!');
        resolve({
          success: true,
          domain: domain,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('\n❌ Notarization failed with code:', code);

        const errorInfo = extractErrorInfo(stdoutBuffer + stderrBuffer);

        resolve({
          success: false,
          error: {
            code,
            message: errorInfo.message || `Process exited with code ${code}`,
            type: errorInfo.type || 'playwright_error',
            details: errorInfo.details,
          },
          domain: domain,
          timestamp: new Date().toISOString(),
        });
      }
    });

    playwright.on('error', (err) => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      console.error('❌ Spawn error:', err.message);

      resolve({
        success: false,
        error: {
          message: err.message,
          type: 'spawn_error',
        },
        domain: domain,
        timestamp: new Date().toISOString(),
      });
    });

    // Обробка SIGTERM для graceful shutdown
    process.on('SIGTERM', () => {
      if (playwright && !playwright.killed) {
        playwright.kill('SIGTERM');
      }
    });

    process.on('SIGINT', () => {
      if (playwright && !playwright.killed) {
        playwright.kill('SIGTERM');
      }
    });
  });
}

/**
 * Детектує помилки в output
 * @param {string} output - Output text
 * @returns {boolean}
 */
function detectError(output) {
  const errorPatterns = [
    /Error/i,
    /error/i,
  ];

  // Виключення - не помилки
  const excludePatterns = [
    /failed to clear/i,
    /Failed notarization using websocket/i,
    /connection reset by peer/i,
    /connection closed/i,
    /remote closed connection/i,
    /mux connection closed/i,
  ];

  // Перевіряємо чи є виключення
  for (const pattern of excludePatterns) {
    if (pattern.test(output)) {
      return false;
    }
  }

  // Перевіряємо помилки
  for (const pattern of errorPatterns) {
    if (pattern.test(output)) {
      return true;
    }
  }

  return false;
}

/**
 * Детектує критичні помилки в stderr
 * @param {string} output - Stderr text
 * @returns {boolean}
 */
function detectCriticalError(output) {
  const criticalPatterns = [
    /ERROR/,
    /FATAL/i,
    /verifier error/i,
    /commit error/i,
    /connection is closed/i,
  ];

  // Ігноруємо DEBUG та INFO в stderr
  if (/DEBUG|INFO/i.test(output)) {
    return false;
  }

  for (const pattern of criticalPatterns) {
    if (pattern.test(output)) {
      return true;
    }
  }

  return false;
}

/**
 * Витягує інформацію про помилку з output
 * @param {string} output - Full output
 * @returns {Object} Error info
 */
function extractErrorInfo(output) {
  const lines = output.split('\n');
  let message = 'Unknown error';
  let type = 'unknown';
  let details = [];

  // Шукаємо рядки з помилками
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Notary errors
    if (line.includes('verifier error') || line.includes('commit error')) {
      type = 'notary_error';
      message = 'Notary server error: connection is closed';
      details.push(line.trim());
    }

    // Browser errors
    else if (line.includes('[Browser Error]')) {
      type = 'browser_error';
      message = line.replace(/.*\[Browser Error\]:\s*/i, '').trim();
      details.push(line.trim());
    }

    // Connection errors
    else if (line.includes('ECONNREFUSED') || line.includes('connection refused')) {
      type = 'connection_error';
      message = 'Cannot connect to notary server';
      details.push(line.trim());
    }

    // Timeout errors
    else if (line.includes('timeout') || line.includes('timed out')) {
      type = 'timeout_error';
      message = 'Request timed out';
      details.push(line.trim());
    }

    // Test failures
    else if (line.includes('Error:') && i + 1 < lines.length) {
      type = 'test_error';
      message = lines[i + 1].trim() || line.trim();
      details.push(line.trim());
    }

    // Generic errors
    else if (line.includes('❌') || /error:/i.test(line)) {
      if (!message || message === 'Unknown error') {
        message = line.replace(/.*❌\s*/i, '').trim();
        details.push(line.trim());
      }
    }
  }

  return {
    message,
    type,
    details: details.slice(0, 5), // Тільки перші 5 деталей
  };
}

// Експорт
module.exports = {
  notarize
};