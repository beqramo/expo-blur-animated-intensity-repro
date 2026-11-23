# expo-blur: animating `intensity` creates a new UIViewPropertyAnimator per frame (iOS)

Minimal reproducer for [expo/expo#54029](https://github.com/expo/expo/issues/54029).

A blank Expo SDK 58 app (from `create-expo-app --template blank-typescript`) with 12 `BlurView`s
whose `intensity` is animated by Reanimated (`useAnimatedProps`). Each intensity change makes
expo-blur's `BlurEffectView` stop its `UIViewPropertyAnimator`, create a new one and set
`fractionComplete` on it. `-[UIViewPropertyAnimator startAnimationAsPaused:]` then runs on the
main thread for every view on every frame. On older iPads this is where production apps hang for
seconds (leaf: `-[UIViewPropertyAnimator _previousAnimatorForKeyPath:inLayer:compoundKeys:]`).

## Versions

- expo 58.0.26, expo-blur 58.0.6, react-native 0.88.1 (New Architecture)
- react-native-reanimated 4.7.1, react-native-worklets 0.13.0
- Measured on Xcode 26.6, iOS 26.5 simulator (iPhone 17), Apple silicon Mac

## Steps

```sh
npm install
npx expo run:ios --configuration Release   # stock expo-blur 58.0.6
# with the app running and animating:
./scripts/measure.sh stock
```

To compare the code on `main` and the proposed fix, swap `BlurEffectView.swift` and rebuild:

```sh
node scripts/use-variant.js main    # expo/expo main before the fix (effect applied in layoutSubviews)
npx expo run:ios --configuration Release && ./scripts/measure.sh main

node scripts/use-variant.js fixed   # main + the fix: reuse the paused animator for intensity-only changes
npx expo run:ios --configuration Release && ./scripts/measure.sh fixed

node scripts/use-variant.js 58.0.6  # back to the published file
```

`scripts/measure.sh` reads the app's CPU time over 20 s and runs macOS `sample` on the app
process for 10 s, then counts the main-thread samples under `BlurEffectView`. The on-screen line
shows UI-thread frame timing from a Reanimated frame callback; the button stops the animation.

## Expected

Changing `intensity` on an existing `BlurView` is cheap: it moves the existing paused animator.

## Actual (stock 58.0.6 and `main`)

Main-thread call tree from `sample`, stock expo-blur 58.0.6:

```
1389 BlurEffectView.draw(_:)  BlurEffectView.swift
  1016 BlurEffectView.draw(_:)  BlurEffectView.swift:56
    945 -[UIViewPropertyAnimator setFractionComplete:]
      938 -[UIViewPropertyAnimator startAnimationAsPaused:]
        861 -[UIViewPropertyAnimator _setupAnimationTracking:]
          ...
            18 -[UIViewPropertyAnimator _previousAnimatorForKeyPath:inLayer:compoundKeys:]
```

Results (12 animated BlurViews, Release build, same simulator):

| `BlurEffectView.swift` | App CPU (one core) | Main-thread samples under `BlurEffectView` in 10 s | under `startAnimationAsPaused:` |
| --- | --- | --- | --- |
| expo-blur 58.0.6 (published) | 22.3 % | 1389 | 938 |
| expo/expo `main` | 25.1 % | 1258 | 852 |
| `main` + fix | 12.0 % | 149 | 0 |

The fast simulator still holds 60 fps, so the cost shows as CPU and main-thread time, not as
dropped frames. On a 2020 iPad the same main-thread work is what production hang reports show.

With the fix the blur still animates, and it keeps animating after the app goes to the
background and returns.

## Fix

In `BlurEffectView`, an intensity-only change sets `fractionComplete` on the existing paused
animator. A new animator is made only for the first effect and for tint changes:

```swift
var intensity: Double = 0.5 {
  didSet {
    if !needsEffectUpdate, let animator, animator.state == .active {
      animator.fractionComplete = CGFloat(intensity)
    } else {
      setNeedsEffectUpdate()
    }
  }
}
```
