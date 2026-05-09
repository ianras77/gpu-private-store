#import "AppDelegate.h"
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
