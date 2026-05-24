#import "JMKeychainReader.h"

#import <Security/Security.h>

@implementation JMKeychainReader

+ (nullable NSString *)valueForKey:(NSString *)key service:(NSString *)service
{
  NSDictionary *query = @{
    (__bridge id)kSecClass: (__bridge id)kSecClassGenericPassword,
    (__bridge id)kSecAttrService: service,
    (__bridge id)kSecAttrAccount: key,
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
