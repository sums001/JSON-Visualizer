# JSON Prism privacy policy

_Last updated: 1 November 2026_

JSON Prism is a Chrome extension that shows JSON documents in an interactive viewer. This policy explains what the extension does with your data. In short: it does not collect, store, sell or send your data anywhere.

## What the extension reads

- **Page type.** On every page, the extension's content script checks the page's content type (for example `application/json` or `text/plain`). On any other kind of page it stops there and reads nothing else.
- **JSON responses.** When a page is JSON, the extension reads the response text and displays it in the viewer, inside your browser. The text is never sent to the developer or to anyone else, and it is not kept after you leave the page.

## What the extension stores

- **Settings.** Your choices on the settings page (how JSON pages open, plain-text detection, the first view) are saved with `chrome.storage.sync`. If you are signed in to Chrome with sync turned on, Chrome syncs these settings between your own devices through your Google account. They contain no personal information.
- **Theme.** Your light or dark theme choice is saved in the extension's local storage on your device.

## Network requests

- **Fonts.** The viewer and settings pages load the Geist typeface from Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). As with any website that uses Google Fonts, Google receives your IP address and browser details when the font is downloaded. The request does not include the JSON you are viewing or the address of the page it came from. See the [Google Fonts privacy FAQ](https://developers.google.com/fonts/faq/privacy).
- **Fetch a URL.** In the extension's own tab you can type a URL to load JSON from. Your browser then requests that URL directly. The extension makes this request only when you ask it to.

The extension makes no other network requests. It has no analytics, tracking, advertising or remote code.

## Data sharing

The developer does not collect any user data, so there is nothing to share, sell or transfer to third parties.

## Permissions

- `storage`: saves your settings.
- Content script on all sites: JSON can be served from any address, so the extension needs to check each page's content type to know whether to open the viewer.

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

Questions or concerns: open an issue at [github.com/sums001/JSON-Visualizer/issues](https://github.com/sums001/JSON-Visualizer/issues).
