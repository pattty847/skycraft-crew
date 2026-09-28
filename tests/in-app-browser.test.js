import test from 'node:test';
import assert from 'node:assert/strict';
import { inAppBrowser } from '../src/in-app-browser.js';
test('in-app browsers from social apps are recognised; real browsers are not',()=>{
 const ig='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.30.94 (iPhone15,2; iOS 18_1; en_US; en; scale=3.00; 1179x2556; 646563209)';
 const fb='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.99;FBBV/620000000]';
 const tiktok='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 musical_ly_2023509030 BytedanceWebview/d8a21c6';
 const safari='Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
 const chrome='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
 assert.equal(inAppBrowser(ig),'Instagram');assert.equal(inAppBrowser(fb),'Facebook');assert.equal(inAppBrowser(tiktok),'TikTok');
 assert.equal(inAppBrowser(safari),null);assert.equal(inAppBrowser(chrome),null);
});
