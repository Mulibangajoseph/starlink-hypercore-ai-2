# STARLINK HYPERCORE AI: Android build guide

This guide wraps the existing web app in an Android app with Capacitor, then builds a signed release.

**No APK is built inside Remix or by the web build.** The repository contains the Capacitor configuration (`capacitor.config.ts`) and this guide. The Android project and the APK are produced on your own machine, with your own signing key, by following the steps below.

## What you need

- A computer with a current Node.js LTS and npm. Check Capacitor's documentation for the minimum versions your Capacitor release requires.
- Android Studio (it bundles the Android SDK) and a JDK, version 21 recommended. `keytool` ships with the JDK.
- The deployed HTTPS address of this app's server (see "Backend connection").

## 1. Install and build the web app

```bash
npm install
npm run build
```

`npm install` also installs `@capacitor/core`, `@capacitor/cli` and `@capacitor/android`, which are listed in `package.json`. The build writes the static files to `dist/`, which is the `webDir` set in `capacitor.config.ts`.

## 2. Add the Android project

```bash
npx cap add android
npx cap sync android
```

- `cap add android` creates the `android/` folder once. The app name `STARLINK HYPERCORE AI`, the app id and `webDir` come from `capacitor.config.ts`.
- Run `npx cap sync android` after every web build to copy `dist/` into the Android project.
- Commit `android/` if you want it in git, but never commit the keystore or passwords (see step 4).

Open it in Android Studio whenever you want to run on a device or emulator:

```bash
npx cap open android
```

## 3. Backend connection

The AI provider keys live only in the server's environment secrets, never in the app package. The packaged Android app is static files, so it must call the deployed server by its full HTTPS address instead of the relative `api/...` paths the website uses.

- `src/native.ts` detects the Capacitor shell and exposes `apiBase()`, which gives the server base URL. Open that file to see where the value comes from, and make sure it resolves to your deployed address before you build the release.
- The server answers same-origin requests and sends no CORS headers. A packaged app calls it from its own origin, so before shipping either allow that origin on the server, or serve the app from the live address. Test a chat request from a real device before you publish.
- The daily per-device usage limit and the 429 message work the same way as on the website.

## 4. Create a signing keystore

Create it once, store it **outside the repository**, and back it up. If you lose it, you cannot update the published app.

```bash
keytool -genkeypair -v \
  -keystore ~/keys/starlink-hypercore-release.jks \
  -alias starlink-hypercore \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` asks for the store password, key password and your name details. Keep the `.jks` file and the passwords in a password manager. Add `*.jks`, `*.keystore` and `keystore.properties` to `.gitignore`.

## 5. Gradle signing from environment variables

Set the values in your shell or CI secrets, never in a committed file:

```bash
export STARLINK_KEYSTORE_PATH="$HOME/keys/starlink-hypercore-release.jks"
export STARLINK_KEYSTORE_PASSWORD="..."
export STARLINK_KEY_ALIAS="starlink-hypercore"
export STARLINK_KEY_PASSWORD="..."
```

In `android/app/build.gradle`, add a `signingConfigs` block inside `android { ... }` and point the `release` build type at it. The names below match the variables above:

```groovy
android {
    // ... generated content ...

    signingConfigs {
        release {
            def keystorePath = System.getenv("STARLINK_KEYSTORE_PATH")
            if (keystorePath) {
                storeFile file(keystorePath)
                storePassword System.getenv("STARLINK_KEYSTORE_PASSWORD")
                keyAlias System.getenv("STARLINK_KEY_ALIAS")
                keyPassword System.getenv("STARLINK_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

Alternative: put the same four values in `~/.gradle/gradle.properties` (your user folder, not the project) and read them with `project.findProperty("STARLINK_KEYSTORE_PATH")`. The rule is the same either way: secrets stay out of git.

If the keystore variable is not set, Gradle produces an unsigned release that Android will not install. Set the variables first.

## 6. Build the signed release

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease     # APK
./gradlew bundleRelease       # AAB, which Google Play requires for new apps
```

Outputs:

- APK: `android/app/build/outputs/apk/release/app-release.apk`
- AAB: `android/app/build/outputs/bundle/release/app-release.aab`

Install the APK on a phone with `adb install -r app-release.apk`, or copy it to the device. Verify the signature with `apksigner verify --verbose app-release.apk` (from the Android SDK build-tools).

Raise `versionCode` and `versionName` in `android/app/build.gradle` for every release you upload.

## 7. Name, icon and splash screen

- The launcher name comes from `appName` in `capacitor.config.ts` (`STARLINK HYPERCORE AI`). If you change it, change it in `android/app/src/main/res/values/strings.xml` too.
- Launcher icons: in Android Studio use **New > Image Asset** and import the artwork from `public/icons/` (the maskable icon for the adaptive foreground). Keep the artwork inside the safe zone.
- Splash screen: Android's splash uses the launcher icon and a background colour. Set the background to the navy theme colour `#050A14` in `android/app/src/main/res/values/styles.xml` or the splash theme Capacitor generates.

## 8. Phone features: what is real

The web app's Settings > Phone integration lists each capability honestly. In a browser, everything except the photo picker reads "Android app only". The native code for the items below is **not included** in this repository. Each one needs native Android code and permissions, which you add to the generated `android/` project.

| Feature | What it takes | Limits |
| --- | --- | --- |
| Camera | Browser: the photo picker with `capture` works already. Native: add `@capacitor/camera` (`npm install @capacitor/camera`, then `npx cap sync`) and declare the camera permission. | Android asks the user at first use. |
| Face recognition | ML Kit Face Detection for analysis, in a custom plugin. BiometricPrompt is only device authentication, not identification. | Needs the explicit consent toggle in Settings. Process on the device and upload nothing. |
| SMS reading and replying | A custom Kotlin or Java plugin using the SMS permissions. | Google Play only allows `READ_SMS` and `SEND_SMS` for apps that are the default SMS handler. Ask to become the default handler first. For one-time codes, use the SMS Retriever API, which needs no permission. |
| Incoming call assistance | `CallScreeningService` (Android 10 and later) with the call-screening role. It can screen and flag calls. | A WebView cannot answer calls. Auto-answering is limited to the default Phone app and is not promised here. |
| Voice assistant | Android's assistant role (`VoiceInteractionService`) or App Actions. | The user must pick the app as the device assistant in system settings. Browser speech input and read-aloud keep working inside the app. |

Add each permission to `android/app/src/main/AndroidManifest.xml` only when its feature is actually built. Extra permissions can make Google Play reject the listing. Explain each one in the app's privacy policy and Play Console data-safety form.

## 9. Security checklist

- Keep the keystore and passwords out of git and out of the web bundle.
- Do not put AI provider keys in `capacitor.config.ts`, `.env` files that Vite bundles, or the Android project. They belong only in the server's environment secrets.
- Use HTTPS only for the server address.
- Test on a real device before publishing: chat streaming, image generation, document upload, voice input and the offline page.

## 10. Publish

1. Build the signed AAB (step 6).
2. Create the app in Google Play Console, and upload the AAB.
3. Fill in the store listing, privacy policy and data-safety form. If you request SMS or call permissions, complete the permissions declaration.
4. Keep any attribution or licence notices the platform requires, and the licence files of the packages the build bundles.
