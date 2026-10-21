/**
 * Netlify's free tier injects a fixed "Powered by Netlify" badge (iframe#nl-badge-frame)
 * in the bottom-right corner, above everything. While it is on the page we set
 * --badge-space on <html> so bottom bars, the add button and sheet footers sit above it.
 */
const BADGE_ID = 'nl-badge-frame';
const SPACE = '52px';

export function reserveSpaceForNetlifyBadge(): void {
    const sync = () => {
        const present = document.getElementById(BADGE_ID) !== null;
        document.documentElement.style.setProperty('--badge-space', present ? SPACE : '0px');
    };
    sync();
    new MutationObserver(sync).observe(document.body, { childList: true });
}
