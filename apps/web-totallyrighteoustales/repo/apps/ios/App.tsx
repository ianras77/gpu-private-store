import "react-native-gesture-handler";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./src/lib/supabase";
import { AuthContext } from "./src/lib/auth";
import FeedScreen from "./src/screens/FeedScreen";
import DetailScreen from "./src/screens/DetailScreen";
import ComposeScreen from "./src/screens/ComposeScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import LeaderboardScreen from "./src/screens/LeaderboardScreen";
import LoginScreen from "./src/screens/LoginScreen";
import EditTaleScreen from "./src/screens/EditTaleScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, signOut }}>
      <StatusBar style="dark" />
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#f8f1e7" },
            headerTintColor: "#2c1f1a",
            headerShadowVisible: false
          }}
        >
          <Stack.Screen name="Feed" component={FeedScreen} />
          <Stack.Screen name="Detail" component={DetailScreen} />
          <Stack.Screen name="Compose" component={ComposeScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="EditTale" component={EditTaleScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
