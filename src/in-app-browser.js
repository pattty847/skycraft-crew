// Links opened inside Instagram, Facebook, TikTok and similar apps load in the app's
// own browser: it cannot rotate, keeps its own storage, and would use up an invite
// that then does not carry over to Safari or Chrome. Before joining, offer a way out.
const APPS=[[/Instagram/,'Instagram'],[/FBAN|FBAV|FB_IAB|FBIOS/,'Facebook'],[/musical_ly|BytedanceWebview|TikTok/i,'TikTok'],[/Snapchat/,'Snapchat'],[/LinkedInApp/,'LinkedIn'],[/\bLine\//,'LINE']];
export function inAppBrowser(ua=navigator.userAgent){return APPS.find(([pattern])=>pattern.test(ua))?.[1]??null;}
export function inAppGate(root,ua=navigator.userAgent){
 const app=inAppBrowser(ua);if(!app)return Promise.resolve();
 const url=location.href,ios=/iPhone|iPad|iPod/.test(ua),android=/Android/.test(ua);
 // iOS 17+ opens x-safari-https:// links in Safari; Android hands intent:// links to Chrome.
 const out=ios?url.replace(/^https?:\/\//,'x-safari-https://'):android?`intent://${url.replace(/^https?:\/\//,'')}#Intent;scheme=https;package=com.android.chrome;end`:null;
 root.innerHTML=`<section class="fatal in-app"><h1>Open this in ${ios?'Safari':android?'Chrome':'your browser'}</h1><p>You’re in ${app}’s built-in browser. The island plays best in a real browser: you can turn your phone sideways and add it to your Home Screen.</p>${out?'<a class="primary" data-out>Open in '+(ios?'Safari':'Chrome')+'</a>':''}<button type="button" data-copy>Copy link</button><p class="muted">If that doesn’t work, tap ••• or the share icon in the corner and choose “Open in browser”, or paste the copied link into ${ios?'Safari':'your browser'}.</p><button type="button" data-stay>Play here anyway</button></section>`;
 const section=root.querySelector('.in-app');
 if(out)section.querySelector('[data-out]').href=out;
 section.querySelector('[data-copy]').onclick=async e=>{try{await navigator.clipboard.writeText(url);e.target.textContent='Copied — now paste it in your browser';}catch{prompt('Copy this link:',url);}};
 return new Promise(resolve=>{section.querySelector('[data-stay]').onclick=()=>resolve();});
}
