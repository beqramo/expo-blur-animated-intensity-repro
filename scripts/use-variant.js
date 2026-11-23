// Copies one BlurEffectView.swift variant into node_modules/expo-blur/ios, then rebuild the app.
//   node scripts/use-variant.js 58.0.6   # the file as published in expo-blur 58.0.6 (default install)
//   node scripts/use-variant.js main     # expo/expo main before the fix (effect applied in layoutSubviews)
//   node scripts/use-variant.js fixed    # main + the proposed fix (reuse the paused animator)
const fs = require('fs');
const path = require('path');

const variant = process.argv[2];
const source = path.join(__dirname, '..', 'variants', `BlurEffectView.${variant}.swift`);
if (!variant || !fs.existsSync(source)) {
  console.error('Usage: node scripts/use-variant.js <58.0.6|main|fixed>');
  process.exit(1);
}
const target = path.join(__dirname, '..', 'node_modules/expo-blur/ios/BlurEffectView.swift');
fs.copyFileSync(source, target);
console.log(`expo-blur BlurEffectView.swift -> ${variant}. Rebuild: npx expo run:ios --configuration Release`);
