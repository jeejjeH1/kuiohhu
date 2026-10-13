#!/usr/bin/env bash
# Downloads animated Noto Emoji (Apache-2.0) as Lottie JSON into data/lottie/<codepoints>.json
cd "$(dirname "$0")/.."
mkdir -p data/lottie
for cp in 1f600 1f602 1f60d 1f970 1f60e 1f929 1f973 1f609 1f44d 1f44f 1f64c 1f525 2764 1f496 2728 2b50 1f389 1f38a 1f381 1f388 1f382 1f680 1f4a1 1f3af 1f4af 2705 274c 1f44b 1f92f 1f631 1f60a 1f614 1f648 1f4aa 1f308 2600 1f319 26a1 1f30a 1f338 1f33a 1f98b 1f436 1f431 1f47b 1f916 1f47d 1f4e2 1f4c8 1f6d2; do
  curl -fsSL -o "data/lottie/$cp.json" "https://fonts.gstatic.com/s/e/notoemoji/latest/$cp/lottie.json" || echo "skip $cp"
done
