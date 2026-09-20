# OFFLOOP (browser extension prototype)

Notices when you have been scrolling for a while on Instagram, YouTube, TikTok, X, Reddit or Facebook,
and asks you to look away. It gets firmer if you keep coming back, and it counts the time you got back.

## Install (Chrome, Edge or Brave on a laptop)
1. Unzip this folder.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped `offloop-extension` folder.
4. Pin the OFFLOOP icon so you can open its popup.

## Try it in 30 seconds
1. Open the OFFLOOP popup and set "Interrupt me after" to **20 seconds (demo)**.
2. Open instagram.com or youtube.com (refresh the tab once) and scroll for 20 seconds.
3. Or open the popup on that tab and tap Gentle, Direct or Quiet to preview each screen.

## What is real and what is not
- Real: scroll detection on those sites, the three interruption levels, the tasks, and the counts in the popup.
- Counts are saved only in your browser (chrome.storage). Nothing is sent anywhere.
- Not built: phone apps. Detecting scrolling inside other phone apps needs a native Android app
  (Usage Access plus an overlay permission). That is the next step, not part of this prototype.
