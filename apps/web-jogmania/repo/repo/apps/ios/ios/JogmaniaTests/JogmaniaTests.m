#import <UIKit/UIKit.h>
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
