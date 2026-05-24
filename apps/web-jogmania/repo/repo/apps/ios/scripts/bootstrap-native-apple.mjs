#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const APP_ROOT = path.resolve(__dirname, "..");
const IOS_ROOT = path.join(APP_ROOT, "ios");
const PROJECT_NAME = "Jogmania";
const TEST_TARGET = "JogmaniaTests";
const WATCH_APP_NAME = "JogmaniaWatch";
const WATCH_EXTENSION_NAME = "JogmaniaWatchExtension";
const APP_BUNDLE_ID = "com.jogmania.app";
const WATCH_APP_BUNDLE_ID = `${APP_BUNDLE_ID}.watchkitapp`;
const WATCH_EXTENSION_BUNDLE_ID = `${APP_BUNDLE_ID}.watchkitextension`;
const IOS_DEPLOYMENT_TARGET = "15.1";
const WATCH_DEPLOYMENT_TARGET = "10.0";
const NATIVE_API_BASE_URL = process.env.JOGMANIA_NATIVE_API_BASE_URL ?? "http://127.0.0.1:3178";
const FORCE = process.argv.includes("--force");

function resolvePackageJson(specifier) {
  try {
    return require.resolve(`${specifier}/package.json`, { paths: [APP_ROOT] });
  } catch (error) {
    const pnpmHoistPath = path.resolve(
      APP_ROOT,
      "..",
      "..",
      "node_modules",
      ".pnpm",
      "node_modules",
      specifier,
      "package.json"
    );
    if (fs.existsSync(pnpmHoistPath)) {
      return pnpmHoistPath;
    }
    throw error;
  }
}

const REACT_NATIVE_PACKAGE = resolvePackageJson("react-native");
const REACT_NATIVE_ROOT = path.dirname(REACT_NATIVE_PACKAGE);
const TEMPLATE_ROOT = path.join(REACT_NATIVE_ROOT, "template", "ios");
const XCODE = require(path.dirname(resolvePackageJson("xcode")));

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function writeGeneratedOrTemplate(filePath, templateRelativePath, generatedContents) {
  const templatePath = path.join(APP_ROOT, "native-templates", templateRelativePath);
  if (fs.existsSync(templatePath)) {
    writeFile(filePath, fs.readFileSync(templatePath, "utf8"));
    return;
  }
  writeFile(filePath, generatedContents);
}

function renameIfExists(fromPath, toPath) {
  if (fs.existsSync(fromPath)) {
    fs.renameSync(fromPath, toPath);
  }
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function replaceInTextFiles(dirPath, replacements) {
  const textExtensions = new Set([
    ".h",
    ".m",
    ".mm",
    ".plist",
    ".pbxproj",
    ".storyboard",
    ".xcscheme",
    ".env",
    ".json",
    ".txt",
    ".md"
  ]);

  for (const filePath of walk(dirPath)) {
    const extension = path.extname(filePath);
    const basename = path.basename(filePath);
    const isTextFile = textExtensions.has(extension) || basename === "Podfile";
    if (!isTextFile) continue;

    let next = fs.readFileSync(filePath, "utf8");
    for (const [searchValue, replaceValue] of replacements) {
      next = next.split(searchValue).join(replaceValue);
    }
    fs.writeFileSync(filePath, next);
  }
}

function appInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Jogmania</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleSignature</key>
  <string>????</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>JogmaniaAPIBaseURL</key>
  <string>$(JOGMANIA_API_BASE_URL)</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
  <key>NSHealthShareUsageDescription</key>
  <string>Jogmania reads workout metrics to turn your runs into adventure replays.</string>
  <key>NSHealthUpdateUsageDescription</key>
  <string>Jogmania saves workout sessions so your Apple Watch runs can progress your adventure world.</string>
  <key>NSLocationWhenInUseUsageDescription</key>
  <string>Jogmania uses your location to record run routes and build adventure replays.</string>
  <key>UILaunchStoryboardName</key>
  <string>LaunchScreen</string>
  <key>UIRequiredDeviceCapabilities</key>
  <array>
    <string>armv7</string>
  </array>
  <key>UISupportedInterfaceOrientations</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
  </array>
  <key>UIViewControllerBasedStatusBarAppearance</key>
  <false/>
</dict>
</plist>
`;
}

function podfile() {
  return `require File.join(File.dirname(\`node --print "require.resolve('expo/package.json')"\`), "scripts/autolinking")
require Pod::Executable.execute_command('node', ['-p',
  'require.resolve(
    "react-native/scripts/react_native_pods.rb",
    {paths: [process.argv[1]]},
  )', __dir__]).strip

require 'json'

podfile_properties = JSON.parse(File.read(File.join(__dir__, 'Podfile.properties.json'))) rescue {}

platform :ios, podfile_properties['ios.deploymentTarget'] || '${IOS_DEPLOYMENT_TARGET}'
install! 'cocoapods', :deterministic_uuids => false

prepare_react_native_project!

target '${PROJECT_NAME}' do
  use_expo_modules!
  config = use_native_modules!

  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']

  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => podfile_properties['expo.jsEngine'].nil? || podfile_properties['expo.jsEngine'] == 'hermes',
    :app_path => "\#{Pod::Config.instance.installation_root}/.."
  )

  target '${TEST_TARGET}' do
    inherit! :complete
  end

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false
    )
  end

  post_integrate do |installer|
    begin
      expo_patch_react_imports!(installer)
    rescue => error
      Pod::UI.warn error
    end
  end
end
`;
}

function podfileProperties() {
  return JSON.stringify(
    {
      "expo.jsEngine": "hermes",
      "ios.deploymentTarget": IOS_DEPLOYMENT_TARGET
    },
    null,
    2
  ) + "\n";
}

function appDelegateHeader() {
  return `#import <UIKit/UIKit.h>
#import <Expo/Expo.h>
#import <ExpoModulesCore/EXAppDelegateWrapper.h>

@interface AppDelegate : EXAppDelegateWrapper
@end
`;
}

function appDelegateImplementation() {
  return `#import "AppDelegate.h"
#import "JMWatchSessionBridge.h"

#import <React/RCTBundleURLProvider.h>

@interface AppDelegate ()
@property (nonatomic, strong) JMWatchSessionBridge *watchBridge;
@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"main";
  self.initialProps = @{};
  self.watchBridge = [JMWatchSessionBridge new];
  [self.watchBridge activateIfSupported];

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
  [super applicationDidBecomeActive:application];
  [self.watchBridge refreshContext];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
`;
}

function keychainReaderHeader() {
  return `#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface JMKeychainReader : NSObject

+ (nullable NSString *)valueForKey:(NSString *)key service:(NSString *)service;

@end

NS_ASSUME_NONNULL_END
`;
}

function keychainReaderImplementation() {
  return `#import "JMKeychainReader.h"

#import <Security/Security.h>

@implementation JMKeychainReader

+ (nullable NSString *)valueForKey:(NSString *)key service:(NSString *)service
{
  NSData *encodedKey = [key dataUsingEncoding:NSUTF8StringEncoding];
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: encodedKey,
    (__bridge id)kSecAttrGeneric: encodedKey,
    (__bridge id)kSecReturnData: @YES,
    (__bridge id)kSecMatchLimit: (__bridge id)kSecMatchLimitOne
  };

  CFTypeRef valueRef = nil;
  OSStatus status = SecItemCopyMatching((__bridge CFDictionaryRef)query, &valueRef);
  if (status != errSecSuccess || valueRef == nil) {
    if (valueRef != nil) {
      CFRelease(valueRef);
    }
    return nil;
  }

  NSData *valueData = (__bridge_transfer NSData *)valueRef;
  return [[NSString alloc] initWithData:valueData encoding:NSUTF8StringEncoding];
}

@end
`;
}

function watchSessionBridgeHeader() {
  return `#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface JMWatchSessionBridge : NSObject

- (void)activateIfSupported;
- (void)refreshContext;

@end

NS_ASSUME_NONNULL_END
`;
}

function watchSessionBridgeImplementation() {
  return `#import "JMWatchSessionBridge.h"
#import "JMKeychainReader.h"

#if TARGET_OS_IOS

#import <WatchConnectivity/WatchConnectivity.h>

static NSString *const JMTokenStorageKey = @"jm-token";
static NSString *const JMPhoneDeviceStorageKey = @"jm-phone-device-id";
static NSString *const JMKeychainService = @"app";
static NSString *const JMBootstrapType = @"bootstrap";

@interface JMWatchSessionBridge () <WCSessionDelegate>
@property (nonatomic, strong, nullable) WCSession *session;
@property (nonatomic, strong) NSISO8601DateFormatter *dateFormatter;
@end

@implementation JMWatchSessionBridge

- (instancetype)init
{
  self = [super init];
  if (self) {
    _dateFormatter = [NSISO8601DateFormatter new];
    if ([WCSession isSupported]) {
      _session = [WCSession defaultSession];
      _session.delegate = self;
    }
  }
  return self;
}

- (void)activateIfSupported
{
  if (self.session == nil) {
    return;
  }

  [self.session activateSession];
  [self pushLatestContext];
}

- (void)refreshContext
{
  [self pushLatestContext];
}

- (NSDictionary<NSString *, id> *)bootstrapPayload
{
  NSString *token = [JMKeychainReader valueForKey:JMTokenStorageKey service:JMKeychainService] ?: @"";
  NSString *phoneDeviceId = [JMKeychainReader valueForKey:JMPhoneDeviceStorageKey service:JMKeychainService] ?: @"";
  NSString *configuredURL = [[NSBundle mainBundle] objectForInfoDictionaryKey:@"JogmaniaAPIBaseURL"];
  NSString *apiBaseURL = configuredURL.length > 0 ? configuredURL : @"${NATIVE_API_BASE_URL}";

  return @{
    @"apiBaseUrl": apiBaseURL,
    @"token": token,
    @"phoneDeviceId": phoneDeviceId,
    @"isAuthenticated": @(token.length > 0),
    @"generatedAt": [self.dateFormatter stringFromDate:[NSDate date]]
  };
}

- (void)pushLatestContext
{
  if (self.session == nil) {
    return;
  }

  NSError *contextError = nil;
  [self.session updateApplicationContext:[self bootstrapPayload] error:&contextError];
  (void)contextError;
}

- (void)session:(WCSession *)session didReceiveMessage:(NSDictionary<NSString *, id> *)message replyHandler:(void (^)(NSDictionary<NSString *, id> * _Nonnull))replyHandler
{
  NSString *type = message[@"type"];
  if ([type isEqualToString:JMBootstrapType]) {
    NSDictionary *payload = [self bootstrapPayload];
    [self pushLatestContext];
    replyHandler(payload);
    return;
  }

  replyHandler(@{
    @"ok": @NO,
    @"message": @"Unsupported watch bridge message."
  });
}

- (void)session:(WCSession *)session activationDidCompleteWithState:(WCSessionActivationState)activationState error:(NSError *)error
{
  (void)activationState;
  (void)error;
  [self pushLatestContext];
}

- (void)sessionReachabilityDidChange:(WCSession *)session
{
  (void)session;
  [self pushLatestContext];
}

- (void)sessionDidBecomeInactive:(WCSession *)session
{
  (void)session;
}

- (void)sessionDidDeactivate:(WCSession *)session
{
  (void)session;
  [self.session activateSession];
}

@end

#else

@implementation JMWatchSessionBridge
- (void)activateIfSupported {}
- (void)refreshContext {}
@end

#endif
`;
}

function iosTestsSource() {
  return `#import <UIKit/UIKit.h>
#import <XCTest/XCTest.h>

@interface JogmaniaTests : XCTestCase
@end

@implementation JogmaniaTests

- (void)testApplicationHostsARootViewController
{
  id<UIApplicationDelegate> delegate = UIApplication.sharedApplication.delegate;
  UIWindow *window = delegate.window;

  XCTAssertNotNil(window);
  XCTAssertNotNil(window.rootViewController);
}

@end
`;
}

function watchAppInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Jogmania</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>WKCompanionAppBundleIdentifier</key>
  <string>${APP_BUNDLE_ID}</string>
  <key>WKWatchKitApp</key>
  <true/>
</dict>
</plist>
`;
}

function watchExtensionInfoPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>$(DEVELOPMENT_LANGUAGE)</string>
  <key>CFBundleDisplayName</key>
  <string>Jogmania Watch</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.watchkit</string>
  </dict>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
  <key>NSHealthShareUsageDescription</key>
  <string>Jogmania reads live workout metrics so your runs can become adventure missions.</string>
  <key>NSHealthUpdateUsageDescription</key>
  <string>Jogmania stores watch workouts so your adventure courses and rewards stay in sync.</string>
  <key>NSLocationWhenInUseUsageDescription</key>
  <string>Jogmania uses your location to map your route and build adventure replays.</string>
  <key>WKRunsIndependentlyOfCompanionApp</key>
  <true/>
  <key>WKBackgroundModes</key>
  <array>
    <string>workout-processing</string>
  </array>
</dict>
</plist>
`;
}

function watchEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.healthkit</key>
  <true/>
</dict>
</plist>
`;
}

function watchAssetCatalogContents() {
  return `{
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function watchAppIconContents() {
  return `{
  "images" : [
    {
      "idiom" : "watch",
      "role" : "notificationCenter",
      "scale" : "2x",
      "size" : "24x24",
      "subtype" : "38mm"
    },
    {
      "idiom" : "watch",
      "role" : "notificationCenter",
      "scale" : "2x",
      "size" : "27.5x27.5",
      "subtype" : "42mm"
    },
    {
      "idiom" : "watch",
      "role" : "companionSettings",
      "scale" : "2x",
      "size" : "29x29"
    },
    {
      "idiom" : "watch",
      "role" : "appLauncher",
      "scale" : "2x",
      "size" : "40x40",
      "subtype" : "38mm"
    },
    {
      "idiom" : "watch",
      "role" : "appLauncher",
      "scale" : "2x",
      "size" : "44x44",
      "subtype" : "40mm"
    },
    {
      "idiom" : "watch",
      "role" : "appLauncher",
      "scale" : "2x",
      "size" : "46x46",
      "subtype" : "41mm"
    },
    {
      "idiom" : "watch",
      "role" : "appLauncher",
      "scale" : "2x",
      "size" : "50x50",
      "subtype" : "44mm"
    },
    {
      "idiom" : "watch",
      "role" : "appLauncher",
      "scale" : "2x",
      "size" : "51x51",
      "subtype" : "45mm"
    },
    {
      "idiom" : "watch",
      "role" : "appLauncher",
      "scale" : "2x",
      "size" : "54x54",
      "subtype" : "49mm"
    },
    {
      "idiom" : "watch",
      "role" : "quickLook",
      "scale" : "2x",
      "size" : "86x86",
      "subtype" : "38mm"
    },
    {
      "idiom" : "watch",
      "role" : "quickLook",
      "scale" : "2x",
      "size" : "98x98",
      "subtype" : "42mm"
    },
    {
      "idiom" : "watch",
      "role" : "quickLook",
      "scale" : "2x",
      "size" : "108x108",
      "subtype" : "44mm"
    },
    {
      "idiom" : "watch",
      "role" : "quickLook",
      "scale" : "2x",
      "size" : "117x117",
      "subtype" : "45mm"
    },
    {
      "idiom" : "watch",
      "role" : "quickLook",
      "scale" : "2x",
      "size" : "129x129",
      "subtype" : "49mm"
    },
    {
      "idiom" : "watch-marketing",
      "scale" : "1x",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
`;
}

function watchAppSwift() {
  return `import SwiftUI

@main
struct JogmaniaWatchApp: App {
  var body: some Scene {
    WindowGroup {
      ContentView()
    }
  }
}
`;
}

function modelsSwift() {
  return `import Foundation

struct CompanionBootstrap: Codable {
  let apiBaseUrl: String
  let token: String
  let phoneDeviceId: String
  let isAuthenticated: Bool
  let generatedAt: String
}

struct RouteSummary: Codable, Identifiable, Hashable {
  let id: String
  let name: String
  let is_course: Bool
}

struct WorldSummary: Codable {
  let id: String
  let name: String
  let route_id: String?
}

struct PartySummary: Codable, Identifiable {
  let id: String
  let name: String
  let world: WorldSummary?
}

struct AdventureContext {
  let party: PartySummary?
  let courses: [RouteSummary]
  let activeCourse: RouteSummary?
}

struct DeviceRegisterPayload: Codable {
  let platform: String
  let device_id: String
  let name: String?
  let companion_device_id: String?
  let metadata_json: [String: String]?
}

struct GPSPointPayload: Codable, Identifiable {
  var id: UUID = UUID()
  let lat: Double
  let lon: Double
  let altitude_m: Double?
  let timestamp: String
  let accuracy_m: Double?

  enum CodingKeys: String, CodingKey {
    case lat
    case lon
    case altitude_m
    case timestamp
    case accuracy_m
  }
}

struct WorkoutCreatePayload: Codable {
  let source: String
  let started_at: String
  let ended_at: String
  let duration_s: Int
  let distance_m: Double
  let avg_pace_s_per_km: Double
  let calories_kcal: Double?
  let avg_hr: Double?
  let elevation_gain_m: Double?
  let route_id: String?
  let device_id: String?
  let raw_payload_json: [String: String]
  let gps_points: [GPSPointPayload]
}

struct WorkoutDetail: Codable {
  let id: String
  let raw_payload_json: UploadMetadata?
}

struct UploadMetadata: Codable {
  let progression: ProgressionSummary?
  let world_events: [WorldEventSummary]?
}

struct ProgressionSummary: Codable {
  let points: Int
  let improvement_s_per_km: Double?
  let rewards: [String]
  let inventory: [String: Int]
}

struct WorldEventSummary: Codable, Identifiable {
  let id: String
  let title: String
  let world_id: String
}

struct UploadReport {
  let points: Int
  let rewards: [String]
  let worldEvents: [WorldEventSummary]
}
`;
}

function companionBridgeSwift() {
  return `import Foundation
import WatchConnectivity

@MainActor
final class CompanionBridge: NSObject, ObservableObject {
  @Published private(set) var bootstrap: CompanionBootstrap?
  @Published private(set) var isReachable: Bool = false
  @Published private(set) var lastError: String?

  private let session: WCSession? = WCSession.isSupported() ? WCSession.default : nil

  override init() {
    super.init()
    session?.delegate = self
    session?.activate()
    refreshFromApplicationContext()
  }

  func requestBootstrap(force: Bool = false) async throws -> CompanionBootstrap {
    if !force, let bootstrap {
      return bootstrap
    }

    if let cached = refreshFromApplicationContext() {
      return cached
    }

    guard let session else {
      throw CompanionBridgeError.notSupported
    }

    let payload: CompanionBootstrap = try await withCheckedThrowingContinuation { continuation in
      session.sendMessage(["type": "bootstrap"], replyHandler: { response in
        do {
          let data = try JSONSerialization.data(withJSONObject: response, options: [])
          let decoded = try JSONDecoder().decode(CompanionBootstrap.self, from: data)
          continuation.resume(returning: decoded)
        } catch {
          continuation.resume(throwing: error)
        }
      }, errorHandler: { error in
        continuation.resume(throwing: error)
      })
    }

    bootstrap = payload
    lastError = nil
    return payload
  }

  @discardableResult
  private func refreshFromApplicationContext() -> CompanionBootstrap? {
    guard let session else {
      return nil
    }
    guard !session.receivedApplicationContext.isEmpty else {
      return nil
    }

    do {
      let data = try JSONSerialization.data(withJSONObject: session.receivedApplicationContext, options: [])
      let decoded = try JSONDecoder().decode(CompanionBootstrap.self, from: data)
      bootstrap = decoded
      lastError = nil
      return decoded
    } catch {
      lastError = error.localizedDescription
      return nil
    }
  }
}

extension CompanionBridge: WCSessionDelegate {
  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    Task { @MainActor in
      self.isReachable = session.isReachable
      if let error {
        self.lastError = error.localizedDescription
      }
      _ = self.refreshFromApplicationContext()
    }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    Task { @MainActor in
      self.isReachable = session.isReachable
      _ = self.refreshFromApplicationContext()
    }
  }

  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String : Any]) {
    Task { @MainActor in
      do {
        let data = try JSONSerialization.data(withJSONObject: applicationContext, options: [])
        let decoded = try JSONDecoder().decode(CompanionBootstrap.self, from: data)
        self.bootstrap = decoded
        self.lastError = nil
      } catch {
        self.lastError = error.localizedDescription
      }
    }
  }
}

enum CompanionBridgeError: LocalizedError {
  case notSupported

  var errorDescription: String? {
    switch self {
    case .notSupported:
      return "WatchConnectivity is not supported on this device."
    }
  }
}
`;
}

function apiClientSwift() {
  return `import Foundation

final class JogmaniaAPIClient {
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()
  private let session: URLSession
  private let userDefaults: UserDefaults
  private let watchDeviceIdKey = "JogmaniaWatchDeviceId"

  init(session: URLSession = .shared, userDefaults: UserDefaults = .standard) {
    self.session = session
    self.userDefaults = userDefaults
  }

  var watchDeviceId: String {
    if let existing = userDefaults.string(forKey: watchDeviceIdKey), !existing.isEmpty {
      return existing
    }

    let created = "jm-watch-\\(UUID().uuidString.lowercased())"
    userDefaults.set(created, forKey: watchDeviceIdKey)
    return created
  }

  func loadAdventureContext(bootstrap: CompanionBootstrap) async throws -> AdventureContext {
    async let partiesRequest: [PartySummary] = request("/parties", method: "GET", bootstrap: bootstrap)
    async let routesRequest: [RouteSummary] = request("/routes", method: "GET", bootstrap: bootstrap)

    let parties = try await partiesRequest
    let routes = try await routesRequest
    let courses = routes.filter { $0.is_course }
    let party = parties.first
    let activeCourseId = party?.world?.route_id ?? courses.first?.id
    let activeCourse = courses.first(where: { $0.id == activeCourseId }) ?? courses.first

    return AdventureContext(party: party, courses: courses, activeCourse: activeCourse)
  }

  func enterWorld(partyId: String, routeId: String, bootstrap: CompanionBootstrap) async throws {
    struct Body: Codable {
      let route_id: String
    }

    let body = Body(route_id: routeId)
    let _: WorldSummary = try await request("/parties/\\(partyId)/world/enter", method: "POST", bootstrap: bootstrap, body: body)
  }

  func registerWatchDevice(phoneDeviceId: String?, bootstrap: CompanionBootstrap) async throws {
    let payload = DeviceRegisterPayload(
      platform: "watch",
      device_id: watchDeviceId,
      name: "Jogmania Apple Watch",
      companion_device_id: phoneDeviceId,
      metadata_json: [
        "app": "watchos-companion",
        "native": "true",
        "sync": "companion"
      ]
    )
    let _: EmptyResponse = try await request("/devices/register", method: "POST", bootstrap: bootstrap, body: payload)
  }

  func createWorkout(_ payload: WorkoutCreatePayload, bootstrap: CompanionBootstrap) async throws -> WorkoutDetail {
    try await request("/workouts", method: "POST", bootstrap: bootstrap, body: payload)
  }

  private func request<T: Decodable>(
    _ path: String,
    method: String,
    bootstrap: CompanionBootstrap
  ) async throws -> T {
    try await performRequest(path, method: method, bootstrap: bootstrap, bodyData: nil)
  }

  private func request<T: Decodable, Body: Encodable>(
    _ path: String,
    method: String,
    bootstrap: CompanionBootstrap,
    body: Body
  ) async throws -> T {
    let bodyData = try encoder.encode(body)
    return try await performRequest(path, method: method, bootstrap: bootstrap, bodyData: bodyData)
  }

  private func performRequest<T: Decodable>(
    _ path: String,
    method: String,
    bootstrap: CompanionBootstrap,
    bodyData: Data?
  ) async throws -> T {
    guard let url = URL(string: bootstrap.apiBaseUrl + path) else {
      throw JogmaniaAPIError.invalidBaseURL
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 30
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \\(bootstrap.token)", forHTTPHeaderField: "Authorization")

    if let bodyData {
      request.httpBody = bodyData
    }

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw JogmaniaAPIError.invalidResponse
    }

    guard (200..<300).contains(httpResponse.statusCode) else {
      let detail = try? decoder.decode(APIErrorDetail.self, from: data)
      throw JogmaniaAPIError.server(detail?.detail ?? "Request failed with status \\(httpResponse.statusCode)")
    }

    if T.self == EmptyResponse.self {
      return EmptyResponse() as! T
    }

    return try decoder.decode(T.self, from: data)
  }
}

private struct APIErrorDetail: Decodable {
  let detail: String
}

private struct EmptyResponse: Decodable {}

enum JogmaniaAPIError: LocalizedError {
  case invalidBaseURL
  case invalidResponse
  case server(String)

  var errorDescription: String? {
    switch self {
    case .invalidBaseURL:
      return "The companion app returned an invalid API base URL."
    case .invalidResponse:
      return "The Jogmania API returned an invalid response."
    case .server(let message):
      return message
    }
  }
}
`;
}

function runSessionStoreSwift() {
  return `import CoreLocation
import Foundation
import HealthKit

@MainActor
final class RunSessionStore: NSObject, ObservableObject {
  enum Phase {
    case connecting
    case ready
    case selectingCourse
    case running
    case uploading
    case finished
    case blocked
    case failed
  }

  @Published private(set) var phase: Phase = .connecting
  @Published private(set) var statusMessage: String = "Connecting to your iPhone..."
  @Published private(set) var courses: [RouteSummary] = []
  @Published private(set) var activeCourse: RouteSummary?
  @Published private(set) var primaryParty: PartySummary?
  @Published private(set) var elapsedSeconds: Int = 0
  @Published private(set) var distanceMeters: Double = 0
  @Published private(set) var averageHeartRate: Double?
  @Published private(set) var caloriesBurned: Double?
  @Published private(set) var latestReport: UploadReport?
  @Published private(set) var gpsPoints: [GPSPointPayload] = []
  @Published var errorText: String?

  let companionBridge = CompanionBridge()

  private let healthStore = HKHealthStore()
  private let locationManager = CLLocationManager()
  private let apiClient = JogmaniaAPIClient()
  private let isoFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private var bootstrap: CompanionBootstrap?
  private var workoutSession: HKWorkoutSession?
  private var workoutBuilder: HKLiveWorkoutBuilder?
  private var startedAt: Date?
  private var latestLocation: CLLocation?
  private var timerTask: Task<Void, Never>?
  private var locationAuthorizationContinuation: CheckedContinuation<Void, Error>?

  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
    locationManager.distanceFilter = 5
    locationManager.activityType = .fitness
    locationManager.pausesLocationUpdatesAutomatically = false
  }

  func load() async {
    do {
      let bootstrap = try await companionBridge.requestBootstrap()
      self.bootstrap = bootstrap

      guard bootstrap.isAuthenticated else {
        phase = .blocked
        statusMessage = "Open Jogmania on iPhone and sign in first."
        return
      }

      let context = try await apiClient.loadAdventureContext(bootstrap: bootstrap)
      courses = context.courses
      primaryParty = context.party
      activeCourse = context.activeCourse
      phase = .ready
      statusMessage = activeCourse.map { "Ready for \\($0.name)." } ?? "Ready for your next run."
      errorText = nil
    } catch {
      phase = .failed
      errorText = error.localizedDescription
      statusMessage = "Unable to load companion context."
    }
  }

  func selectCourse(routeId: String) async {
    guard let bootstrap, let party = primaryParty else { return }
    guard let course = courses.first(where: { $0.id == routeId }) else { return }

    do {
      phase = .selectingCourse
      statusMessage = "Switching to \\(course.name)..."
      try await apiClient.enterWorld(partyId: party.id, routeId: routeId, bootstrap: bootstrap)
      activeCourse = course
      phase = .ready
      statusMessage = "\\(course.name) is active."
      errorText = nil
    } catch {
      phase = .failed
      errorText = error.localizedDescription
      statusMessage = "Could not switch courses."
    }
  }

  func startRun() async {
    do {
      if bootstrap == nil {
        try await loadBootstrap()
      }

      guard let bootstrap else {
        throw RunSessionError.missingCompanionContext
      }

      guard bootstrap.isAuthenticated else {
        phase = .blocked
        statusMessage = "Sign in on iPhone first."
        return
      }

      try await requestPermissions()
      try await apiClient.registerWatchDevice(phoneDeviceId: bootstrap.phoneDeviceId.isEmpty ? nil : bootstrap.phoneDeviceId, bootstrap: bootstrap)

      let configuration = HKWorkoutConfiguration()
      configuration.activityType = .running
      configuration.locationType = .outdoor

      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
      session.delegate = self
      builder.delegate = self

      resetRunState()

      let startDate = Date()
      startedAt = startDate
      workoutSession = session
      workoutBuilder = builder
      locationManager.startUpdatingLocation()

      session.startActivity(with: startDate)
      try await beginCollection(builder, at: startDate)

      phase = .running
      statusMessage = "Run in progress on \\(activeCourse?.name ?? "Adventure Course")."
      startTimer()
      errorText = nil
    } catch {
      phase = .failed
      errorText = error.localizedDescription
      statusMessage = "Unable to start the workout."
    }
  }

  func stopRun() {
    guard phase == .running else { return }
    phase = .uploading
    statusMessage = "Finalizing workout..."
    locationManager.stopUpdatingLocation()
    workoutSession?.end()
  }

  private func loadBootstrap() async throws {
    let bootstrap = try await companionBridge.requestBootstrap(force: true)
    self.bootstrap = bootstrap
  }

  private func requestPermissions() async throws {
    let toShare: Set<HKSampleType> = [HKObjectType.workoutType()]
    let toRead: Set<HKObjectType> = [
      HKObjectType.quantityType(forIdentifier: .heartRate)!,
      HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
      HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)!
    ]

    try await withCheckedThrowingContinuation { continuation in
      healthStore.requestAuthorization(toShare: toShare, read: toRead) { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: RunSessionError.permissionsDenied)
        }
      }
    }

    let status = locationManager.authorizationStatus
    if status == .authorizedAlways || status == .authorizedWhenInUse {
      return
    }

    try await withCheckedThrowingContinuation { continuation in
      self.locationAuthorizationContinuation = continuation
      self.locationManager.requestWhenInUseAuthorization()
    }
  }

  private func beginCollection(_ builder: HKLiveWorkoutBuilder, at startDate: Date) async throws {
    try await withCheckedThrowingContinuation { continuation in
      builder.beginCollection(withStart: startDate) { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: RunSessionError.collectionFailed)
        }
      }
    }
  }

  private func endCollection(_ builder: HKLiveWorkoutBuilder, at endDate: Date) async throws {
    try await withCheckedThrowingContinuation { continuation in
      builder.endCollection(withEnd: endDate) { success, error in
        if let error {
          continuation.resume(throwing: error)
        } else if success {
          continuation.resume(returning: ())
        } else {
          continuation.resume(throwing: RunSessionError.collectionFailed)
        }
      }
    }
  }

  private func finishWorkout(_ builder: HKLiveWorkoutBuilder) async throws -> HKWorkout {
    try await withCheckedThrowingContinuation { continuation in
      builder.finishWorkout { workout, error in
        if let error {
          continuation.resume(throwing: error)
        } else if let workout {
          continuation.resume(returning: workout)
        } else {
          continuation.resume(throwing: RunSessionError.finishFailed)
        }
      }
    }
  }

  private func startTimer() {
    timerTask?.cancel()
    timerTask = Task {
      while !Task.isCancelled {
        if let startedAt {
          elapsedSeconds = max(1, Int(Date().timeIntervalSince(startedAt)))
        }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
      }
    }
  }

  private func stopTimer() {
    timerTask?.cancel()
    timerTask = nil
  }

  private func resetRunState() {
    gpsPoints = []
    latestLocation = nil
    latestReport = nil
    elapsedSeconds = 0
    distanceMeters = 0
    averageHeartRate = nil
    caloriesBurned = nil
  }

  private func isoString(from date: Date) -> String {
    isoFormatter.string(from: date)
  }

  private func elevationGain() -> Double {
    guard gpsPoints.count > 1 else { return 0 }
    var gain = 0.0
    for index in 1..<gpsPoints.count {
      guard let previous = gpsPoints[index - 1].altitude_m, let current = gpsPoints[index].altitude_m else {
        continue
      }
      if current > previous {
        gain += current - previous
      }
    }
    return gain
  }

  private func finalizeRun() async {
    guard let bootstrap, let startedAt, let builder = workoutBuilder else {
      phase = .failed
      statusMessage = "Workout session ended unexpectedly."
      return
    }

    do {
      let endDate = Date()
      stopTimer()
      elapsedSeconds = max(1, Int(endDate.timeIntervalSince(startedAt)))

      try await endCollection(builder, at: endDate)
      _ = try await finishWorkout(builder)

      let averageHeartRate = self.averageHeartRate
      let caloriesBurned = self.caloriesBurned
      let elevationGain = elevationGain()
      let pace = distanceMeters > 0 ? Double(elapsedSeconds) / (distanceMeters / 1000) : 0
      let payload = WorkoutCreatePayload(
        source: "watch",
        started_at: isoString(from: startedAt),
        ended_at: isoString(from: endDate),
        duration_s: elapsedSeconds,
        distance_m: distanceMeters,
        avg_pace_s_per_km: pace,
        calories_kcal: caloriesBurned,
        avg_hr: averageHeartRate,
        elevation_gain_m: elevationGain,
        route_id: activeCourse?.id,
        device_id: apiClient.watchDeviceId,
        raw_payload_json: [
          "capture_mode": "watch-native",
          "synced_via": "watchos-native",
          "companion_device_id": bootstrap.phoneDeviceId,
          "course_id": activeCourse?.id ?? "",
          "course_name": activeCourse?.name ?? ""
        ],
        gps_points: gpsPoints
      )

      let detail = try await apiClient.createWorkout(payload, bootstrap: bootstrap)
      latestReport = UploadReport(
        points: detail.raw_payload_json?.progression?.points ?? 0,
        rewards: detail.raw_payload_json?.progression?.rewards ?? [],
        worldEvents: detail.raw_payload_json?.world_events ?? []
      )

      phase = .finished
      statusMessage = "Run uploaded to \\(activeCourse?.name ?? "Adventure Course")."
      errorText = nil
    } catch {
      phase = .failed
      statusMessage = "Run capture finished, but upload failed."
      errorText = error.localizedDescription
    }

    workoutBuilder = nil
    workoutSession = nil
    startedAt = nil
  }
}

extension RunSessionStore: CLLocationManagerDelegate {
  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    Task { @MainActor in
      let status = manager.authorizationStatus
      if status == .authorizedAlways || status == .authorizedWhenInUse {
        locationAuthorizationContinuation?.resume(returning: ())
        locationAuthorizationContinuation = nil
      } else if status == .denied || status == .restricted {
        locationAuthorizationContinuation?.resume(throwing: RunSessionError.permissionsDenied)
        locationAuthorizationContinuation = nil
      }
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    Task { @MainActor in
      for location in locations where location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 65 {
        if let latestLocation {
          distanceMeters += max(0, location.distance(from: latestLocation))
        }

        latestLocation = location
        gpsPoints.append(
          GPSPointPayload(
            lat: location.coordinate.latitude,
            lon: location.coordinate.longitude,
            altitude_m: location.verticalAccuracy >= 0 ? location.altitude : nil,
            timestamp: isoString(from: location.timestamp),
            accuracy_m: location.horizontalAccuracy
          )
        )
      }
    }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    Task { @MainActor in
      self.errorText = error.localizedDescription
    }
  }
}

extension RunSessionStore: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
    Task { @MainActor in
      if toState == .ended {
        await finalizeRun()
      }
      if toState == .running && fromState != .running {
        self.statusMessage = "Workout session is live."
      }
      _ = date
    }
  }

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    Task { @MainActor in
      self.phase = .failed
      self.statusMessage = "Workout session failed."
      self.errorText = error.localizedDescription
      self.stopTimer()
    }
  }
}

extension RunSessionStore: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    Task { @MainActor in
      if let heartRateType = HKQuantityType.quantityType(forIdentifier: .heartRate),
         collectedTypes.contains(heartRateType),
         let statistics = workoutBuilder.statistics(for: heartRateType),
         let quantity = statistics.averageQuantity() {
        self.averageHeartRate = quantity.doubleValue(for: HKUnit(from: "count/min"))
      }

      if let activeEnergyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
         collectedTypes.contains(activeEnergyType),
         let statistics = workoutBuilder.statistics(for: activeEnergyType),
         let quantity = statistics.sumQuantity() {
        self.caloriesBurned = quantity.doubleValue(for: .kilocalorie())
      }
    }
  }
}

enum RunSessionError: LocalizedError {
  case permissionsDenied
  case collectionFailed
  case finishFailed
  case missingCompanionContext

  var errorDescription: String? {
    switch self {
    case .permissionsDenied:
      return "Health or location permissions are missing on Apple Watch."
    case .collectionFailed:
      return "The workout builder could not collect this run."
    case .finishFailed:
      return "The workout finished without a saved HealthKit session."
    case .missingCompanionContext:
      return "Open the Jogmania iPhone app once so the watch can fetch your account context."
    }
  }
}
`;
}

function contentViewSwift() {
  return `import SwiftUI

struct ContentView: View {
  @StateObject private var store = RunSessionStore()
  @State private var selectedCourseId: String = ""

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        statusCard
        coursePicker
        metricsCard
        reportCard
        controls
        if let errorText = store.errorText {
          Text(errorText)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
      .padding()
    }
    .navigationTitle("Jogmania")
    .task {
      await store.load()
      selectedCourseId = store.activeCourse?.id ?? ""
    }
    .onChange(of: store.activeCourse?.id ?? "") { _, next in
      selectedCourseId = next
    }
  }

  private var statusCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Companion")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Text(store.statusMessage)
        .font(.headline)
      Text(store.companionBridge.isReachable ? "iPhone nearby" : "Using cached bridge context")
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var coursePicker: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Adventure Course")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Picker("Course", selection: $selectedCourseId) {
        ForEach(store.courses, id: \\.id) { course in
          Text(course.name).tag(course.id)
        }
      }
      .labelsHidden()
      .disabled(store.phase == .running || store.courses.isEmpty)
      .onChange(of: selectedCourseId) { _, nextValue in
        guard !nextValue.isEmpty, nextValue != store.activeCourse?.id else { return }
        Task {
          await store.selectCourse(routeId: nextValue)
        }
      }
    }
  }

  private var metricsCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Run Stats")
        .font(.caption2)
        .foregroundStyle(.secondary)
      metricRow("Distance", value: String(format: "%.2f km", store.distanceMeters / 1000))
      metricRow("Time", value: formatElapsed(store.elapsedSeconds))
      metricRow("Heart", value: store.averageHeartRate.map { String(format: "%.0f bpm", $0) } ?? "--")
      metricRow("Calories", value: store.caloriesBurned.map { String(format: "%.0f kcal", $0) } ?? "--")
    }
  }

  private var reportCard: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Mission Report")
        .font(.caption2)
        .foregroundStyle(.secondary)
      if let latestReport = store.latestReport {
        Text("+\\(latestReport.points) course points")
          .font(.headline)
        if latestReport.rewards.isEmpty == false {
          Text("Rewards: \\(latestReport.rewards.joined(separator: ", "))")
            .font(.footnote)
        }
        ForEach(latestReport.worldEvents) { event in
          Text("World event: \\(event.title)")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
      } else {
        Text("Complete a watch run to push rewards into your active world.")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
    }
  }

  private var controls: some View {
    VStack(spacing: 8) {
      if store.phase == .running {
        Button("Stop Run") {
          store.stopRun()
        }
        .buttonStyle(.borderedProminent)
        .tint(.red)
      } else {
        Button("Start Run") {
          Task {
            await store.startRun()
          }
        }
        .buttonStyle(.borderedProminent)
      }

      Button("Refresh Companion") {
        Task {
          await store.load()
        }
      }
      .buttonStyle(.bordered)
    }
    .frame(maxWidth: .infinity)
  }

  private func metricRow(_ label: String, value: String) -> some View {
    HStack {
      Text(label)
      Spacer()
      Text(value)
        .monospacedDigit()
    }
    .font(.footnote)
  }

  private func formatElapsed(_ seconds: Int) -> String {
    let minutes = seconds / 60
    let remainder = seconds % 60
    return String(format: "%d:%02d", minutes, remainder)
  }
}
`;
}

function indexJS() {
  return `import "expo-router/entry";
`;
}

function babelConfig() {
  return `module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"]
  };
};
`;
}

function xcodeEnv() {
  return `# This \`.xcode.env\` file is versioned and is used to source the environment
# used when running script phases inside Xcode.
# To customize your local environment, you can create an \`.xcode.env.local\`
# file that is not versioned.

export NODE_BINARY=$(command -v node)
`;
}

function setTargetBuildSettings(project, target, settings) {
  const resolvedTarget = target?.pbxNativeTarget ?? target?.firstTarget ?? target;

  if (!resolvedTarget?.buildConfigurationList) {
    return;
  }

  const configLists = project.pbxXCConfigurationList();
  const buildConfigs = project.pbxXCBuildConfigurationSection();
  const targetConfigList = configLists[resolvedTarget.buildConfigurationList];

  if (!targetConfigList?.buildConfigurations) {
    return;
  }

  for (const buildConfiguration of targetConfigList.buildConfigurations) {
    const buildConfig = buildConfigs[buildConfiguration.value];
    if (!buildConfig?.buildSettings) {
      continue;
    }

    for (const [key, value] of Object.entries(settings)) {
      buildConfig.buildSettings[key] = value;
    }
  }
}

function configureProject() {
  const projectFilePath = path.join(IOS_ROOT, `${PROJECT_NAME}.xcodeproj`, "project.pbxproj");
  const project = XCODE.project(projectFilePath);
  project.parseSync();

  const mainGroupKey = project.getFirstProject().firstProject.mainGroup;
  const appTarget = project.getFirstTarget();
  const appTargetUuid = appTarget.uuid;
  const testsTarget = project.pbxTargetByName(TEST_TARGET);
  const appGroupKey = project.findPBXGroupKey({ name: PROJECT_NAME });
  const resourcesGroupKey =
    project.findPBXGroupKey({ name: "Resources" }) ??
    (() => {
      const resourcesGroup = project.addPbxGroup([], "Resources");
      project.addToPbxGroup(resourcesGroup.uuid, mainGroupKey);
      return resourcesGroup.uuid;
    })();
  void resourcesGroupKey;

  const watchAppGroup = project.addPbxGroup([], WATCH_APP_NAME, WATCH_APP_NAME);
  project.addToPbxGroup(watchAppGroup.uuid, mainGroupKey);
  const watchExtensionGroup = project.addPbxGroup([], WATCH_EXTENSION_NAME, WATCH_EXTENSION_NAME);
  project.addToPbxGroup(watchExtensionGroup.uuid, mainGroupKey);

  const watchAppTarget = project.addTarget(WATCH_APP_NAME, "watch2_app", WATCH_APP_NAME, WATCH_APP_BUNDLE_ID);
  const watchExtensionTarget = project.addTarget(
    WATCH_EXTENSION_NAME,
    "watch2_extension",
    WATCH_EXTENSION_NAME,
    WATCH_EXTENSION_BUNDLE_ID
  );

  project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", watchAppTarget.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", watchAppTarget.uuid);
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", watchAppTarget.uuid);

  project.addBuildPhase([], "PBXSourcesBuildPhase", "Sources", watchExtensionTarget.uuid);
  project.addBuildPhase([], "PBXFrameworksBuildPhase", "Frameworks", watchExtensionTarget.uuid);
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", watchExtensionTarget.uuid);

  project.addHeaderFile("JMKeychainReader.h", {}, appGroupKey);
  project.addSourceFile("JMKeychainReader.m", { target: appTargetUuid }, appGroupKey);
  project.addHeaderFile("JMWatchSessionBridge.h", {}, appGroupKey);
  project.addSourceFile("JMWatchSessionBridge.m", { target: appTargetUuid }, appGroupKey);

  project.addResourceFile("Assets.xcassets", { target: watchAppTarget.uuid }, watchAppGroup.uuid);

  project.addFile("JogmaniaWatchExtension.entitlements", watchExtensionGroup.uuid);
  project.addSourceFile("JogmaniaWatchApp.swift", { target: watchExtensionTarget.uuid }, watchExtensionGroup.uuid);
  project.addSourceFile("Models.swift", { target: watchExtensionTarget.uuid }, watchExtensionGroup.uuid);
  project.addSourceFile("CompanionBridge.swift", { target: watchExtensionTarget.uuid }, watchExtensionGroup.uuid);
  project.addSourceFile("JogmaniaAPIClient.swift", { target: watchExtensionTarget.uuid }, watchExtensionGroup.uuid);
  project.addSourceFile("RunSessionStore.swift", { target: watchExtensionTarget.uuid }, watchExtensionGroup.uuid);
  project.addSourceFile("ContentView.swift", { target: watchExtensionTarget.uuid }, watchExtensionGroup.uuid);

  project.addFramework("Security.framework", { target: appTargetUuid });
  project.addFramework("WatchConnectivity.framework", { target: appTargetUuid });

  project.addFramework("WatchConnectivity.framework", { target: watchExtensionTarget.uuid });
  project.addFramework("HealthKit.framework", { target: watchExtensionTarget.uuid });
  project.addFramework("CoreLocation.framework", { target: watchExtensionTarget.uuid });

  setTargetBuildSettings(project, appTarget, {
    PRODUCT_BUNDLE_IDENTIFIER: APP_BUNDLE_ID,
    INFOPLIST_FILE: `"${PROJECT_NAME}/Info.plist"`,
    MARKETING_VERSION: "0.1.0",
    CURRENT_PROJECT_VERSION: "1",
    JOGMANIA_API_BASE_URL: `"${NATIVE_API_BASE_URL}"`,
    ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "YES",
    EMBEDDED_CONTENT_CONTAINS_SWIFT: "YES",
    IPHONEOS_DEPLOYMENT_TARGET: IOS_DEPLOYMENT_TARGET
  });

  setTargetBuildSettings(project, testsTarget, {
    PRODUCT_BUNDLE_IDENTIFIER: `${APP_BUNDLE_ID}.tests`,
    INFOPLIST_FILE: `"${TEST_TARGET}/Info.plist"`,
    IPHONEOS_DEPLOYMENT_TARGET: IOS_DEPLOYMENT_TARGET
  });

  setTargetBuildSettings(project, watchAppTarget, {
    PRODUCT_BUNDLE_IDENTIFIER: WATCH_APP_BUNDLE_ID,
    INFOPLIST_FILE: `"${WATCH_APP_NAME}/Info.plist"`,
    PRODUCT_NAME: `"${WATCH_APP_NAME}"`,
    SDKROOT: "watchos",
    TARGETED_DEVICE_FAMILY: "4",
    WATCHOS_DEPLOYMENT_TARGET: WATCH_DEPLOYMENT_TARGET,
    ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
    SKIP_INSTALL: "YES",
    ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "YES",
    MARKETING_VERSION: "0.1.0",
    CURRENT_PROJECT_VERSION: "1",
    LD_RUNPATH_SEARCH_PATHS: "\"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks\""
  });

  setTargetBuildSettings(project, watchExtensionTarget, {
    PRODUCT_BUNDLE_IDENTIFIER: WATCH_EXTENSION_BUNDLE_ID,
    INFOPLIST_FILE: `"${WATCH_EXTENSION_NAME}/Info.plist"`,
    PRODUCT_NAME: `"${WATCH_EXTENSION_NAME}"`,
    SDKROOT: "watchos",
    TARGETED_DEVICE_FAMILY: "4",
    WATCHOS_DEPLOYMENT_TARGET: WATCH_DEPLOYMENT_TARGET,
    SKIP_INSTALL: "YES",
    SWIFT_VERSION: "5.0",
    APPLICATION_EXTENSION_API_ONLY: "YES",
    CODE_SIGN_ENTITLEMENTS: `"${WATCH_EXTENSION_NAME}/JogmaniaWatchExtension.entitlements"`,
    ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES: "YES",
    MARKETING_VERSION: "0.1.0",
    CURRENT_PROJECT_VERSION: "1",
    LD_RUNPATH_SEARCH_PATHS: "\"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks\""
  });

  fs.writeFileSync(projectFilePath, project.writeSync());
}

function createProjectScaffold() {
  if (fs.existsSync(IOS_ROOT)) {
    if (!FORCE) {
      throw new Error("apps/ios/ios already exists. Re-run with --force to regenerate the native project.");
    }
    fs.rmSync(IOS_ROOT, { recursive: true, force: true });
  }

  fs.cpSync(TEMPLATE_ROOT, IOS_ROOT, { recursive: true });

  renameIfExists(path.join(IOS_ROOT, "_xcode.env"), path.join(IOS_ROOT, ".xcode.env"));
  renameIfExists(path.join(IOS_ROOT, "HelloWorld"), path.join(IOS_ROOT, PROJECT_NAME));
  renameIfExists(path.join(IOS_ROOT, "HelloWorldTests"), path.join(IOS_ROOT, TEST_TARGET));
  renameIfExists(path.join(IOS_ROOT, TEST_TARGET, "HelloWorldTests.m"), path.join(IOS_ROOT, TEST_TARGET, `${TEST_TARGET}.m`));
  renameIfExists(path.join(IOS_ROOT, "HelloWorld.xcodeproj"), path.join(IOS_ROOT, `${PROJECT_NAME}.xcodeproj`));
  renameIfExists(
    path.join(IOS_ROOT, `${PROJECT_NAME}.xcodeproj`, "xcshareddata", "xcschemes", "HelloWorld.xcscheme"),
    path.join(IOS_ROOT, `${PROJECT_NAME}.xcodeproj`, "xcshareddata", "xcschemes", `${PROJECT_NAME}.xcscheme`)
  );

  replaceInTextFiles(IOS_ROOT, [["HelloWorld", PROJECT_NAME]]);

  writeFile(path.join(IOS_ROOT, "Podfile"), podfile());
  writeFile(path.join(IOS_ROOT, "Podfile.properties.json"), podfileProperties());
  writeFile(path.join(IOS_ROOT, ".xcode.env"), xcodeEnv());
  writeFile(path.join(IOS_ROOT, PROJECT_NAME, "Info.plist"), appInfoPlist());
  writeFile(path.join(IOS_ROOT, PROJECT_NAME, "AppDelegate.h"), appDelegateHeader());
  writeFile(path.join(IOS_ROOT, PROJECT_NAME, "AppDelegate.mm"), appDelegateImplementation());
  writeFile(path.join(IOS_ROOT, PROJECT_NAME, "JMKeychainReader.h"), keychainReaderHeader());
  writeGeneratedOrTemplate(path.join(IOS_ROOT, PROJECT_NAME, "JMKeychainReader.m"), "Jogmania/JMKeychainReader.m", keychainReaderImplementation());
  writeFile(path.join(IOS_ROOT, PROJECT_NAME, "JMWatchSessionBridge.h"), watchSessionBridgeHeader());
  writeFile(path.join(IOS_ROOT, PROJECT_NAME, "JMWatchSessionBridge.m"), watchSessionBridgeImplementation());

  writeFile(path.join(IOS_ROOT, WATCH_APP_NAME, "Info.plist"), watchAppInfoPlist());
  writeFile(path.join(IOS_ROOT, WATCH_APP_NAME, "Assets.xcassets", "Contents.json"), watchAssetCatalogContents());
  writeFile(
    path.join(IOS_ROOT, WATCH_APP_NAME, "Assets.xcassets", "AppIcon.appiconset", "Contents.json"),
    watchAppIconContents()
  );

  writeFile(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "Info.plist"), watchExtensionInfoPlist());
  writeFile(
    path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "JogmaniaWatchExtension.entitlements"),
    watchEntitlements()
  );
  writeFile(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "JogmaniaWatchApp.swift"), watchAppSwift());
  writeGeneratedOrTemplate(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "Models.swift"), "JogmaniaWatchExtension/Models.swift", modelsSwift());
  writeFile(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "CompanionBridge.swift"), companionBridgeSwift());
  writeFile(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "JogmaniaAPIClient.swift"), apiClientSwift());
  writeGeneratedOrTemplate(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "RunSessionStore.swift"), "JogmaniaWatchExtension/RunSessionStore.swift", runSessionStoreSwift());
  writeFile(path.join(IOS_ROOT, WATCH_EXTENSION_NAME, "ContentView.swift"), contentViewSwift());
  writeFile(path.join(IOS_ROOT, TEST_TARGET, `${TEST_TARGET}.m`), iosTestsSource());

  writeFile(path.join(APP_ROOT, "index.js"), indexJS());
  writeFile(path.join(APP_ROOT, "babel.config.js"), babelConfig());
}

function main() {
  createProjectScaffold();
  configureProject();
  console.log(`Created native Apple project at ${path.relative(APP_ROOT, IOS_ROOT)}`);
  console.log(`Open ${path.relative(APP_ROOT, path.join(IOS_ROOT, `${PROJECT_NAME}.xcodeproj`))} in Xcode on macOS.`);
}

main();
