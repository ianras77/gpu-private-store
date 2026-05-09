import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: "#0a0b12" },
      headerTintColor: "#f5f7ff",
      tabBarStyle: { backgroundColor: "#121526", borderTopColor: "#1a1f33" },
      tabBarActiveTintColor: "#37e6ff",
      tabBarInactiveTintColor: "#8a91b4"
    }}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="run" options={{ title: "Start Run" }} />
      <Tabs.Screen name="watch" options={{ title: "Watch Sync" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
