# Local English OCR assets

All assets are served from this directory and cached for offline use. No document
images or text are sent to these source hosts at runtime.

- `tesseract.min.js`, `worker.min.js`: tesseract.js 6.0.1 npm distribution, Apache-2.0; see `tesseract-LICENSE`.
- `tesseract-core-lstm.wasm.js`: tesseract.js-core 6.0.0 npm distribution, embedded non-SIMD LSTM WASM, Apache-2.0; see `core-LICENSE`.
- `eng.traineddata.gz`: `@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz`, the English integer LSTM model (2023 distribution), Apache-2.0; see `tessdata-LICENSE`.

Source: https://github.com/naptha/tesseract.js and https://github.com/tesseract-ocr/tessdata_best

The import pipeline processes pages sequentially and terminates the OCR worker
after each import. Uncertain OCR is exposed in the parent review screen.
