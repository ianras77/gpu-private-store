#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface JMWatchSessionBridge : NSObject

- (void)activateIfSupported;
- (void)refreshContext;

@end

NS_ASSUME_NONNULL_END
