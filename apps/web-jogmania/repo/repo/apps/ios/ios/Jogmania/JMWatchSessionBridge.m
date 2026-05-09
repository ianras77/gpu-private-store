#import "JMWatchSessionBridge.h"
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
  NSString *apiBaseURL = configuredURL.length > 0 ? configuredURL : @"http://127.0.0.1:3178";

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
