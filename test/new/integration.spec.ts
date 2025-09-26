import {
    Prover as _Prover,
    NotaryServer,
    Presentation as _Presentation,
    Commit,
    mapStringToRange,
    subtractRanges,
    Transcript,
    Reveal,
} from '../../src/lib';
import * as Comlink from 'comlink';
import { HTTPParser } from 'http-parser-js';

const { init, Prover, Presentation }: any = Comlink.wrap(
    // @ts-ignore
    new Worker(new URL('../worker.ts', import.meta.url)),
);

function withTimeout<T>(p: Promise<T>, ms: number, label='timeout'): Promise<T> {
    return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(label)), ms);
        p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });
}
console.log('sssssssssssss');
(async function () {
    try {
        await init({ loggingLevel: 'Debug' });
        // @ts-ignore
        console.log('test start');
        console.time('prove');
        const prover = (await new Prover({
            serverDns: 'www.myprotein.ro',
            maxRecvData: 16384,
            maxSentData: 4096,
            network: "Bandwidth",
        })) as _Prover;
        console.log('prover',prover);
        const notary = NotaryServer.from('http://127.0.0.1:7047');
        console.log('333',notary);

        await prover.setup(await notary.sessionUrl());
        console.log('r4');
        // const websocketProxyUrl = 'wss://notary.pse.dev/proxy?token=ethglobal.com';
        const websocketProxyUrl      = 'ws://127.0.0.1:55688';

        console.log('1');
        await prover.sendRequest(websocketProxyUrl, {
            url: 'https://www.myprotein.ro/api/operation/ApplyPromocode/',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
            },
            body: {
                operationName: 'ApplyPromocode',
                variables: {
                    code: 'dd',
                    currency: 'RON',
                    shippingDestination: 'RO',
                    hasSubscriptions: false,
                    enableAdvancedBYOB: false,
                },
            },
            // headers: {
            //     // 'content-type': 'text/html',
            //     secret: 'test_secret',
            // },
        });
        console.log('2');

        const transcript = await prover.transcript();
        const { sent, recv } = transcript;
        const {
            info: recvInfo,
            headers: recvHeaders,
            body: recvBody,
        } = parseHttpMessage(Buffer.from(recv), 'response');
        console.log('3');
        console.log('body',recvBody[0]);


        const body = JSON.parse(recvBody[0].toString());

        const commit: Commit = {
            sent: subtractRanges(
                { start: 0, end: sent.length },
                mapStringToRange(
                    ['secret: test_secret'],
                    Buffer.from(sent).toString('utf-8'),
                ),
            ),
            recv: [
                ...mapStringToRange(
                    [
                        recvInfo,
                        `${recvHeaders[4]}: ${recvHeaders[5]}\r\n`,
                        `${recvHeaders[6]}: ${recvHeaders[7]}\r\n`,
                        `${recvHeaders[8]}: ${recvHeaders[9]}\r\n`,
                        `${recvHeaders[10]}: ${recvHeaders[11]}\r\n`,
                        `${recvHeaders[12]}: ${recvHeaders[13]}`,
                        `${recvHeaders[14]}: ${recvHeaders[15]}`,
                        `${recvHeaders[16]}: ${recvHeaders[17]}`,
                        `${recvHeaders[18]}: ${recvHeaders[19]}`,
                    ],
                    Buffer.from(recv).toString('utf-8'),
                ),
            ],
        };
        console.log('4');

        console.log(commit);
        const notarizationOutput = await prover.notarize(commit);
        const reveal: Reveal = {
            ...commit,
            server_identity: false,
        };
        const presentation = (await new Presentation({
            attestationHex: notarizationOutput.attestation,
            secretsHex: notarizationOutput.secrets,
            reveal: reveal,
            notaryUrl: notary.url,
            websocketProxyUrl: 'wss://notary.pse.dev/proxy',
        })) as _Presentation;
        console.log('presentation:', await presentation.serialize());
        console.timeEnd('prove');
        const json = await presentation.json();

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "proof.json";
        a.click();
        console.time('verify');
        const { transcript: partialTranscript, server_name } =
            await presentation.verify();
        const verifyingKey = await presentation.verifyingKey();
        console.timeEnd('verify');

        console.log('verifyingKey', verifyingKey);
        const t = new Transcript({
            sent: partialTranscript.sent,
            recv: partialTranscript.recv,
        });
        const sentStr = t.sent();
        const recvStr = t.recv();

        console.log("Sent:", sentStr);
        console.log("Received:", recvStr);


        // @ts-ignore
        document.getElementById('integration').textContent = JSON.stringify({
            sent: sentStr,
            recv: recvStr,
            version: json.version,
            meta: json.meta,
            server_name
        }, null, 2);
    } catch (err) {
        console.log('caught error from wasm');
        console.error(err);
        // @ts-ignore
        document.getElementById('integration').textContent = err.message;
    }
})();

function parseHttpMessage(buffer: Buffer, type: 'request' | 'response') {
    const parser = new HTTPParser(
        type === 'request' ? HTTPParser.REQUEST : HTTPParser.RESPONSE,
    );
    const body: Buffer[] = [];
    let complete = false;
    let headers: string[] = [];

    parser.onBody = (t) => {
        body.push(t);
    };

    parser.onHeadersComplete = (res) => {
        headers = res.headers;
    };

    parser.onMessageComplete = () => {
        complete = true;
    };

    parser.execute(buffer);
    parser.finish();

    if (!complete) throw new Error(`Could not parse ${type.toUpperCase()}`);

    return {
        info: buffer.toString('utf-8').split('\r\n')[0] + '\r\n',
        headers,
        body,
    };
}
