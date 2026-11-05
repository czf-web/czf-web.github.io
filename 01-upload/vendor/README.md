# Vendored OCR resources

All assets are served from this directory. No CDN is required at runtime.

- `tesseract/`: Tesseract.js **7.0.0**, npm distribution, Apache-2.0. https://github.com/naptha/tesseract.js/tree/v7.0.0
- `tesseract/core/`: tesseract.js-core **7.0.0**, npm distribution, Apache-2.0. Includes six WASM wrapper variants and the corresponding WASM binaries. https://github.com/naptha/tesseract.js-core
- `tesseract/lang/chi_sim.traineddata.gz` and `eng.traineddata.gz`: fast LSTM language data from https://tessdata.projectnaptha.com/4.0.0_fast/ , based on the Apache-2.0 Tesseract language datasets. https://github.com/tesseract-ocr/tessdata_fast

`tesseract/LICENSE.md` and `tesseract/core/LICENSE` contain the bundled licenses; minified bundles also include their third-party license files. The language datasets are covered by Apache-2.0, whose text is included in `tesseract/core/LICENSE`.

`manifest.json` records SHA-256 hashes for all vendored files (excluding this README and the manifest itself). Regenerate after intentionally updating assets; update `sw.js`'s cache version at the same time.
