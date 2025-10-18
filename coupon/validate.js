// coupon/validate.js
const { firefox } = require('playwright');
const fs = require('fs');
const actions = require('../site-config/actions.json');
const {sites} = require('../site-config/config.json');

const outputDir = './output';
const tempRequestFilePath = `${outputDir}/temp/request.json`;
const tempDir = `${outputDir}/temp`;
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, {recursive: true});
}

/**
 * Валідувати купон через браузер
 * @param {Object} options - Options
 * @param {string} options.coupon - Coupon code
 * @param {string} options.domain - Domain
 * @param {string} options.filename - Filename
 * @param {string} [options.productUrl] - Product URL (used_on_product_url)
 * @param {Object} [options.siteConfig] - Custom site config
 * @returns {Promise<Object>} Result with applyCouponRequest if valid
 * @throws {Error} If coupon is invalid or validation fails
 */
async function validateCoupon(options) {
  const startTime = Date.now();

  let logs = [];
  let page;
  let currentAction;
  let applyCouponUrl;
  let applyCouponRequest;
  let applyCouponMethod;
  let browser;

  const log = (message) => {
    console.log(message);
    logs.push({ type: 'log', message, timestamp: new Date().toISOString() });
  };

  const error = (message) => {
    console.error(message);
    logs.push({ type: 'error', message, timestamp: new Date().toISOString() });
  };

  async function retryWaitForSelector(page, selector, options = {}, maxAttempts = 3, delayBetween = 1000, required = true) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await page.waitForSelector(selector, options);
      } catch (e) {
        log(`🔁 Attempt ${attempt} failed for selector "${selector}"`);
        if (attempt === maxAttempts || !required) {
          log(`Selector "${selector}" not found after ${maxAttempts} attempts.`);
          return false;
        }
        await new Promise(res => setTimeout(res, delayBetween));
      }
    }
  }

  async function clearSiteStorage(page) {
    log('🧹 [CLEANUP] Starting site data cleanup...');

    try {
      await page.context().clearCookies();
      log('🍪 Cookies cleared');
    } catch (err) {
      log('⚠️ Failed to clear cookies:', err.message);
    }

    await page.evaluate(async () => {
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}

      try {
        if (indexedDB?.databases) {
          const dbs = await indexedDB.databases();
          for (const db of dbs) {
            if (db.name) await new Promise((res, rej) => {
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = req.onerror = req.onblocked = () => res();
            });
          }
        }
      } catch {}

      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      } catch {}

      try {
        if (navigator.serviceWorker?.getRegistrations) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
      } catch {}
    });

    log('✅ [CLEANUP] Cleanup completed');
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  try {
    const {coupon, domain, productUrl, filename, siteConfig: customConfig} = options;

    if (!coupon || !domain || !filename) {
      throw new Error('Missing required parameters: coupon and domain');
    }

    let siteConfig;
    try {
      siteConfig = customConfig || actions.sites?.[domain];
    } catch (e) {
      throw new Error(`Invalid config: ${e.message}`);
    }

    if (!siteConfig) {
      throw new Error(`Domain "${domain}" not found in actions.json`);
    }

    if (typeof productUrl === 'string') {
      siteConfig.productUrl = productUrl;
    }

    log('[⏳] Starting headless-browser...');
    let browserHeadless = process.env.BROWSER_HEADLESS ? process.env.BROWSER_HEADLESS === 'true' : true;

    browser = await firefox.launch({
      headless: browserHeadless
    });

    const browserCtx = await browser.newContext({
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.188 Safari/537.36',
    });

    page = await browserCtx.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {get: () => false});
      window.navigator.chrome = {runtime: {}};
      Object.defineProperty(navigator, 'languages', {get: () => ['en-US', 'en']});
      Object.defineProperty(navigator, 'plugins', {get: () => [1, 2, 3, 4, 5]});
    });

    let couponIsValid = false;

    try {
      applyCouponUrl = sites[domain].applyCouponUrl;
      applyCouponMethod = sites[domain].method ?? "POST";
      log(`[🌐] Go to Website ${siteConfig.productUrl}`);
      await page.goto(siteConfig.productUrl, {waitUntil: 'domcontentloaded', timeout: 180000});
      await page.waitForLoadState('load', {timeout: 10000}).catch(() => {
        log('⚠️ Page load timeout, continuing anyway...');
      });
      await page.waitForTimeout(siteConfig.waitTime);

      page.on('request', request => {
        const url = request.url();
        const method = request.method();
        const postData = request.postData();
        const headers = request.headers();

        if (currentAction === 'checkCoupon' && url.startsWith(applyCouponUrl) && method === applyCouponMethod) {
          applyCouponRequest = {
            domain,
            filename,
            applyCouponUrl: url,
            method,
            headers,
            payload: postData,
            timestamp: new Date().toISOString()
          };
          // console.log("APPLY COUPON REQUEST",applyCouponRequest);
        }
      });

      if (siteConfig?.actions.length) {
        for (let action of siteConfig.actions) {
          log(`[👉] Action: ${action.name}`);
          log(action.event);
          if (action.selectors.length > 0) {
            currentAction = action.name;
            for (let selector of action.selectors) {
              try {
                let issetSelector = await retryWaitForSelector(page, selector, {
                  timeout: action.waitAfter,
                  state: 'attached'
                }, 5, 1000, action.required);
                if (issetSelector) {
                  if (action.type === 'fill') {
                    await page.fill(selector, coupon, {timeout: action.waitAfter});
                    await page.dispatchEvent(selector, 'input');
                    await page.dispatchEvent(selector, 'change');
                  } else if (action.type === 'click') {
                    const el = await page.$(selector);
                    if (el) {
                      await el.evaluate(el => {
                        el.click()
                      });
                    }
                  } else {
                    await page[action.type](selector, {timeout: action.waitAfter, force: true});
                  }
                  if (action.waitAfter) {
                    log(`⏳ Waiting ${action.waitAfter}ms after action`);
                    await new Promise(resolve => setTimeout(resolve, action.waitAfter));
                  }
                }
              } catch (ee) {
                error(`[⚠️] Failed action "${action.name}" on selector "${selector}": ${ee?.message}`);
                break;
              }
            }
          } else {
            try {
              if (action.type === 'goto') {
                await page.goto(action.url, { waitUntil: 'networkidle' });
              }
            } catch (er) {
              error(`[⚠️] Failed action "${action.name}": ${er?.message}`);
              break;
            }
          }
        }
      }

      await page.waitForTimeout(siteConfig.waitTime);

      const element = await page.$(siteConfig.codeValidation.element);
      if (element) {
        const text = await element.innerText();
        if (text.includes(siteConfig.codeValidation.validText)) {
          log('[🎉🎉🎉] Coupon is valid!');
          couponIsValid = true;
        } else {
          log('[❌❌❌] Coupon is not valid.');
        }
      } else {
        log('[❌❌❌] Coupon is not valid.');
      }

      if (siteConfig?.clearCoupon?.actions.length && couponIsValid === true) {
        for (let action of siteConfig?.clearCoupon?.actions) {
          log(`[👉] Clear action: ${action.name}`);
          log(action.event);
          if (action.selectors.length > 0) {
            currentAction = action.name;
            for (let selector of action.selectors) {
              try {
                let issetSelector = await retryWaitForSelector(page, selector, {
                  timeout: action.waitAfter,
                  state: 'attached'
                }, 5, 1000, action.required);
                if (issetSelector) {
                  const el = await page.$(selector);
                  if (el) {
                    await el.evaluate(el => {
                      el.click()
                    });
                  }
                  if (action.waitAfter) {
                    log(`⏳ Waiting ${action.waitAfter}ms after action`);
                    await new Promise(resolve => setTimeout(resolve, action.waitAfter));
                  }
                }
              } catch (ee) {
                error(`[⚠️] Failed clear action "${action.name}" on selector "${selector}": ${ee?.message}`);
                break;
              }
            }
          }
        }
      }

      await page.waitForTimeout(siteConfig.waitTime);

    } catch (err) {
      error(`❌ Unexpected error: ${err?.message}`);
      throw err;
    }

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, {recursive: true});
    }

    const html = await page.content();
    await page.screenshot({path: `${outputDir}/screenshot.png`, fullPage: true});
    fs.writeFileSync(`${outputDir}/html_snapshot.html`, html);
    fs.writeFileSync(`${outputDir}/result.json`, JSON.stringify({logs, couponIsValid}, null, 2));

    // Зберегти applyCouponRequest в temp файл
    if (couponIsValid && applyCouponRequest) {
     await fs.writeFileSync(tempRequestFilePath, JSON.stringify(applyCouponRequest, null, 2));
    }

    await clearSiteStorage(page);

    const endTime = Date.now();
    const duration = endTime - startTime;
    log(`⏱️  Duration: ${formatDuration(duration)}`);

    // Якщо купон НЕ валідний - throw error
    if (!couponIsValid) {
      throw new Error('Coupon is not valid');
    }

    // Якщо валідний - повернути результат
    return {
      success: true,
      coupon: coupon,
      domain: domain,
      applyCouponRequest: applyCouponRequest,
      logs: logs,
      duration: formatDuration(duration),
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    error(`❌ Error: ${err?.message}`);
    throw err;
  } finally {
    if (page) {
      await clearSiteStorage(page);
    }
    if (browser) {
      await browser.close();
    }
  }
}

// Експорт
module.exports = { validateCoupon };