/* =========================================================
   patch-android.mjs
   Run AFTER `npx cap add android` + `npx cap sync android`.
   Copies the native sources from ./native into the generated
   ./android project and patches manifest + gradle.
   Fails loudly (exit 1) if an expected anchor is missing, so a
   template change never produces a silently broken APK.
   ========================================================= */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const APP = path.join(ROOT, "android", "app");
const MAIN = path.join(APP, "src", "main");
const RES = path.join(MAIN, "res");
const NATIVE = path.join(ROOT, "native");

function fail(msg) { console.error("✖ patch-android: " + msg); process.exit(1); }
function ok(msg) { console.log("✔ " + msg); }
function read(p) { return fs.readFileSync(p, "utf8"); }
function write(p, s) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); }

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

if (!fs.existsSync(APP)) fail("android/app not found. Run `npx cap add android` first.");

/* ---------- 1. Java sources ---------- */
const mainActivity = walk(path.join(MAIN, "java")).find(p => p.endsWith("MainActivity.java"));
if (!mainActivity) fail("MainActivity.java not found in generated project.");
const javaDir = path.dirname(mainActivity);
const pkgMatch = read(mainActivity).match(/^\s*package\s+([\w.]+)\s*;/m);
if (!pkgMatch) fail("Could not read package name from MainActivity.java.");
const pkg = pkgMatch[1];

// R class lives in the gradle namespace; import it if it differs from pkg.
const nsMatch = read(path.join(APP, "build.gradle")).match(/namespace\s*=?\s*["']([\w.]+)["']/);
const namespace = nsMatch ? nsMatch[1] : pkg;
for (const f of fs.readdirSync(path.join(NATIVE, "java"))) {
  if (!f.endsWith(".java")) continue;
  let src = read(path.join(NATIVE, "java", f))
    .replace(/^package\s+[\w.]+\s*;/m, "package " + pkg + ";");
  if (namespace !== pkg && /\bR\./.test(src)) {
    src = src.replace(/^(package\s+[\w.]+\s*;)/m, "$1\n\nimport " + namespace + ".R;");
  }
  write(path.join(javaDir, f), src);
}
ok("Java sources copied to " + path.relative(ROOT, javaDir) + " (package " + pkg + ")");

/* ---------- 2. Resources ---------- */
// Template ships splash.png in many density folders; we replace it with
// drawable/splash.xml, so remove the PNGs to avoid duplicate resources.
let removed = 0;
for (const p of walk(RES)) {
  if (path.basename(p) === "splash.png") { fs.unlinkSync(p); removed++; }
}
for (const p of walk(path.join(NATIVE, "res"))) {
  const rel = path.relative(path.join(NATIVE, "res"), p);
  fs.mkdirSync(path.dirname(path.join(RES, rel)), { recursive: true });
  fs.copyFileSync(p, path.join(RES, rel));
}
ok("Resources copied (removed " + removed + " template splash.png)");

/* Splash theme: brand background + logo on Android 12+ */
const stylesPath = path.join(RES, "values", "styles.xml");
if (fs.existsSync(stylesPath)) {
  let styles = read(stylesPath);
  const anchor = '<item name="android:background">@drawable/splash</item>';
  if (styles.includes(anchor) && !styles.includes("windowSplashScreenBackground")) {
    styles = styles.replace(anchor, anchor +
      '\n        <item name="windowSplashScreenBackground">@color/rh_splash_bg</item>' +
      '\n        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher_foreground</item>');
    write(stylesPath, styles);
    ok("Splash theme patched");
  }
}

/* ---------- 3. AndroidManifest ---------- */
const manifestPath = path.join(MAIN, "AndroidManifest.xml");
let manifest = read(manifestPath);

const permissions = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK"
];
const permXml = permissions
  .filter(p => !manifest.includes('"' + p + '"'))
  .map(p => '    <uses-permission android:name="' + p + '" />')
  .join("\n");
if (!manifest.includes("</manifest>")) fail("</manifest> not found");
if (permXml) manifest = manifest.replace("</manifest>", permXml + "\n</manifest>");

const receivers = `
        <!-- Rutin Harian: live timer notification -->
        <receiver
            android:name=".LiveTimerReceiver"
            android:exported="false" />
        <receiver
            android:name=".LiveTimerBootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
`;
if (!manifest.includes("LiveTimerReceiver")) {
  if (!manifest.includes("</application>")) fail("</application> not found");
  manifest = manifest.replace("</application>", receivers + "    </application>");
}
write(manifestPath, manifest);
ok("AndroidManifest patched");

/* ---------- 4. app/build.gradle ---------- */
const gradlePath = path.join(APP, "build.gradle");
let gradle = read(gradlePath);
const pkgJson = JSON.parse(read(path.join(ROOT, "package.json")));
const versionName = pkgJson.version || "1.0.0";
const versionCode = parseInt(process.env.RH_VERSION_CODE || "1", 10);

gradle = gradle
  .replace(/versionCode\s+\d+/, "versionCode " + versionCode)
  .replace(/versionName\s+"[^"]*"/, 'versionName "' + versionName + '"');

if (!gradle.includes("signingConfigs {")) {
  const signing = `
    signingConfigs {
        release {
            storeFile file("../../keystore/release.p12")
            storeType "pkcs12"
            storePassword System.getenv("RH_KEYSTORE_PASSWORD") ?: "rutinharian"
            keyAlias "rutinharian"
            keyPassword System.getenv("RH_KEYSTORE_PASSWORD") ?: "rutinharian"
        }
    }
    lint {
        checkReleaseBuilds false
        abortOnError false
    }
`;
  const bt = gradle.indexOf("    buildTypes {");
  if (bt === -1) fail("`buildTypes {` not found in app/build.gradle");
  gradle = gradle.slice(0, bt) + signing.replace(/^\n/, "") + gradle.slice(bt);

  const relRe = /(buildTypes\s*\{\s*release\s*\{)/;
  if (!relRe.test(gradle)) fail("`buildTypes { release {` not found in app/build.gradle");
  gradle = gradle.replace(relRe, "$1\n            signingConfig signingConfigs.release");
}
write(gradlePath, gradle);
ok("app/build.gradle patched (versionName " + versionName + ", versionCode " + versionCode + ")");

if (!fs.existsSync(path.join(ROOT, "keystore", "release.p12"))) {
  fail("keystore/release.p12 missing. The workflow creates it on the first run.");
}
ok("Done");
