import {
  Commit,
  mapStringToRange,
  NotaryServer,
  Presentation as _Presentation,
  Prover as _Prover,
  Reveal,
  subtractRanges,
  Transcript
} from '../../src/lib';
import * as Comlink from 'comlink';
import { HTTPParser } from 'http-parser-js';


const { init, Prover, Presentation }: any = Comlink.wrap(
  // @ts-ignore
  new Worker(new URL('../worker.ts', import.meta.url)),
);

interface RuntimeConfig {
  domain: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body: any;
  headers: Record<string, string>;
  cookies: string;
  notaryUrl: string;
  proxyUrl: string;
  maxSentData: number;
  maxRecvData: number;
  outputFile?: string;
  filename?: string;
}

function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (err) {
    throw new Error(`Invalid URL: ${url}`);
  }
}

function getTargetDomain(): string {
  // Метод 1: З window (встановлюється wrapper)
  if (window.__TARGET_DOMAIN__) {
    console.log('✅ Got TARGET_DOMAIN from window:', window.__TARGET_DOMAIN__);
    return window.__TARGET_DOMAIN__;
  }

  // Метод 2: З URL параметрів
  const params = new URLSearchParams(window.location.search);
  const urlDomain = params.get('domain');
  if (urlDomain) {
    console.log('✅ Got TARGET_DOMAIN from URL:', urlDomain);
    return urlDomain;
  }

  throw new Error(
    '❌ TARGET_DOMAIN not provided.\n' +
    'window.__TARGET_DOMAIN__ = ' + (window.__TARGET_DOMAIN__ || 'undefined')
  );
}

async function getSiteConfig(): Promise<RuntimeConfig> {
  let requestData = null;
  try {
    const response = await fetch('http://localhost:3001/api/request-data');
    const responseData = await response.json();
    if (response.ok) {
      requestData = responseData;
    }
    console.log('REQUEST DATA FETCH:', requestData)
  } catch (err) {
    console.log('REQUEST DATA FETCH ERROR:', err)
  }

  const targetDomain = getTargetDomain();
  console.log('TARGET_DOMAIN:', targetDomain || 'not provided');

  const siteConfig = requestData;

  if (!siteConfig) {
    throw new Error(
      `❌ Configuration not found for domain: ${targetDomain}`
    );
  }

  const domain = extractDomainFromUrl(siteConfig.applyCouponUrl);
  const defaults = {
    // notaryUrl: 'http://127.0.0.1:7047',
    notaryUrl: 'http://notary-server:7047',
    proxyUrl: 'ws://127.0.0.1:55688',
    maxSentData: 4096,
    maxRecvData: 16384,
  };

  if(siteConfig === requestData) {
    console.log('requestData SELECTED')
  } else {
    console.log('NO REQUEST DATA. siteConfig SELECTED')
  }

  let method = 'POST';
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
  if (siteConfig?.method && allowedMethods.includes(siteConfig.method)) {
    method = siteConfig.method;
  }

  return {
    domain: domain,
    url: siteConfig.applyCouponUrl,
    method,
    body: requestData ? JSON.parse(siteConfig.payload) : siteConfig.payload,
    headers: siteConfig.headers || {
      'content-type': 'application/json',
    },
    cookies: siteConfig?.cookies || '',
    notaryUrl: defaults.notaryUrl!,
    proxyUrl: defaults.proxyUrl!,
    maxSentData: defaults.maxSentData!,
    maxRecvData: defaults.maxRecvData!,
    filename: siteConfig.filename,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(label)), ms);
    p.then(
      v => { clearTimeout(t); res(v); },
      e => { clearTimeout(t); rej(e); }
    );
  });
}

(async function () {
  let siteConfig: RuntimeConfig;

  try {
    siteConfig = await getSiteConfig();

    console.log('SITE CONFIG', siteConfig)
  } catch (err: any) {
    console.error(err.message);
    // @ts-ignore
    const resultElement = document.getElementById('integration');
    if (resultElement) {
      resultElement.textContent = err.message;
    }
    throw err;
  }

  // Виводимо інформацію про конфігурацію
  console.log('\n🚀 TLSNotary Integration Test');
  console.log('═══════════════════════════════════════');
  console.log('🎯 Domain:     ', siteConfig.domain);
  console.log('📥 Filename:   ', siteConfig.filename);
  console.log('🌐 URL:        ', siteConfig.url);
  console.log('📡 Method:     ', siteConfig.method);
  console.log('🔐 Notary:     ', siteConfig.notaryUrl);
  console.log('🌉 Proxy:      ', siteConfig.proxyUrl);
  console.log('📤 Max Sent:   ', siteConfig.maxSentData, 'bytes');
  console.log('📥 Max Recv:   ', siteConfig.maxRecvData, 'bytes');

  console.log('═══════════════════════════════════════');
  console.log('📦 Payload:');
  console.log(JSON.stringify(siteConfig.body, null, 2));
  console.log('═══════════════════════════════════════\n');

  try {
    // Ініціалізація
    console.log('⏳ Initializing WASM...');
    await init({ loggingLevel: 'Debug' });
    console.log('✅ WASM initialized');

    console.time('⏱️  Total time');
    console.time('🔧 Setup time');

    // Створення Prover
    console.log('⏳ Creating Prover...');
    const prover = (await new Prover({
      serverDns: siteConfig.domain,
      maxRecvData: siteConfig.maxRecvData,
      maxSentData: siteConfig.maxSentData,
      network: "Bandwidth",
      timeout: 120000,
    })) as _Prover;
    console.log('✅ Prover created');

    // Підключення до Notary
    console.log('⏳ Connecting to Notary Server...');
    const notary = NotaryServer.from(siteConfig.notaryUrl);
    const sessionUrl = await notary.sessionUrl();
    await prover.setup(sessionUrl);
    console.log('✅ Connected to Notary');

    console.timeEnd('🔧 Setup time');

    // Відправка запиту
    console.log('⏳ Sending request...');
    console.log('   URL:', siteConfig.url);
    console.log('   Method:', siteConfig.method);
    console.time('🌐 Request time');

    const requestOptions: any = {
      url: siteConfig.url,
      method: siteConfig.method,
      headers: siteConfig.headers,
    };

    // Додаємо body тільки якщо не GET
    if (siteConfig.method !== 'GET' && siteConfig.body) {
      requestOptions.body = siteConfig.body;
      console.log('   Body:', JSON.stringify(siteConfig.body).substring(0, 100) + '...');
    }

    await prover.sendRequest(siteConfig.proxyUrl, requestOptions);
    console.log('✅ Request sent');
    console.timeEnd('🌐 Request time');

    // Отримання transcript
    console.log('⏳ Getting transcript...');
    const transcript = await prover.transcript();
    const { sent, recv } = transcript;
    console.log('✅ Transcript received');
    console.log('   📤 Sent:', sent.length, 'bytes');
    console.log('   📥 Received:', recv.length, 'bytes');

    // Парсинг HTTP відповіді
    console.log('⏳ Parsing response...');
    const {
      info: recvInfo,
      headers: recvHeaders,
      body: recvBody,
    } = parseHttpMessage(Buffer.from(recv), 'response');
    console.log('✅ Response parsed');
    console.log('   Status:', recvInfo.trim());
    let parsedBody = null;
    // Спроба парсити JSON body
    if (recvBody && recvBody[0]) {
      try {
        parsedBody = JSON.parse(recvBody[0]?.toString());
        console.log('✅ JSON body parsed');
        console.log('   Response preview:', JSON.stringify(parsedBody).substring(0, 200) + '...');
      } catch (err) {
        console.log('ℹ️  Response is not JSON');
        parsedBody = recvBody[0]?.toString();
        console.log('   Response preview:', parsedBody.substring(0, 200) + '...');
      }
    }


    // Створення commitment
    console.log('⏳ Creating commitment...');
    const commit: Commit = {
      sent: subtractRanges(
        { start: 0, end: sent.length },
        mapStringToRange(
          [], // Можна додати речі для приховування
          Buffer.from(sent).toString('utf-8'),
        ),
      ),
      recv: [
        ...mapStringToRange(
          [
            recvInfo,
            // Показуємо перші заголовки
            ...recvHeaders.slice(0, Math.min(20, recvHeaders.length))
              .reduce((acc, header, i, arr) => {
                if (i % 2 === 0 && arr[i + 1]) {
                  acc.push(`${header}: ${arr[i + 1]}\r\n`);
                }
                return acc;
              }, [] as string[]),
          ],
          Buffer.from(recv).toString('utf-8'),
        ),
      ],
    };
    console.log('✅ Commitment created');

    // Нотаризація
    console.log('⏳ Notarizing...');
    console.time('🔐 Notarization time');
    const notarizationOutput = await prover.notarize(commit);
    console.timeEnd('🔐 Notarization time');
    console.log('✅ Notarization complete');

    // Створення Presentation
    console.log('⏳ Creating presentation...');
    const reveal: Reveal = {
      ...commit,
      server_identity: false,
    };

    const presentation = (await new Presentation({
      attestationHex: notarizationOutput.attestation,
      secretsHex: notarizationOutput.secrets,
      reveal: reveal,
      notaryUrl: notary.url,
      websocketProxyUrl: siteConfig.proxyUrl,
    })) as _Presentation;
    console.log('✅ Presentation created');

    // Серіалізація
    const serialized = await presentation.serialize();
    console.log('📦 Serialized size:', serialized.length, 'bytes');

    // Експорт JSON
    const json = await presentation.json();


    //Генеруємо ім'я файлу
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const domainKey = process.env.TARGET_DOMAIN || siteConfig.domain;
    const fileName = `${siteConfig.filename}.json` || `proof_${domainKey}_${timestamp}.json`;

//Відправка на сервер
    await fetch('http://localhost:3001/api/save-proof', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: fileName,
        data: json,
      }),
    }).then(res => res.json())
      .then(res => console.log('💾 SERVER response:', res))
      .catch(err => console.error('❌ Failed to save proof on server:', err));

    console.log('💾 Proof sent to server for saving');

    // Верифікація
    console.log('⏳ Verifying...');
    console.time('✅ Verification time');
    const { transcript: partialTranscript, server_name } =
      await presentation.verify();
    const verifyingKey = await presentation.verifyingKey();
    console.timeEnd('✅ Verification time');
    console.log('✅ Verification successful');
    console.log('   Server:', server_name);
    console.log('   Verifying Key:', verifyingKey);

      // Відображення результату
      const t = new Transcript({
        sent: partialTranscript?.sent,
        recv: partialTranscript?.recv,
      });
      const sentStr = t.sent();
      const recvStr = t.recv();

      console.log('\n📊 Results:');
      console.log('═══════════════════════════════════════');
      console.log('📤 Sent:\n', sentStr.substring(0, 500), sentStr.length > 500 ? '...' : '');
      console.log('───────────────────────────────────────');
      console.log('📥 Received:\n', recvStr.substring(0, 500), recvStr.length > 500 ? '...' : '');
      console.log('═══════════════════════════════════════\n');


    console.timeEnd('⏱️  Total time');

    // Відобразити на сторінці
    // @ts-ignore
    const resultElement = document.getElementById('integration');
    if (resultElement) {
      resultElement.textContent = JSON.stringify({
        success: true,
        domain: siteConfig.domain,
        url: siteConfig.url,
        sent: sentStr,
        recv: recvStr,
        parsedResponse: parsedBody ?? null,
        version: json.version,
        meta: json.meta,
        server_name,
        verifyingKey,
        stats: {
          sentBytes: sent.length,
          recvBytes: recv.length,
          proofSize: serialized.length,
        },
      }, null, 2);
    }

    console.log('✅ All done!');

  } catch (err: any) {
    console.error('\n❌ Error occurred:');
    console.error('═══════════════════════════════════════');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    console.error('═══════════════════════════════════════\n');

    // @ts-ignore
    const resultElement = document.getElementById('integration');
    if (resultElement) {
      resultElement.textContent = JSON.stringify({
        success: false,
        domain: siteConfig?.domain,
        url: siteConfig?.url,
        error: err.message,
        stack: err.stack,
      }, null, 2);
    }

    throw err;
  }
})();

function parseHttpMessage(buffer: Buffer, type: 'request' | 'response') {
  const parser = new HTTPParser(
    type === 'request' ? HTTPParser.REQUEST : HTTPParser.RESPONSE,
  );
  const body: Buffer[] = [];
  let complete = false;
  let headers: string[] = [];

  parser.onBody = (chunk: Buffer) => {
    body.push(chunk);
  };

  parser.onHeadersComplete = (res: any) => {
    headers = res.headers || [];
  };

  parser.onMessageComplete = () => {
    complete = true;
  };

  parser.execute(buffer);
  parser.finish();

  if (!complete) {
    throw new Error(`Could not parse ${type.toUpperCase()}`);
  }

  return {
    info: buffer.toString('utf-8').split('\r\n')[0] + '\r\n',
    headers,
    body,
  };
}