// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import "../global.css";

import { useColorScheme } from "@/hooks/use-color-scheme";

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerTitleAlign: "center" }}>
        <Stack.Screen name="index" options={{ title: "UniFood" }} />

        {/* Cliente (tabs) */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(cliente)" options={{ headerShown: false }} />

        {/* Roles */}
        <Stack.Screen name="(cocina)/index" options={{ headerShown: false }} />
        <Stack.Screen name="(cajero)/index" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)/index" options={{ title: "Admin" }} />

        {/* Opcional: modal template */}
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
      </Stack>

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}