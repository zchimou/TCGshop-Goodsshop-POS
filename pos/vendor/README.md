# Vendored scanner

- Library: `@zxing/browser` **0.2.1** (pinned UMD browser build).
- Source repository: https://github.com/zxing-js/browser
- Download: https://unpkg.com/@zxing/browser@0.2.1/umd/zxing-browser.min.js
- Browser wrapper license: MIT, retained in `zxing-browser-LICENSE`.
- Included `@zxing/library` decoding core: Apache-2.0, retained in `zxing-library-LICENSE`.

Loaded from this project's server only when scanning starts. Images and camera frames are decoded locally. No CDN requests or image uploads are needed at runtime.

Alternatives reviewed: https://github.com/mebjas/html5-qrcode (camera/image and supplied UI, author currently declares maintenance mode); https://github.com/ericblade/quagga2 (focuses on 1D barcodes, QR supplied separately via plugin).

Maintenance limitation: the included JavaScript decoding core https://github.com/zxing-js/library also declares maintenance mode. This is a dependency suitable for the present local prototype, not a promise of an ongoing support roadmap.
