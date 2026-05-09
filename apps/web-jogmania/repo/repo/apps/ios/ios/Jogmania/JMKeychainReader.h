#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface JMKeychainReader : NSObject

+ (nullable NSString *)valueForKey:(NSString *)key service:(NSString *)service;

@end

NS_ASSUME_NONNULL_END
